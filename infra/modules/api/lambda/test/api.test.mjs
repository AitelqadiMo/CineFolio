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
      async copyObject(b, from, to) { s3store.set(`${b}/${to}`, s3store.get(`${b}/${from}`)); },
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
  const gen = parse(await h(ev("POST /studio/generate", { body: { email: "n@x.io", name: "Nadia Benali", role: "engineer", cvText: "2021 SRE at Acme\nterraform kubernetes aws" } })));
  assert.equal(gen.code, 200);
  assert.equal(gen.body.production, true);
  assert.match(gen.body.html, /Nadia/);
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
  assert.equal(ctx.s3._store.get(`pub/sites/${id}/releases/1/index.html`), doc);

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
  assert.match(dl.headers["content-disposition"], /dl-site-release-1\.html/);
  assert.match(dl.body, /v1 source/);
  // stranger blocked
  assert.equal(parse(await h(ev("GET /sites/{id}/source", { claims: "intruder", path: { id } }))).code, 403);
  // bad release rejected
  assert.equal(parse(await h(ev("GET /sites/{id}/source", { claims: "u1", path: { id }, qs: { release: "9" } }))).code, 400);
});

test("pipeline: callback resumes task token instead of flipping status; retry re-enqueues", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const gen = parse(await h(ev("POST /studio/generate", { body: { email: "t@x.io", name: "Tok En", role: "engineer", cvText: "2020 platform engineer aws terraform and more text here" } })));
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
