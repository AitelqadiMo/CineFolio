// node --test - END TO END JOURNEY suite. Nobody had ever walked the COMPLETE
// money journey a paying customer takes, in order, through the real router,
// asserting the state at every step. The unit and single-route tests each look
// at one organ; these tests exercise the whole animal. A break anywhere in one
// of these paths costs a sale, so each journey is one test that walks the whole
// path and asserts the state transitions along the way.
//
// The router is driven exactly as production drives it: makeHandler(index.mjs)
// over the in-memory fake ctx. We assert only on OBSERVABLE state - the fake
// stores, the emails sent, the HTTP responses - never on internals.
//
// The fakeCtx and ev helpers are reused verbatim from api.test.mjs (they model
// DynamoDB, S3, KVS, SES, SQS, SFN and SSM faithfully). The webhook helpers are
// a thin local shape so a journey can control test_mode, which the api.test.mjs
// helper hard-codes to true and which the revenue journey must vary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { makeHandler } from "../index.mjs";

// ---------- fakes (verbatim from api.test.mjs) ----------
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
      if (ConditionExpression === "paidCredits >= :one" && !((item.paidCredits || 0) >= ExpressionAttributeValues[":one"])) {
        throw Object.assign(new Error("no credits"), { name: "ConditionalCheckFailedException" });
      }
      if (ConditionExpression === "attribute_exists(PK) AND attribute_not_exists(trialWarnedAt)"
        && (!store.has(k) || item.trialWarnedAt !== undefined)) {
        throw Object.assign(new Error("already warned"), { name: "ConditionalCheckFailedException" });
      }
      // micro-interpreter for the SET/ADD expressions we actually use
      const resolve = (n) => ExpressionAttributeNames[n] || n;
      for (const clause of UpdateExpression.split(/SET|ADD/).filter(Boolean).map((c) => c.trim())) {
        // split on commas that are not inside if_not_exists(...) parens
        for (const part of clause.split(/,(?![^(]*\))/).map((p) => p.trim()).filter(Boolean)) {
          if (part.includes("=")) {
            const [lhs, rhs] = part.split("=").map((x) => x.trim());
            const ine = rhs.match(/^if_not_exists\((\S+?),\s*(:\S+)\)$/);
            if (ine) {
              const cur = item[resolve(ine[1])];
              item[resolve(lhs)] = cur !== undefined ? cur : ExpressionAttributeValues[ine[2]];
            } else item[resolve(lhs)] = ExpressionAttributeValues[rhs];
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
    async scan({ ExpressionAttributeValues: v }) {
      // single-page type-filtered scan, mirroring admin.mjs's only usage
      return { items: [...store.values()].filter((i) => i.type === v[":t"]), lastKey: null };
    },
    async query({ IndexName, ExpressionAttributeValues: v, KeyConditionExpression }) {
      const items = [...store.values()];
      if (IndexName === "GSI1") return items.filter((i) => i.GSI1PK === v[":p"] && (!v[":s"] || String(i.GSI1SK).startsWith(v[":s"])));
      if (IndexName === "GSI2") return items.filter((i) => i.GSI2PK === v[":p"]);
      if (KeyConditionExpression?.includes("begins_with")) return items.filter((i) => i.PK === v[":p"] && String(i.SK).startsWith(v[":s"]));
      return items.filter((i) => i.PK === v[":p"]);
    },
    async transact(items) {
      const keyOf = (o) => `${o.PK}|${o.SK}`;
      for (const it of items) {
        if (it.Put?.ConditionExpression === "attribute_not_exists(PK)" && store.has(keyOf(it.Put.Item))) {
          throw Object.assign(new Error("cancelled"), { name: "TransactionCanceledException" });
        }
      }
      for (const it of items) {
        if (it.Put) { store.set(keyOf(it.Put.Item), structuredClone(it.Put.Item)); continue; }
        if (it.Update) {
          const { Key, UpdateExpression, ExpressionAttributeValues = {}, ExpressionAttributeNames = {} } = it.Update;
          const k = `${Key.PK}|${Key.SK}`;
          const item = store.get(k) || { ...Key };
          const resolve = (n) => ExpressionAttributeNames[n] || n;
          for (const clause of UpdateExpression.split(/SET|ADD/).filter(Boolean).map((c) => c.trim())) {
            for (const part of clause.split(/,(?![^(]*\))/).map((p) => p.trim()).filter(Boolean)) {
              if (part.includes("=")) { const [lhs, rhs] = part.split("=").map((x) => x.trim()); item[resolve(lhs)] = ExpressionAttributeValues[rhs]; }
              else { const m = part.match(/^(\S+)\s+(:\S+)$/); if (m) item[resolve(m[1])] = (item[resolve(m[1])] || 0) + ExpressionAttributeValues[m[2]]; }
            }
          }
          store.set(k, item);
        }
      }
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
    ses: { sent: [], async send(from, to, subject, html, opts = {}) { this.sent.push({ from, to, subject, html, replyTo: opts.replyTo, text: opts.text }); } },
    params: {
      _store: {},
      async get(name) { const v = this._store[name]; return { value: v ?? null, type: v != null ? "SecureString" : null }; },
      async put(name, value) { this._store[name] = value; },
    },
    secrets: async () => ({ AGENT_WEBHOOK_URL: "https://agent.example/hook", AGENT_WEBHOOK_SECRET: "whsec", CF_CALLBACK_SECRET: "cbsec" }),
    fetchFn: async () => ({ ok: true }),
    config: { appEnv: "test", apiBase: "https://api.test", artifactsBucket: "arts", publishedBucket: "pub", kvsArn: "arn:kvs", distributionId: "DIST", cdnDomain: "cdn.test", ordersQueueUrl: "q", ssmPrefix: "/cinefolio/test" },
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

// ---------- billing helpers (Lemon Squeezy is the auto-detected provider when
// only LS_WEBHOOK_SECRET is configured, exactly as api.test.mjs relies on). The
// difference here: test_mode and total_usd are parameters, because a journey
// that checks revenue must be able to send a REAL, non-test purchase, which the
// api.test.mjs helper cannot express. ----------
const LS_SECRET = "lssec-1234567890abcdef";
const lsCtx = (extraSecrets = {}) => fakeCtx({
  secrets: async () => ({
    AGENT_WEBHOOK_URL: "https://agent.example/hook", AGENT_WEBHOOK_SECRET: "whsec", CF_CALLBACK_SECRET: "cbsec",
    LS_WEBHOOK_SECRET: LS_SECRET, LS_BUY_URL_DC: "https://cinefolio.lemonsqueezy.com/buy/dc",
    ...extraSecrets,
  }),
});
const lsSign = (raw) => createHmac("sha256", LS_SECRET).update(raw, "utf8").digest("hex");
const lsOrderBody = (id, { sub, status = "paid", email = "buyer@x.io", event = "order_created", variantId = 111, totalUsd = 9900, testMode = true } = {}) => JSON.stringify({
  meta: { event_name: event, ...(sub ? { custom_data: { user_sub: sub } } : {}) },
  data: { id, attributes: { status, user_email: email, identifier: `LS-${id}`, total_usd: totalUsd, test_mode: testMode, first_order_item: { product_name: "The Director's Cut", variant_id: variantId, product_id: 222 } } },
});
const lsHook = (raw, sig) => ({ ...ev("POST /billing/webhook", { headers: { "x-signature": sig ?? lsSign(raw) } }), body: raw });

// the whole journey shape of a director-plan entitlement snapshot, so a test can
// read it in one assertion instead of nine.
const entitlement = (over = {}) => ({
  plan: "free", aiCuts: 0, freeCutsLeft: 1, freeCutsLimit: 1, paidCredits: 0,
  publishSlots: 1, foundingSeatsLeft: 20, foundingPrice: 49, ...over,
});

const page = (t) => ({ html: `<!doctype html><html><body>${t}</body></html>` });

// ============================================================================
// JOURNEY 1 - THE FREE JOURNEY
// A brand-new account signs in, saves a dossier, creates a film, premieres it,
// and the film goes live for free. Then a second release must NOT re-ring the
// premiere bell. We assert the entitlement snapshot at every step, the release
// is immutable and the pointer flipped, the premiere email fires exactly once,
// and the free (manual) premiere carries no trial clock.
// ============================================================================
test("free journey: sign in, save the dossier, premiere a film, and never ring the premiere bell twice", async () => {
  const ctx = fakeCtx();
  ctx.config.sesFrom = "info@cinefolio.dev"; // so the premiere email can actually send
  ctx.config.sitesDomain = "cinefolio.dev";  // so the live address is the real subdomain
  const h = makeHandler(async () => ctx);
  const who = "free1";

  // --- step 1: GET /me lazy-upserts the profile; the entitlement snapshot is
  // the fresh-account truth (one free cut, one premiere slot, founding window open)
  const me1 = parse(await h(ev("GET /me", { claims: who })));
  assert.equal(me1.code, 200);
  assert.equal(me1.body.user.email, "free1@x.io");
  assert.deepEqual(
    entitlementOfUser(me1.body.user), entitlement(),
    "sign-in stamps a fresh free-plan entitlement: 1 free cut, 1 slot, founding window open",
  );
  // the profile row is on the books exactly once
  const prof = ctx.ddb._store.get(`USER#${who}|PROFILE`);
  assert.equal(prof.plan, "free");
  assert.equal(prof.freeCutsLimit, 1);
  assert.ok(prof.createdAt, "createdAt stamped for the growth curves");

  // --- step 2: PUT /profile saves the dossier; entitlement is unchanged by it
  const dossier = { identity: { name: "Free One", headline: "Engineer" }, skills: ["terraform"], certifications: [{ name: "CKA", year: "2024" }] };
  const putP = parse(await h(ev("PUT /profile", { claims: who, body: { profile: dossier } })));
  assert.equal(putP.code, 200);
  const gotP = parse(await h(ev("GET /profile", { claims: who })));
  assert.equal(gotP.body.profile.identity.name, "Free One");
  assert.deepEqual(entitlementOfUser(parse(await h(ev("GET /me", { claims: who }))).body.user), entitlement(),
    "saving a dossier does not touch the entitlement");

  // --- step 3: POST /sites creates a draft film (nothing live yet)
  const created = parse(await h(ev("POST /sites", { claims: who, body: { title: "Free One" } })));
  assert.equal(created.code, 200);
  const id = created.body.site.siteId;
  assert.equal(created.body.site.slug, "free-one");
  assert.equal(created.body.site.status, "draft");
  assert.equal(created.body.site.liveRelease, null);

  // --- step 4: POST /sites/{id}/publish takes it live. This is The Set (manual
  // html, not an AI cut), so it carries NO limited-engagement clock even on free.
  const doc1 = "<!doctype html><html><body>reel one</body></html>";
  const p1 = parse(await h(ev("POST /sites/{id}/publish", { claims: who, path: { id }, body: { html: doc1 } })));
  assert.equal(p1.code, 200);
  assert.equal(p1.body.release, 1);
  assert.equal(p1.body.pointer, "kvs", "the pointer flipped atomically on KVS");
  assert.equal(p1.body.trialEndsAt ?? null, null, "a manual (non-AI) premiere carries no trial clock");

  // the release is IMMUTABLE in its own prefix and carries the audience beacon
  const rel1 = ctx.s3._store.get(`pub/sites/${id}/releases/1/index.html`);
  assert.ok(rel1.startsWith("<!doctype html"), "release 1 stored");
  assert.match(rel1, /data-cf-beacon/, "the release carries the audience beacon");
  // the pointer points at release 1
  assert.deepEqual(ctx.kvs.puts.at(-1), ["free-one", `${id}/releases/1`], "pointer flipped to release 1");
  // the META record reflects live status and the first-premiere stamp
  const meta1 = ctx.ddb._store.get(`SITE#${id}|META`);
  assert.equal(meta1.status, "live");
  assert.equal(meta1.liveRelease, 1);
  assert.ok(meta1.publishedAt, "first go-live stamps publishedAt");

  // the first-premiere share kit fired EXACTLY once, to the owner, with the live address
  assert.equal(ctx.ses.sent.length, 1, "the first premiere mails the share kit once");
  assert.equal(ctx.ses.sent[0].to, "free1@x.io");
  assert.match(ctx.ses.sent[0].subject, /Free One is live/);
  assert.ok(ctx.ses.sent[0].html.includes("https://free-one.cinefolio.dev/"), "the kit carries the live address");

  // --- step 5: a SECOND release on the same film. The release is minted and the
  // pointer moves, but the premiere bell must stay silent - the console tells
  // that story now, not the inbox.
  const doc2 = "<!doctype html><html><body>reel two</body></html>";
  const p2 = parse(await h(ev("POST /sites/{id}/publish", { claims: who, path: { id }, body: { html: doc2 } })));
  assert.equal(p2.code, 200);
  assert.equal(p2.body.release, 2, "a new immutable release is minted");
  assert.deepEqual(ctx.kvs.puts.at(-1), ["free-one", `${id}/releases/2`], "the pointer flipped to release 2");
  // release 1 is still there, untouched: releases are immutable
  assert.equal(ctx.s3._store.get(`pub/sites/${id}/releases/1/index.html`), rel1, "release 1 is immutable");
  assert.match(ctx.s3._store.get(`pub/sites/${id}/releases/2/index.html`), /reel two/);
  assert.equal(ctx.ses.sent.length, 1, "the premiere email does NOT fire again on a later release");

  // the free journey never spent an AI cut, so the entitlement snapshot is intact
  assert.deepEqual(entitlementOfUser(parse(await h(ev("GET /me", { claims: who }))).body.user), entitlement(),
    "publishing manual films never spends an AI cut");
});

// pull the entitlement shape out of a /me user object (which also carries sub + admin)
function entitlementOfUser(u) {
  return {
    plan: u.plan, aiCuts: u.aiCuts, freeCutsLeft: u.freeCutsLeft, freeCutsLimit: u.freeCutsLimit,
    paidCredits: u.paidCredits, publishSlots: u.publishSlots, foundingSeatsLeft: u.foundingSeatsLeft, foundingPrice: u.foundingPrice,
  };
}

// ============================================================================
// JOURNEY 2 - THE PAYING JOURNEY
// The account spends its one free render, is refused on the second with a 402
// that carries the entitlement AND the checkout path, a signed payment webhook
// lands and mints credits, and the NEXT order succeeds on a paid credit. We
// assert: the credit is spent exactly once per order, the 402 carries the
// founding price and seat count, the purchase row has the right shape, the plan
// upgraded, the receipt email fired, and admin revenue reads the real sale while
// a test-mode purchase does NOT count.
// ============================================================================
test("paying journey: spend the free cut, hit the 402 register, pay the webhook, and the next order clears on a paid credit", async () => {
  const ctx = lsCtx();
  ctx.config.sesFrom = "info@cinefolio.dev"; // hear both the premiere and the register
  ctx.config.appOrigin = "https://app.cinefolio.dev";
  const h = makeHandler(async () => ctx);
  const who = "buyer";
  const orderBody = { email: "buyer@x.io", name: "Buyer One", role: "engineer", cvText: "2021 SRE at Acme\nterraform kubernetes aws platform" };

  // sign in so the profile exists (webhook will upgrade it, not create it)
  await h(ev("GET /me", { claims: who }));

  // --- step 1: the free AI render. freeCut, price 0, the free counter spent to 0.
  const o1 = parse(await h(ev("POST /studio/order", { claims: who, body: orderBody })));
  assert.equal(o1.code, 200);
  assert.equal(o1.body.paid, false, "the first cut is free");
  assert.equal(o1.body.price, 0);
  assert.equal(o1.body.freeCutsLeft, 0, "the single free cut is spent");
  assert.equal(o1.body.entitlement.aiCuts, 1);
  assert.equal(ctx.ddb._store.get(`USER#${who}|PROFILE`).aiCuts, 1, "the spend landed on the profile");
  assert.equal(ctx.queue.sent.length, 1, "the free order rides the production pipeline");

  // --- step 2: the SECOND attempt is refused with an honest 402. The refusal is
  // the moment of decision, so it must carry the register: the checkout path, the
  // list price, AND the founding-window snapshot (price 49, seats 20).
  const o2 = parse(await h(ev("POST /studio/order", { claims: who, body: orderBody })));
  assert.equal(o2.code, 402);
  assert.equal(o2.body.checkout, "/billing/checkout", "the 402 points at the register");
  assert.equal(o2.body.price, 99, "the 402 quotes the list price (CUT_PRICE)");
  assert.equal(o2.body.entitlement.freeCutsLeft, 0, "the refusal still carries the snapshot");
  assert.equal(o2.body.entitlement.paidCredits, 0);
  assert.equal(o2.body.entitlement.foundingPrice, 49, "the 402 carries the FOUNDING price the buyer will actually pay");
  assert.equal(o2.body.entitlement.foundingSeatsLeft, 20, "the 402 carries the seat count");
  // a 402 must never mint an order: only the free cut created one
  assert.equal(parse(await h(ev("GET /orders", { claims: who }))).body.orders.length, 1, "the 402 created no order");

  // --- step 3: the buyer pays. A correctly signed webhook for the configured
  // provider mints credits. This is a REAL (non-test) purchase at the list price
  // so it counts as revenue; test_mode is varied later.
  const raw = lsOrderBody("real-1", { sub: who, totalUsd: 9900, testMode: false });
  const paid = parse(await h(lsHook(raw)));
  assert.equal(paid.code, 200);
  assert.equal(paid.body.credited, true);
  assert.equal(paid.body.credits, 3, "the flagship mints three productions");
  // the purchase row is written with the right shape
  const purchase = ctx.ddb._store.get("LSORDER#real-1|META");
  assert.equal(purchase.type, "purchase");
  assert.equal(purchase.claimed, true, "the purchase is claimed to the buyer");
  assert.equal(purchase.userSub, who);
  assert.equal(purchase.credits, 3);
  assert.equal(purchase.totalUsd, 99, "the money is on the books in dollars");
  assert.equal(purchase.testMode, false, "a real sale, not a validation charge");
  // the credits landed and the plan upgraded
  assert.equal(ctx.ddb._store.get(`USER#${who}|PROFILE`).paidCredits, 3, "three credits banked");
  assert.equal(ctx.ddb._store.get(`USER#${who}|PROFILE`).plan, "director", "the flagship upgrades the plan");
  // the register rang: the receipt email fired to the buyer
  const receipt = ctx.ses.sent.find((m) => /Payment received/.test(m.subject));
  assert.ok(receipt, "the receipt email fired");
  assert.equal(receipt.to, "buyer@x.io");

  // --- step 4: the NEXT order clears, spending exactly one paid credit.
  const o3 = parse(await h(ev("POST /studio/order", { claims: who, body: orderBody })));
  assert.equal(o3.code, 200);
  assert.equal(o3.body.paid, true, "this cut is bought, not free");
  assert.equal(o3.body.price, 99);
  assert.equal(o3.body.entitlement.paidCredits, 2, "exactly ONE paid credit spent per order");
  assert.equal(o3.body.entitlement.plan, "director", "the order response reflects the upgraded plan");
  assert.equal(ctx.ddb._store.get(`USER#${who}|PROFILE`).paidCredits, 2, "the credit spend is race-safe and singular");
  // the buyer's ledger prices the paid cut at the list price
  const orders = parse(await h(ev("GET /orders", { claims: who }))).body.orders;
  assert.equal(orders.length, 2, "the free order and the paid order both exist");
  assert.ok(orders.some((o) => o.price === 99), "the paid order is priced");

  // --- step 5: a TEST-MODE purchase lands too (a provider validation charge).
  // It is recorded, it credits the account, but it must NOT count as revenue.
  const testRaw = lsOrderBody("test-1", { sub: who, totalUsd: 9900, testMode: true });
  assert.equal(parse(await h(lsHook(testRaw))).code, 200);
  assert.equal(ctx.ddb._store.get("LSORDER#test-1|META").testMode, true);

  // --- step 6: admin revenue reads the REAL sale only.
  const stats = parse(await h(ev("GET /admin/stats", { claims: "boss", groups: ["admin"] })));
  assert.equal(stats.code, 200);
  assert.equal(stats.body.revenue.totalUsd, 99, "revenue counts the real $99 sale, and only it");
  assert.equal(stats.body.revenue.payingCustomers, 1, "one real paying purchase");
  assert.equal(stats.body.revenue.revenue30, 99, "the real sale falls inside the 30-day window");
  assert.equal(stats.body.revenue.testCount, 1, "the test-mode purchase is seen but set aside");
  assert.equal(stats.body.revenue.goal.amountUsd, 99, "the chase toward 1000 counts only real money");
});

// ============================================================================
// JOURNEY 3 - THE REPLAY AND ABUSE JOURNEY
// The hard safety properties, asserted in one place: a webhook delivered twice
// mints once; a bad signature mints nothing and 401s; an unknown event is
// ignored gracefully; and a non-owner cannot publish, take down, delete or
// showcase somebody else's film (403 on each).
// ============================================================================
test("replay and abuse journey: a webhook mints once, forgeries and unknown events mint nothing, and a stranger cannot touch your film", async () => {
  const ctx = lsCtx();
  ctx.config.sesFrom = "info@cinefolio.dev";
  const h = makeHandler(async () => ctx);

  // --- replay: the SAME signed webhook twice mints credits exactly once.
  const raw = lsOrderBody("replay-1", { sub: "payer" });
  const first = parse(await h(lsHook(raw)));
  assert.equal(first.code, 200);
  assert.equal(first.body.credited, true);
  assert.equal(ctx.ddb._store.get("USER#payer|PROFILE").paidCredits, 3, "the first delivery minted three");
  const second = parse(await h(lsHook(raw)));
  assert.equal(second.code, 200);
  assert.equal(second.body.already, true, "the replay is recognized as already handled");
  assert.equal(ctx.ddb._store.get("USER#payer|PROFILE").paidCredits, 3, "the replay minted NOTHING extra");

  // --- forgery: a body signed with the wrong key mints nothing and 401s before
  // it can ever reach the crediting path.
  const forgedRaw = lsOrderBody("forgery-1", { sub: "payer" });
  const forged = parse(await h(lsHook(forgedRaw, "0".repeat(64))));
  assert.equal(forged.code, 401, "a bad signature is rejected");
  assert.equal(ctx.ddb._store.get("LSORDER#forgery-1|META") ?? null, null, "the forged order was never written");
  assert.equal(ctx.ddb._store.get("USER#payer|PROFILE").paidCredits, 3, "the forgery minted nothing");
  // a missing signature is likewise refused
  assert.equal(parse(await h({ ...ev("POST /billing/webhook"), body: forgedRaw })).code, 401, "a missing signature is refused");

  // --- unknown event: a correctly signed event we do not act on is acknowledged
  // gracefully (200, ignored) and mints nothing.
  const refundRaw = lsOrderBody("refund-1", { sub: "payer", event: "order_refunded" });
  const refund = parse(await h(lsHook(refundRaw)));
  assert.equal(refund.code, 200, "an unknown event is acknowledged, never 500");
  assert.equal(refund.body.ignored, "order_refunded", "the ignored event is named back");
  assert.equal(ctx.ddb._store.get("USER#payer|PROFILE").paidCredits, 3, "the ignored event minted nothing");

  // --- ownership: build a live film owned by "owner", then prove a stranger is
  // refused on every mutating verb.
  const site = parse(await h(ev("POST /sites", { claims: "owner", body: { title: "Owner Film" } }))).body.site;
  assert.equal(parse(await h(ev("POST /sites/{id}/publish", { claims: "owner", path: { id: site.siteId }, body: page("live") }))).code, 200);

  assert.equal(parse(await h(ev("POST /sites/{id}/publish", { claims: "stranger", path: { id: site.siteId }, body: page("hijack") }))).code, 403, "a stranger cannot publish your film");
  assert.equal(parse(await h(ev("POST /sites/{id}/showcase", { claims: "stranger", path: { id: site.siteId }, body: { showcase: true } }))).code, 403, "a stranger cannot showcase your film");
  assert.equal(parse(await h(ev("POST /sites/{id}/delete", { claims: "stranger", path: { id: site.siteId } }))).code, 403, "a stranger cannot delete your film");
  assert.equal(parse(await h(ev("DELETE /sites/{id}", { claims: "stranger", path: { id: site.siteId } }))).code, 403, "a stranger cannot take down your film");
  // and the film is untouched: still live, still owned, pointer never pulled by the stranger
  assert.equal(ctx.ddb._store.get(`SITE#${site.siteId}|META`).status, "live", "the film is still on the marquee after the abuse");
  assert.ok(!ctx.kvs.dels.includes(site.slug), "the stranger never pulled the pointer");
});

// ============================================================================
// JOURNEY 4 - THE MODERATION AND SHOWCASE JOURNEY
// A film premieres, the owner opts into the public showcase, the unauthenticated
// GET /showcase returns it with ONLY the public fields, the owner opts out, and
// the public read no longer returns it. We prove no private field (owner email,
// sub, order id) ever appears in the public payload by scanning the serialized
// response.
// ============================================================================
test("moderation and showcase journey: consent shows the film with only public fields, opt-out hides it, and no private field ever leaks", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const who = "creator";

  // an AI-born film so the site record actually CARRIES an orderId and owner sub
  // to prove neither leaks. Order it, deliver the cut, premiere from the cut.
  await h(ev("GET /me", { claims: who }));
  const gen = parse(await h(ev("POST /studio/order", { claims: who, body: { email: "creator@x.io", name: "Show Case", role: "designer", cvText: "2022 designer figma branding studio" } })));
  const orderId = gen.body.orderId;
  await h({ ...ev("POST /callback", { headers: { "x-cf-secret": "cbsec", "x-cf-order": orderId } }), body: "<!doctype html><html><body>the cut</body></html>" });
  const site = parse(await h(ev("POST /sites", { claims: who, body: { slug: "show-case", title: "Show Case" } }))).body.site;
  const pubd = parse(await h(ev("POST /sites/{id}/publish", { claims: who, path: { id: site.siteId }, body: { orderId } })));
  assert.equal(pubd.code, 200);
  // the site record does carry the private material we will prove never leaks
  const rec = ctx.ddb._store.get(`SITE#${site.siteId}|META`);
  assert.equal(rec.owner, who, "the record carries the owner sub");
  assert.equal(rec.orderId, orderId, "the record carries the order id");

  // --- before consent: the public wall does not show a film nobody opted in
  const before = parse(await h(ev("GET /showcase")));
  assert.equal(before.code, 200);
  assert.equal(before.body.films.find((f) => f.slug === "show-case") ?? null, null, "no consent, no showcase");

  // --- the owner opts in. The film is live so the REQUEST is accepted, but
  // the wall lists nothing until the Floor approves: consent flows
  // owner -> Floor -> public, and a pending request is never public.
  const optIn = parse(await h(ev("POST /sites/{id}/showcase", { claims: who, path: { id: site.siteId }, body: { showcase: true } })));
  assert.equal(optIn.code, 200);
  assert.equal(optIn.body.showcase, "pending");
  assert.equal(parse(await h(ev("GET /showcase"))).body.films.find((f) => f.slug === "show-case") ?? null, null, "a pending request is NOT on the public wall");

  // --- the owner cannot approve their own request; the Floor can.
  assert.equal(parse(await h(ev("POST /admin/sites/{id}/showcase", { claims: who, path: { id: site.siteId }, body: { approve: true } }))).code, 403, "only the admin group decides the queue");
  const approved = parse(await h(ev("POST /admin/sites/{id}/showcase", { claims: "floor-1", groups: ["admin"], path: { id: site.siteId }, body: { approve: true } })));
  assert.equal(approved.code, 200);
  assert.equal(approved.body.showcase, true);

  // --- the PUBLIC read (no auth) now returns the film as a public card.
  const shown = parse(await h(ev("GET /showcase")));
  assert.equal(shown.code, 200);
  const cardShown = shown.body.films.find((f) => f.slug === "show-case");
  assert.ok(cardShown, "the opted-in live film appears on the public wall");
  assert.equal(cardShown.title, "Show Case");
  assert.ok(String(cardShown.url).endsWith("/show-case/"), "the card carries the live address");
  // ONLY public fields. kind is a COARSE public role label (for example Engineer)
  // derived from a public field or the order role, never from a private one, and
  // it is omitted when no real value exists. poster appears only when the record
  // carries one, which it does not here. The guard below is the real protection:
  // no private field may appear under any name.
  const PUBLIC_KEYS = ["kind", "poster", "slug", "title", "url"];
  const keys = Object.keys(cardShown).sort();
  assert.ok(keys.every((k) => PUBLIC_KEYS.includes(k)), `the card carries ONLY curated public fields, saw: ${keys.join(", ")}`);
  assert.ok(keys.includes("slug") && keys.includes("title") && keys.includes("url"), "the card always carries slug, title and url");

  // --- the hard privacy property: scan the SERIALIZED public response and prove
  // no private field of any kind is anywhere in the bytes a stranger receives.
  const serialized = JSON.stringify(shown.body);
  assert.ok(!serialized.includes(who), "the owner sub never appears in the public payload");
  assert.ok(!serialized.includes("creator@x.io"), "the owner email never appears in the public payload");
  assert.ok(!serialized.includes(orderId), "the order id never appears in the public payload");
  assert.ok(!serialized.includes("owner"), "no owner field of any name leaks");
  assert.ok(!serialized.includes("trialEndsAt"), "no trial clock leaks");

  // --- moderation transition: a takedown must hide the film from the public
  // wall EVEN THOUGH consent is still stored (the read rule requires a live
  // pointer). This is the guarantee a reviewer cares about: pulling a film pulls
  // it from the gallery too, with no second opt-out step.
  assert.equal(parse(await h(ev("DELETE /sites/{id}", { claims: who, path: { id: site.siteId } }))).code, 200);
  assert.equal(ctx.ddb._store.get(`SITE#${site.siteId}|META`).showcase, true, "the consent flag is still stored after takedown");
  assert.equal(ctx.ddb._store.get(`SITE#${site.siteId}|META`).status, "taken_down");
  assert.equal(parse(await h(ev("GET /showcase"))).body.films.find((f) => f.slug === "show-case") ?? null, null, "a taken-down film vanishes from the wall despite stored consent");

  // --- relight it, then the explicit opt-out. Turning OFF works immediately, in
  // any status, and the public read no longer returns the film end to end.
  assert.equal(parse(await h(ev("POST /sites/{id}/rollback", { claims: who, path: { id: site.siteId }, body: {} }))).body.status, "live", "relight restores the live pointer");
  assert.equal(parse(await h(ev("GET /showcase"))).body.films.find((f) => f.slug === "show-case")?.slug, "show-case", "relit and still consented, the film is back on the wall");
  const optOut = parse(await h(ev("POST /sites/{id}/showcase", { claims: who, path: { id: site.siteId }, body: { showcase: false } })));
  assert.equal(optOut.code, 200);
  assert.equal(optOut.body.showcase, false);
  const after = parse(await h(ev("GET /showcase")));
  assert.equal(after.code, 200);
  assert.equal(after.body.films.find((f) => f.slug === "show-case") ?? null, null, "opt-out removes the film from the public wall end to end");
});
