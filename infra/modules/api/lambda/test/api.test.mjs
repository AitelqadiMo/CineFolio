// node --test — full route-level tests against a fake ctx (in-memory DDB/S3/KVS).
// Verifies the behaviors that matter in production: idempotency, auth boundaries,
// immutable releases + pointer flips, rollback, callback validation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeHandler } from "../index.mjs";

// ---------- fakes ----------
function fakeCtx(overrides = {}) {
  const store = new Map(); // "PK|SK" -> item
  const kv = (i) => `${i.PK}|${i.SK}`;
  const ddb = {
    async get(Key) { return store.get(`${Key.PK}|${Key.SK}`) || null; },
    async put(Item, condition) {
      if (condition === "attribute_not_exists(PK)" && store.has(kv(Item))) {
        throw Object.assign(new Error("exists"), { name: "ConditionalCheckFailedException" });
      }
      store.set(kv(Item), structuredClone(Item));
    },
    async update({ Key, UpdateExpression, ExpressionAttributeValues = {}, ExpressionAttributeNames = {}, ConditionExpression }) {
      const k = `${Key.PK}|${Key.SK}`;
      const item = store.get(k) || { ...Key };
      if (ConditionExpression === "attribute_exists(PK)" && !store.has(k)) {
        throw Object.assign(new Error("missing"), { name: "ConditionalCheckFailedException" });
      }
      if (ConditionExpression === "releases = :prev" && (item.releases || 0) !== ExpressionAttributeValues[":prev"]) {
        throw Object.assign(new Error("stale"), { name: "ConditionalCheckFailedException" });
      }
      if (ConditionExpression === "attribute_not_exists(aiCuts) OR aiCuts < :max"
        && item.aiCuts !== undefined && item.aiCuts >= ExpressionAttributeValues[":max"]) {
        throw Object.assign(new Error("spent"), { name: "ConditionalCheckFailedException" });
      }
      // micro-interpreter for the SET/ADD expressions we actually use
      const resolve = (n) => ExpressionAttributeNames[n] || n;
      for (const clause of UpdateExpression.split(/SET|ADD/).filter(Boolean).map((c) => c.trim())) {
        for (const part of clause.split(",").map((p) => p.trim()).filter(Boolean)) {
          if (part.includes("=")) {
            const [lhs, rhs] = part.split("=").map((x) => x.trim());
            item[resolve(lhs)] = ExpressionAttributeValues[rhs];
          } else {
            const m = part.match(/^(\S+)\s+(:\S+)$/); // ADD #c :one
            if (m) item[resolve(m[1])] = (item[resolve(m[1])] || 0) + ExpressionAttributeValues[m[2]];
          }
        }
      }
      store.set(k, item);
      return item;
    },
    async del(Key) { store.delete(`${Key.PK}|${Key.SK}`); },
    async query({ IndexName, ExpressionAttributeValues: v, KeyConditionExpression }) {
      const items = [...store.values()];
      if (IndexName === "GSI1") return items.filter((i) => i.GSI1PK === v[":p"] && (!v[":s"] || String(i.GSI1SK).startsWith(v[":s"])));
      if (IndexName === "GSI2") return items.filter((i) => i.GSI2PK === v[":p"]);
      if (KeyConditionExpression?.includes("begins_with")) return items.filter((i) => i.PK === v[":p"] && String(i.SK).startsWith(v[":s"]));
      return items.filter((i) => i.PK === v[":p"]);
    },
    _store: store,
  };
  const s3store = new Map();
  const ctx = {
    ddb,
    s3: {
      async putObject(b, k, body) { s3store.set(`${b}/${k}`, body); },
      async getObjectText(b, k) { if (!s3store.has(`${b}/${k}`)) throw new Error("NoSuchKey"); return s3store.get(`${b}/${k}`); },
      async getObjectBytes(b, k) { if (!s3store.has(`${b}/${k}`)) throw new Error("NoSuchKey"); const v = s3store.get(`${b}/${k}`); return Buffer.isBuffer(v) ? v : Buffer.from(String(v)); },
      async copyObject(b, from, to) { s3store.set(`${b}/${to}`, s3store.get(`${b}/${from}`)); },
      async copyObjectAcross(fb, from, tb, to) { s3store.set(`${tb}/${to}`, s3store.get(`${fb}/${from}`)); },
      async deleteObject(b, k) { s3store.delete(`${b}/${k}`); },
      _store: s3store,
    },
    kvs: { puts: [], dels: [], async put(_a, k, val) { this.puts.push([k, val]); }, async del(_a, k) { this.dels.push(k); } },
    cdn: { invalidations: [], async invalidate(_d, p) { this.invalidations.push(p); } },
    queue: { sent: [], async send(_u, m) { this.sent.push(m); } },
    sfn: { resumed: [], async sendTaskSuccess(t, o) { this.resumed.push([t, o]); } },
    secrets: async () => ({ AGENT_WEBHOOK_URL: "https://agent.example/hook", AGENT_WEBHOOK_SECRET: "whsec", CF_CALLBACK_SECRET: "cbsec" }),
    fetchFn: async () => ({ ok: true }),
    config: { appEnv: "test", apiBase: "https://api.test", artifactsBucket: "arts", publishedBucket: "pub", kvsArn: "arn:kvs", distributionId: "DIST", cdnDomain: "cdn.test", ordersQueueUrl: "q" },
    ...overrides,
  };
  return ctx;
}

const ev = (routeKey, { body, headers = {}, qs, path, claims, groups } = {}) => ({
  requestContext: {
    routeKey,
    http: { method: routeKey.split(" ")[0], path: routeKey.split(" ")[1] },
    ...(claims ? { authorizer: { jwt: { claims: { sub: claims, email: `${claims}@x.io`, ...(groups ? { "cognito:groups": groups } : {}) } } } } : {}),
  },
  headers,
  queryStringParameters: qs,
  pathParameters: path,
  body: body ? JSON.stringify(body) : undefined,
});
const parse = (r) => ({ code: r.statusCode, body: r.headers["content-type"].includes("json") ? JSON.parse(r.body) : r.body });

// ---------- tests ----------
test("health is public and reports env", async () => {
  const h = makeHandler(async () => fakeCtx());
  const { code, body } = parse(await h(ev("GET /health")));
  assert.equal(code, 200);
  assert.equal(body.env, "test");
});

test("waitlist: joins once, dedupes, counts, honeypot swallows", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  assert.equal(parse(await h(ev("POST /waitlist", { body: { email: "A@b.co" } }))).body.joined, true);
  const again = parse(await h(ev("POST /waitlist", { body: { email: "a@b.co" } })));
  assert.equal(again.body.already, true);
  const count = parse(await h(ev("GET /waitlist/count")));
  assert.equal(count.body.count, 1); // dedupe did not double-count
  assert.equal(parse(await h(ev("POST /waitlist", { body: { email: "spam@x.io", company: "bot" } }))).code, 200);
  assert.equal(parse(await h(ev("GET /waitlist/count"))).body.count, 1);
  assert.equal(parse(await h(ev("POST /waitlist", { body: { email: "nope" } }))).code, 400);
});

test("me: lazy-upserts profile then updates", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const me = parse(await h(ev("GET /me", { claims: "sub-1" })));
  assert.equal(me.body.user.email, "sub-1@x.io");
  const upd = parse(await h(ev("PUT /me", { claims: "sub-1", body: { name: "Nadia" } })));
  assert.equal(upd.body.user.name, "Nadia");
});

test("admin/orders: 403 without group, 200 with, handles string groups", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  assert.equal(parse(await h(ev("GET /admin/orders", { claims: "u1" }))).code, 403);
  assert.equal(parse(await h(ev("GET /admin/orders", { claims: "u1", groups: ["admin"] }))).code, 200);
  assert.equal(parse(await h(ev("GET /admin/orders", { claims: "u1", groups: "[admin client]" }))).code, 200);
});

test("studio: generate creates order + fires webhook, callback validates + stores, cut serves html", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const anon = parse(await h(ev("POST /studio/generate", { body: { email: "n@x.io", name: "Nadia Benali", role: "engineer", cvText: "2021 SRE at Acme\nterraform kubernetes aws" } })));
  assert.equal(anon.code, 200);
  assert.equal(anon.body.production, false); // anonymous surface never starts a production run
  assert.match(anon.body.html, /Nadia/);
  assert.equal(ctx.queue.sent.length, 0);
  const gen = parse(await h(ev("POST /studio/order", { claims: "n1", body: { email: "n@x.io", name: "Nadia Benali", role: "engineer", cvText: "2021 SRE at Acme\nterraform kubernetes aws" } })));
  assert.equal(gen.code, 200);
  assert.equal(gen.body.production, true);
  assert.equal(gen.body.freeCutsLeft, 2);
  assert.match(gen.body.html, /terraform/i);
  const orderId = gen.body.orderId;
  assert.equal(ctx.queue.sent.length, 1);

  // callback: wrong secret rejected
  assert.equal(parse(await h(ev("POST /callback", { headers: { "x-cf-secret": "WRONG", "x-cf-order": orderId } }))).code, 401);
  // not-a-doc rejected
  const bad1 = await h({ ...ev("POST /callback", { headers: { "x-cf-secret": "cbsec", "x-cf-order": orderId } }), body: "hello" });
  assert.equal(bad1.statusCode, 400);
  // good cut accepted
  const good = await h({ ...ev("POST /callback", { headers: { "x-cf-secret": "cbsec", "x-cf-order": orderId } }), body: "<!doctype html><html><body>CUT</body></html>" });
  assert.equal(good.statusCode, 200);
  const st = parse(await h(ev("GET /studio/status", { qs: { orderId } })));
  assert.equal(st.body.status, "ready");
  const cut = await h(ev("GET /studio/cut", { qs: { orderId } }));
  assert.match(cut.body, /CUT/);
  assert.match(cut.headers["content-type"], /text\/html/);
});

test("sites: create -> publish n1 (kvs flip) -> publish n2 -> rollback -> takedown; slug uniqueness", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const created = parse(await h(ev("POST /sites", { claims: "u1", body: { title: "Nadia Benali" } })));
  const id = created.body.site.siteId;
  assert.equal(created.body.site.slug, "nadia-benali");

  // second site with same title -> slug conflict
  assert.equal(parse(await h(ev("POST /sites", { claims: "u2", body: { title: "Nadia Benali" } }))).code, 409);

  const doc = "<!doctype html><html><body>v1</body></html>";
  const p1 = parse(await h(ev("POST /sites/{id}/publish", { claims: "u1", path: { id }, body: { html: doc } })));
  assert.equal(p1.body.release, 1);
  assert.equal(p1.body.pointer, "kvs");
  assert.deepEqual(ctx.kvs.puts.at(-1), ["nadia-benali", `${id}/releases/1`]);
  const stored1 = ctx.s3._store.get(`pub/sites/${id}/releases/1/index.html`);
  assert.ok(stored1.startsWith("<!doctype html"), "release stored");
  assert.match(stored1, /data-cf-beacon/); // every release carries the audience beacon

  const p2 = parse(await h(ev("POST /sites/{id}/publish", { claims: "u1", path: { id }, body: { html: doc.replace("v1", "v2") } })));
  assert.equal(p2.body.release, 2);
  assert.deepEqual(ctx.kvs.puts.at(-1), ["nadia-benali", `${id}/releases/2`]);

  const rb = parse(await h(ev("POST /sites/{id}/rollback", { claims: "u1", path: { id } })));
  assert.equal(rb.body.liveRelease, 1);
  assert.deepEqual(ctx.kvs.puts.at(-1), ["nadia-benali", `${id}/releases/1`]);

  // ownership boundary
  assert.equal(parse(await h(ev("POST /sites/{id}/publish", { claims: "intruder", path: { id }, body: { html: doc } }))).code, 403);

  const td = parse(await h(ev("DELETE /sites/{id}", { claims: "u1", path: { id } })));
  assert.equal(td.body.status, "taken_down");
  assert.deepEqual(ctx.kvs.dels, ["nadia-benali"]);
});

test("sites: publish falls back to s3 copy + invalidation when KVS unavailable", async () => {
  const ctx = fakeCtx();
  ctx.kvs.put = async () => { throw new Error("SigV4a unavailable"); };
  const h = makeHandler(async () => ctx);
  const id = parse(await h(ev("POST /sites", { claims: "u1", body: { title: "Fallback Site" } }))).body.site.siteId;
  const p = parse(await h(ev("POST /sites/{id}/publish", { claims: "u1", path: { id }, body: { html: "<!doctype html><html>x</html>" } })));
  assert.equal(p.body.pointer, "s3copy");
  assert.ok(ctx.s3._store.has("pub/sites/fallback-site/index.html"));
  assert.deepEqual(ctx.cdn.invalidations.at(-1), ["/sites/fallback-site/*"]);
});

test("unknown route 404s, handler errors map to 500 json", async () => {
  const ctx = fakeCtx();
  ctx.ddb.get = async () => { throw new Error("boom"); };
  const h = makeHandler(async () => ctx);
  assert.equal(parse(await h(ev("GET /nope"))).code, 404);
  const r = parse(await h(ev("GET /studio/status", { qs: { orderId: "abc12345" } })));
  assert.equal(r.code, 500);
  assert.equal(r.body.error, "internal_error");
});

test("sites: source download serves release html to owner only; previewUrl uses /_preview/", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const created = parse(await h(ev("POST /sites", { claims: "u1", body: { title: "Dl Site" } })));
  const id = created.body.site.siteId;
  assert.match(created.body.site.previewUrl, /\/_preview\/dl-site\/$/);
  const doc = "<!doctype html><html><body>v1 source</body></html>";
  const p = parse(await h(ev("POST /sites/{id}/publish", { claims: "u1", path: { id }, body: { html: doc } })));
  assert.match(p.body.url, /\/_preview\/dl-site\/$/);
  const dl = await h(ev("GET /sites/{id}/source", { claims: "u1", path: { id } }));
  assert.equal(dl.statusCode, 200);
  assert.match(dl.headers["content-disposition"], /dl-site-release-1-index\.html/);
  assert.match(dl.body, /v1 source/);
  // stranger blocked
  assert.equal(parse(await h(ev("GET /sites/{id}/source", { claims: "intruder", path: { id } }))).code, 403);
  // bad release rejected
  assert.equal(parse(await h(ev("GET /sites/{id}/source", { claims: "u1", path: { id }, qs: { release: "9" } }))).code, 400);
});

test("pipeline: callback resumes task token instead of flipping status; retry re-enqueues", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const gen = parse(await h(ev("POST /studio/order", { claims: "tok", body: { email: "t@x.io", name: "Tok En", role: "engineer", cvText: "2020 platform engineer aws terraform and more text here" } })));
  const orderId = gen.body.orderId;
  // generate no longer fires the webhook itself — it only enqueues
  assert.deepEqual(ctx.queue.sent, [{ orderId }]);
  // cvText retained for pipeline re-dispatch
  assert.match(ctx.ddb._store.get(`ORDER#${orderId}|META`).cvText, /platform engineer/);

  // simulate the dispatch step having stored a task token
  const meta = ctx.ddb._store.get(`ORDER#${orderId}|META`);
  meta.taskToken = "tok-123"; meta.status = "filming";

  const cb = await h({ ...ev("POST /callback", { headers: { "x-cf-secret": "cbsec", "x-cf-order": orderId } }), body: "<!doctype html><html>CUT</html>" });
  assert.equal(cb.statusCode, 200);
  assert.equal(JSON.parse(cb.body).resumed, true);
  assert.deepEqual(ctx.sfn.resumed[0][0], "tok-123");
  // status NOT flipped by callback in pipeline mode (Finalize owns it)
  assert.equal(ctx.ddb._store.get(`ORDER#${orderId}|META`).status, "filming");

  // admin retry: non-admin 403, admin re-enqueues stuck order
  meta.status = "human_review";
  assert.equal(parse(await h(ev("POST /admin/orders/{id}/retry", { claims: "u1", path: { id: orderId } }))).code, 403);
  const rt = parse(await h(ev("POST /admin/orders/{id}/retry", { claims: "op", groups: ["admin"], path: { id: orderId } })));
  assert.equal(rt.body.status, "queued");
  assert.equal(ctx.queue.sent.length, 2);
  // ready orders are not retryable
  ctx.ddb._store.get(`ORDER#${orderId}|META`).status = "ready";
  assert.equal(parse(await h(ev("POST /admin/orders/{id}/retry", { claims: "op", groups: ["admin"], path: { id: orderId } }))).code, 409);
});

test("sites: takedown then relight restores pointer and live status", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const id = parse(await h(ev("POST /sites", { claims: "u1", body: { title: "Cycle Site" } }))).body.site.siteId;
  await h(ev("POST /sites/{id}/publish", { claims: "u1", path: { id }, body: { html: "<!doctype html><html>v1</html>" } }));
  const td = parse(await h(ev("DELETE /sites/{id}", { claims: "u1", path: { id } })));
  assert.equal(td.body.status, "taken_down");
  // relight (no target -> defaults to current liveRelease when taken down)
  const rl = parse(await h(ev("POST /sites/{id}/rollback", { claims: "u1", path: { id }, body: {} })));
  assert.equal(rl.body.status, "live");
  assert.equal(rl.body.liveRelease, 1);
  assert.deepEqual(ctx.kvs.puts.at(-1), ["cycle-site", `${id}/releases/1`]);
  // single-release live site still refuses a no-op rollback
  assert.equal(parse(await h(ev("POST /sites/{id}/rollback", { claims: "u1", path: { id }, body: {} }))).code, 400);
});

test("media: presigned upload for images only, keyed to the user", async () => {
  const ctx = fakeCtx();
  ctx.presign = { async put(bucket, key, ct) { return `https://presigned/${bucket}/${key}?ct=${encodeURIComponent(ct)}`; } };
  const h = makeHandler(async () => ctx);
  const r = parse(await h(ev("POST /media", { claims: "u9", body: { contentType: "image/jpeg" } })));
  assert.equal(r.code, 200);
  assert.match(r.body.key, /^media\/u9\/[a-f0-9-]+\.jpg$/);
  assert.match(r.body.uploadUrl, /^https:\/\/presigned\/pub\/media\/u9\//);
  assert.match(r.body.publicUrl, /^https:\/\/cdn\.test\/media\/u9\//);
  assert.equal(parse(await h(ev("POST /media", { claims: "u9", body: { contentType: "application/pdf" } }))).code, 400);
});

test("w2: staged publish previews without flipping, go-live flips, duplicate copies, draft syncs", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const id = parse(await h(ev("POST /sites", { claims: "u1", body: { title: "Stage Site" } }))).body.site.siteId;

  // live release 1
  await h(ev("POST /sites/{id}/publish", { claims: "u1", path: { id }, body: { html: "<!doctype html><html>v1</html>" } }));
  const flips1 = ctx.kvs.puts.length;

  // staged release 2: no pointer flip, previewable at /_r/
  const st = parse(await h(ev("POST /sites/{id}/publish", { claims: "u1", path: { id }, body: { html: "<!doctype html><html>v2</html>", stage: true } })));
  assert.equal(st.body.staged, true);
  assert.equal(st.body.release, 2);
  assert.match(st.body.previewUrl, new RegExp(`/_r/${id}/2/$`));
  assert.equal(ctx.kvs.puts.length, flips1); // pointer did NOT move
  let meta = ctx.ddb._store.get(`SITE#${id}|META`);
  assert.equal(meta.liveRelease, 1);
  assert.equal(meta.stagedRelease, 2);

  // go live on the staged release
  const gl = parse(await h(ev("POST /sites/{id}/rollback", { claims: "u1", path: { id }, body: { to: 2 } })));
  assert.equal(gl.body.liveRelease, 2);
  assert.deepEqual(ctx.kvs.puts.at(-1), ["stage-site", `${id}/releases/2`]);
  meta = ctx.ddb._store.get(`SITE#${id}|META`);
  assert.equal(meta.stagedRelease, null);

  // duplicate as audience version
  const dup = parse(await h(ev("POST /sites/{id}/duplicate", { claims: "u1", path: { id }, body: { slug: "stage-site-ux", title: "Stage Site — UX cut" } })));
  assert.equal(dup.code, 200);
  assert.equal(dup.body.site.slug, "stage-site-ux");
  assert.equal(dup.body.site.audienceOf, id);
  assert.equal(dup.body.site.liveRelease, 1);
  const nid = dup.body.site.siteId;
  assert.match(ctx.s3._store.get(`pub/sites/${nid}/releases/1/index.html`), /^<!doctype html><html>v2<\/html>/);
  // slug conflict on second duplicate with same slug
  assert.equal(parse(await h(ev("POST /sites/{id}/duplicate", { claims: "u1", path: { id }, body: { slug: "stage-site-ux" } }))).code, 409);

  // staged-only site can go live directly
  const id2 = parse(await h(ev("POST /sites", { claims: "u1", body: { title: "Fresh Stage" } }))).body.site.siteId;
  await h(ev("POST /sites/{id}/publish", { claims: "u1", path: { id: id2 }, body: { html: "<!doctype html><html>s1</html>", stage: true } }));
  const gl2 = parse(await h(ev("POST /sites/{id}/rollback", { claims: "u1", path: { id: id2 }, body: {} })));
  assert.equal(gl2.body.liveRelease, 1);
  assert.equal(gl2.body.status, "live");

  // draft sync round-trip
  const put = parse(await h(ev("PUT /draft", { claims: "u1", body: { draft: { q: { name: "Nadia" }, tpl: "editorial" } } })));
  assert.equal(put.code, 200);
  const got = parse(await h(ev("GET /draft", { claims: "u1" })));
  assert.equal(got.body.draft.q.name, "Nadia");
  assert.equal(got.body.draft.tpl, "editorial");
});

// ---------- ZWIN pass 04: buyer backend ----------

test("orders: buyer sees own orders; three messages per order, then 409", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const gen = parse(await h(ev("POST /studio/order", { claims: "u1", body: { email: "u1@x.io", name: "Dora Szabo", role: "designer", cvText: "2022 Accounts at Acme" } })));
  const orderId = gen.body.orderId;

  // the buyer sees it; a stranger does not
  const mine = parse(await h(ev("GET /orders", { claims: "u1" })));
  assert.equal(mine.code, 200);
  assert.equal(mine.body.orders.length, 1);
  assert.equal(mine.body.orders[0].orderId, orderId);
  assert.equal(mine.body.orders[0].price, 0); // a free cut: the account entitlement paid for it
  assert.equal(mine.body.orders[0].messagesLeft, 3);
  assert.equal(parse(await h(ev("GET /orders", { claims: "u2" }))).body.orders.length, 0);

  // not revisable before delivery
  assert.equal(parse(await h(ev("POST /orders/{id}/revision", { claims: "u1", path: { id: orderId }, body: { notes: "warmer light" } }))).code, 409);

  // deliver it, then a stranger still cannot touch it
  const meta = ctx.ddb._store.get(`ORDER#${orderId}|META`);
  meta.status = "ready";
  ctx.ddb._store.set(`ORDER#${orderId}|META`, meta);
  assert.equal(parse(await h(ev("POST /orders/{id}/revision", { claims: "u2", path: { id: orderId }, body: { notes: "steal it" } }))).code, 403);

  // notes required
  assert.equal(parse(await h(ev("POST /orders/{id}/revision", { claims: "u1", path: { id: orderId }, body: { notes: "" } }))).code, 400);

  // happy path: message one of three, order re-enters the queue with notes riding on it
  const sentBefore = ctx.queue.sent.length;
  const rev = parse(await h(ev("POST /orders/{id}/revision", { claims: "u1", path: { id: orderId }, body: { notes: "warmer light, bolder hero" } })));
  assert.equal(rev.code, 200);
  assert.equal(rev.body.status, "queued");
  assert.equal(rev.body.messagesLeft, 2);
  assert.equal(ctx.queue.sent.length, sentBefore + 1);
  const after = ctx.ddb._store.get(`ORDER#${orderId}|META`);
  assert.equal(after.revisionRequested, true);
  assert.match(after.revisionNotes, /warmer light/);

  // messages two and three spend the rest; the fourth is refused
  for (const want of [1, 0]) {
    after.status = "ready";
    ctx.ddb._store.set(`ORDER#${orderId}|META`, after);
    const r = parse(await h(ev("POST /orders/{id}/revision", { claims: "u1", path: { id: orderId }, body: { notes: `note ${want}` } })));
    assert.equal(r.code, 200);
    assert.equal(r.body.messagesLeft, want);
  }
  after.status = "ready";
  ctx.ddb._store.set(`ORDER#${orderId}|META`, after);
  assert.equal(parse(await h(ev("POST /orders/{id}/revision", { claims: "u1", path: { id: orderId }, body: { notes: "a fourth" } }))).code, 409);
});

// ---------- ZWIN pass 06: asset bundles + the order-to-film bond ----------

test("bundles: a cut ships pages plus base64 assets; publish copies assets and stamps the order's film", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const gen = parse(await h(ev("POST /studio/order", { claims: "u1", body: { email: "a@x.io", name: "Asset Case", role: "designer", cvText: "2021 designer figma" } })));
  const orderId = gen.body.orderId;

  // the agent delivers pages AND a small image asset
  const bundle = JSON.stringify({ files: [
    { path: "index.html", html: "<!doctype html><html><body><img src=\"assets/hero.png\">CUT</body></html>" },
    { path: "projects/one.html", html: "<!doctype html><html><body>case</body></html>" },
    { path: "assets/hero.png", content: Buffer.from("fakepngbytes").toString("base64"), contentType: "image/png" },
  ] });
  const cb = await h({ ...ev("POST /callback", { headers: { "x-cf-secret": "cbsec", "x-cf-order": orderId } }), body: bundle });
  assert.equal(cb.statusCode, 200);
  const meta = ctx.ddb._store.get(`ORDER#${orderId}|META`);
  meta.status = "ready"; meta.cutKey = `orders/${orderId}/cut/index.html`;
  ctx.ddb._store.set(`ORDER#${orderId}|META`, meta);
  assert.deepEqual(meta.cutFiles.sort(), ["assets/hero.png", "index.html", "projects/one.html"]);

  // premiere the cut: pages carry the beacon, the asset copies byte-for-byte
  const site = parse(await h(ev("POST /sites", { claims: "u1", body: { slug: "asset-case", title: "Asset Case" } }))).body.site;
  const pubd = parse(await h(ev("POST /sites/{id}/publish", { claims: "u1", path: { id: site.siteId }, body: { orderId } })));
  assert.equal(pubd.code, 200);
  // the order now remembers its film: revisions premiere HERE
  assert.equal(ctx.ddb._store.get(`ORDER#${orderId}|META`).siteId, site.siteId);
  const rel = ctx.ddb._store.get(`SITE#${site.siteId}|RELEASE#00001`);
  assert.equal(rel.filePaths.includes("assets/hero.png"), true);

  // a bundle with a bad asset type is refused at the door
  const badBundle = JSON.stringify({ files: [
    { path: "index.html", html: "<!doctype html><html><body>x</body></html>" },
    { path: "assets/run.exe", content: "AAAA" },
  ] });
  const badCb = await h({ ...ev("POST /callback", { headers: { "x-cf-secret": "cbsec", "x-cf-order": orderId } }), body: badBundle });
  assert.equal(badCb.statusCode, 400);
});

test("stats: sums the film's daily hit counters for the owner only", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const site = parse(await h(ev("POST /sites", { claims: "u1", body: { slug: "dora", title: "Dora" } }))).body.site;
  await h(ev("POST /sites/{id}/publish", { claims: "u1", path: { id: site.siteId }, body: { html: "<!doctype html><html><body>x</body></html>" } }));

  // two views today through the public beacon route, one seeded three days ago
  await h(ev("POST /hit", { body: { page: "s/dora" } }));
  await h(ev("POST /hit", { body: { page: "s/dora" } }));
  const d3 = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  ctx.ddb._store.set(`HIT#${d3}|s/dora`, { PK: `HIT#${d3}`, SK: "s/dora", count: 5 });

  const st = parse(await h(ev("GET /sites/{id}/stats", { claims: "u1", path: { id: site.siteId } })));
  assert.equal(st.code, 200);
  assert.equal(st.body.views, 7);
  assert.equal(st.body.week, 7);
  assert.equal(st.body.daily.length, 30);
  assert.equal(parse(await h(ev("GET /sites/{id}/stats", { claims: "intruder", path: { id: site.siteId } }))).code, 403);
});

test("domain: validates, records intent, and surfaces it on the site", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const site = parse(await h(ev("POST /sites", { claims: "u1", body: { slug: "tomas", title: "Tomas" } }))).body.site;
  assert.equal(parse(await h(ev("POST /sites/{id}/domain", { claims: "u1", path: { id: site.siteId }, body: { domain: "not a domain" } }))).code, 400);
  const okd = parse(await h(ev("POST /sites/{id}/domain", { claims: "u1", path: { id: site.siteId }, body: { domain: "Tomas.Design" } })));
  assert.equal(okd.code, 200);
  assert.equal(okd.body.domain, "tomas.design");
  assert.equal(okd.body.domainStatus, "pending_dns");
  assert.equal(okd.body.target, "cdn.test");
  const got = parse(await h(ev("GET /sites/{id}", { claims: "u1", path: { id: site.siteId } })));
  assert.equal(got.body.site.customDomain, "tomas.design");
  assert.equal(got.body.site.domainStatus, "pending_dns");
});

test("publish injects the audience beacon before the closing body tag", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const site = parse(await h(ev("POST /sites", { claims: "u1", body: { slug: "lena", title: "Lena" } }))).body.site;
  await h(ev("POST /sites/{id}/publish", { claims: "u1", path: { id: site.siteId }, body: { html: "<!doctype html><html><body>film</body></html>" } }));
  const stored = ctx.s3._store.get(`pub/sites/${site.siteId}/releases/1/index.html`);
  assert.match(stored, /data-cf-beacon/);
  assert.match(stored, /s\/lena/);
  assert.ok(stored.indexOf("data-cf-beacon") < stored.indexOf("</body>"), "beacon sits inside body");
});

// ---------- ZWIN pass 05: the complete web app ----------

test("profile: dossier round trip, size cap, shape guard", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const empty = parse(await h(ev("GET /profile", { claims: "u1" })));
  assert.equal(empty.body.profile, null);
  const profile = { identity: { name: "Dora Szabo", headline: "Senior Accounts Payable" }, skills: ["excel"], certifications: [{ name: "CPA", year: "2024" }] };
  const put = parse(await h(ev("PUT /profile", { claims: "u1", body: { profile } })));
  assert.equal(put.code, 200);
  const got = parse(await h(ev("GET /profile", { claims: "u1" })));
  assert.equal(got.body.profile.identity.name, "Dora Szabo");
  assert.equal(got.body.profile.certifications[0].name, "CPA");
  assert.equal(parse(await h(ev("PUT /profile", { claims: "u1", body: { profile: "nope" } }))).code, 400);
  assert.equal(parse(await h(ev("GET /profile", { claims: "u2" }))).body.profile, null); // isolation
});

test("publish: a bundle stores every page with the beacon, index required, bad paths rejected", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const site = parse(await h(ev("POST /sites", { claims: "u1", body: { slug: "bundle-site", title: "Bundle" } }))).body.site;
  const files = [
    { path: "index.html", html: "<!doctype html><html><body>home <a href=\"projects/atlas.html\">atlas</a></body></html>" },
    { path: "projects/atlas.html", html: "<!doctype html><html><body>case study</body></html>" },
  ];
  const pubd = parse(await h(ev("POST /sites/{id}/publish", { claims: "u1", path: { id: site.siteId }, body: { files } })));
  assert.equal(pubd.code, 200);
  const idx = ctx.s3._store.get(`pub/sites/${site.siteId}/releases/1/index.html`);
  const page = ctx.s3._store.get(`pub/sites/${site.siteId}/releases/1/projects/atlas.html`);
  assert.ok(idx && page, "both pages stored");
  assert.match(idx, /data-cf-beacon/);
  assert.match(page, /data-cf-beacon/);
  const rel = ctx.ddb._store.get(`SITE#${site.siteId}|RELEASE#00001`);
  assert.deepEqual(rel.filePaths, ["index.html", "projects/atlas.html"]);
  // guards
  assert.equal(parse(await h(ev("POST /sites/{id}/publish", { claims: "u1", path: { id: site.siteId }, body: { files: [{ path: "projects/x.html", html: "<!doctype html><html></html>" }] } }))).code, 400);
  assert.equal(parse(await h(ev("POST /sites/{id}/publish", { claims: "u1", path: { id: site.siteId }, body: { files: [{ path: "../evil.html", html: "<!doctype html><html></html>" }, { path: "index.html", html: "<!doctype html><html></html>" }] } }))).code, 400);
  // source can fetch a specific page of the bundle
  const src = await h(ev("GET /sites/{id}/source", { claims: "u1", path: { id: site.siteId }, qs: { path: "projects/atlas.html" } }));
  assert.match(src.body, /case study/);
});

test("callback v2: the agent delivers a whole web app as JSON and publish serves it", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const gen = parse(await h(ev("POST /studio/generate", { claims: "u1", body: { email: "u1@x.io", name: "Dora", role: "designer", cvText: "2022 design at Acme" } })));
  const orderId = gen.body.orderId;
  const payload = JSON.stringify({ files: [
    { path: "index.html", html: "<!doctype html><html><body>the cut</body></html>" },
    { path: "projects/atlas.html", html: "<!doctype html><html><body>atlas case</body></html>" },
  ] });
  const cb = parse(await h(ev("POST /callback", { headers: { "x-cf-secret": "cbsec", "x-cf-order": orderId }, body: undefined })));
  assert.equal(cb.code, 400); // empty body rejected
  const cb2 = parse(await h({ ...ev("POST /callback", { headers: { "x-cf-secret": "cbsec", "x-cf-order": orderId } }), body: payload }));
  assert.equal(cb2.code, 200);
  const meta = ctx.ddb._store.get(`ORDER#${orderId}|META`);
  assert.deepEqual(meta.cutFiles, ["index.html", "projects/atlas.html"]);
  assert.ok(ctx.s3._store.get(`arts/orders/${orderId}/cut/index.html`));
  assert.ok(ctx.s3._store.get(`arts/orders/${orderId}/cut/projects/atlas.html`));
  // no task token in fake flow: callback flipped it ready directly; publish the cut as a site release
  assert.equal(meta.status, "ready");
  const site = parse(await h(ev("POST /sites", { claims: "u1", body: { slug: "dora-cut", title: "Dora" } }))).body.site;
  const pubd = parse(await h(ev("POST /sites/{id}/publish", { claims: "u1", path: { id: site.siteId }, body: { orderId } })));
  assert.equal(pubd.code, 200);
  assert.match(ctx.s3._store.get(`pub/sites/${site.siteId}/releases/1/index.html`), /the cut/);
  assert.match(ctx.s3._store.get(`pub/sites/${site.siteId}/releases/1/projects/atlas.html`), /atlas case/);
});

// ---------- ZWIN pass 05: AI cut entitlement ----------

test("studio/order: three free cuts per account, the fourth is 402, accounts are segregated", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const body = { email: "f@x.io", name: "Free Cut", role: "designer", cvText: "2020 designer figma branding", photo: "https://cdn/x.jpg", covers: [{ name: "p1.jpg", url: "https://cdn/p1.jpg" }] };
  for (let i = 1; i <= 3; i++) {
    const r = parse(await h(ev("POST /studio/order", { claims: "fc1", body })));
    assert.equal(r.code, 200);
    assert.equal(r.body.freeCutsLeft, 3 - i);
  }
  const fourth = parse(await h(ev("POST /studio/order", { claims: "fc1", body })));
  assert.equal(fourth.code, 402);
  assert.equal(fourth.body.price, 149);
  // a different account still holds its own three
  assert.equal(parse(await h(ev("POST /studio/order", { claims: "fc2", body }))).body.freeCutsLeft, 2);
  // the client's material rides on the order for the pipeline dispatch
  const withAssets = [...ctx.ddb._store.values()].find((v) => v.type === "order" && v.assets?.photo);
  assert.equal(withAssets.assets.photo, "https://cdn/x.jpg");
  assert.equal(withAssets.assets.covers[0].url, "https://cdn/p1.jpg");
  // /me surfaces the entitlement for the console
  const me = parse(await h(ev("GET /me", { claims: "fc1" })));
  assert.equal(me.body.user.freeCutsLeft, 0);
  assert.equal(me.body.user.aiCuts, 3);
  // each buyer lists only their own orders
  assert.equal(parse(await h(ev("GET /orders", { claims: "fc1" }))).body.orders.length, 4 - 1); // 402 order never created
  assert.equal(parse(await h(ev("GET /orders", { claims: "fc2" }))).body.orders.length, 1);
});

// ---------- ZWIN pass 07: the agent's asset intake ----------

test("studio/asset: agent uploads binaries with the secret, callback folds them into the cut, cut serves them by path", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const gen = parse(await h(ev("POST /studio/order", { claims: "u1", body: { email: "b@x.io", name: "Binary Case", role: "designer", cvText: "2021 designer figma branding work" } })));
  const orderId = gen.body.orderId;

  // wrong secret is refused; bad path is refused; pages are refused here
  assert.equal((await h({ ...ev("POST /studio/asset", { headers: { "x-cf-secret": "WRONG" }, qs: { orderId, path: "assets/a.jpg" } }), body: "AA", isBase64Encoded: true })).statusCode, 401);
  assert.equal((await h({ ...ev("POST /studio/asset", { headers: { "x-cf-secret": "cbsec" }, qs: { orderId, path: "assets/run.exe" } }), body: "AA", isBase64Encoded: true })).statusCode, 400);
  assert.equal((await h({ ...ev("POST /studio/asset", { headers: { "x-cf-secret": "cbsec" }, qs: { orderId, path: "index.html" } }), body: "AA", isBase64Encoded: true })).statusCode, 400);

  // two parallel-style uploads land as rows + objects
  const png = Buffer.from("pngbytes").toString("base64");
  const up1 = await h({ ...ev("POST /studio/asset", { headers: { "x-cf-secret": "cbsec" }, qs: { orderId, path: "assets/hero.jpg" } }), body: png, isBase64Encoded: true });
  assert.equal(up1.statusCode, 200);
  const up2 = await h({ ...ev("POST /studio/asset", { headers: { "x-cf-secret": "cbsec" }, qs: { orderId, path: "resume.pdf" } }), body: png, isBase64Encoded: true });
  assert.equal(up2.statusCode, 200);

  // pages delivered AFTER the uploads: manifest = pages + uploaded assets
  const cb = await h({ ...ev("POST /callback", { headers: { "x-cf-secret": "cbsec", "x-cf-order": orderId } }), body: "<!doctype html><html><body><img src=\"assets/hero.jpg\"><a href=\"resume.pdf\">resume</a></body></html>" });
  assert.equal(cb.statusCode, 200);
  const meta = ctx.ddb._store.get(`ORDER#${orderId}|META`);
  assert.deepEqual([...meta.cutFiles].sort(), ["assets/hero.jpg", "index.html", "resume.pdf"]);

  // the pre-premiere preview serves the asset by path, base64-encoded with its type
  meta.status = "ready"; meta.cutKey = `orders/${orderId}/cut/index.html`;
  ctx.ddb._store.set(`ORDER#${orderId}|META`, meta);
  const served = await h(ev("GET /studio/cut", { qs: { orderId, path: "assets/hero.jpg" } }));
  assert.equal(served.statusCode, 200);
  assert.equal(served.isBase64Encoded, true);
  assert.equal(served.headers["content-type"], "image/jpeg");
  // a path outside the manifest 404s
  assert.equal((await h(ev("GET /studio/cut", { qs: { orderId, path: "assets/other.jpg" } }))).statusCode, 404);

  // premiere: the assets ride into the release byte-for-byte
  const site = parse(await h(ev("POST /sites", { claims: "u1", body: { slug: "binary-case", title: "Binary Case" } }))).body.site;
  const pubd = parse(await h(ev("POST /sites/{id}/publish", { claims: "u1", path: { id: site.siteId }, body: { orderId } })));
  assert.equal(pubd.code, 200);
  const rel = ctx.ddb._store.get(`SITE#${site.siteId}|RELEASE#00001`);
  assert.equal(rel.filePaths.includes("assets/hero.jpg"), true);
  assert.equal(rel.filePaths.includes("resume.pdf"), true);
});

test("media/direct: proxied upload writes the image and returns a public url", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const b64 = Buffer.from("jpegbytes").toString("base64");
  const r = parse(await h(ev("POST /media/direct", { claims: "u1", body: { contentType: "image/jpeg", dataBase64: b64 } })));
  assert.equal(r.code, 200);
  assert.match(r.body.publicUrl, /^https:\/\/.+\/media\/u1\//);
  // junk is refused
  assert.equal(parse(await h(ev("POST /media/direct", { claims: "u1", body: { contentType: "image/jpeg", dataBase64: "" } }))).code, 400);
  assert.equal(parse(await h(ev("POST /media/direct", { claims: "u1", body: { contentType: "application/x-executable", dataBase64: b64 } }))).code, 400);
});
