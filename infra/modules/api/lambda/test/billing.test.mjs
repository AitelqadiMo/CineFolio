// node --test; the cash register, provider by provider. Verifies the doctrine
// that must hold no matter who the merchant is: constant-time signature checks
// (valid/invalid/missing), replay is idempotent per provider, the credits map
// mints the right count, a purchase upgrades the plan (never down), an
// unconfigured store is a fail-soft 503, and a forged body never mints a credit.
// Plus pricing v4: the founding fields ride the entitlement snapshot honestly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { checkout, webhook, foundingSeatsLeft } from "../billing.mjs";
import { getMe } from "../misc.mjs";
import { order } from "../studio.mjs";
import { entitlementOf, foundingSeatsLeftFrom, FOUNDING_PRICE, FOUNDING_SEATS, CUT_PRICE, DC_CREDITS } from "../lib.mjs";

// ---------- fakes (the in-memory ctx pattern from test/api.test.mjs) ----------
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
      // the free-cut and paid-credit spend guards from studio.mjs order(): the
      // seat-count tests exercise the real order handler, so this fake must
      // reject a spend past the limit exactly as DynamoDB would (mirrors the
      // same two conditions in test/api.test.mjs).
      if (ConditionExpression === "attribute_not_exists(aiCuts) OR aiCuts < :max"
        && item.aiCuts !== undefined && item.aiCuts >= ExpressionAttributeValues[":max"]) {
        throw Object.assign(new Error("spent"), { name: "ConditionalCheckFailedException" });
      }
      if (ConditionExpression === "paidCredits >= :one" && !((item.paidCredits || 0) >= ExpressionAttributeValues[":one"])) {
        throw Object.assign(new Error("no credits"), { name: "ConditionalCheckFailedException" });
      }
      // micro-interpreter for the SET/ADD expressions we actually use
      const resolve = (n) => ExpressionAttributeNames[n] || n;
      for (const clause of UpdateExpression.split(/SET|ADD/).filter(Boolean).map((c) => c.trim())) {
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
    // all-or-nothing: check EVERY condition first, then apply. A failed
    // condition cancels the whole transaction (nothing applied), exactly like
    // DynamoDB, so a replay's failed Put also rolls back the credit ADD.
    async transact(items) {
      for (const it of items) {
        if (it.Put?.ConditionExpression === "attribute_not_exists(PK)" && store.has(kv(it.Put.Item))) {
          throw Object.assign(new Error("cancelled"), { name: "TransactionCanceledException" });
        }
      }
      for (const it of items) {
        if (it.Put) { store.set(kv(it.Put.Item), structuredClone(it.Put.Item)); continue; }
        if (it.Update) {
          const { Key, UpdateExpression, ExpressionAttributeValues = {}, ExpressionAttributeNames = {} } = it.Update;
          const k = `${Key.PK}|${Key.SK}`;
          const item = store.get(k) || { ...Key };
          const resolve = (n) => ExpressionAttributeNames[n] || n;
          for (const clause of UpdateExpression.split(/SET|ADD/).filter(Boolean).map((c) => c.trim())) {
            for (const part of clause.split(/,(?![^(]*\))/).map((p) => p.trim()).filter(Boolean)) {
              if (part.includes("=")) {
                const [lhs, rhs] = part.split("=").map((x) => x.trim());
                item[resolve(lhs)] = ExpressionAttributeValues[rhs];
              } else {
                const m = part.match(/^(\S+)\s+(:\S+)$/);
                if (m) item[resolve(m[1])] = (item[resolve(m[1])] || 0) + ExpressionAttributeValues[m[2]];
              }
            }
          }
          store.set(k, item);
        }
      }
    },
    async query({ IndexName, ExpressionAttributeValues: v, ScanIndexForward }) {
      const items = [...store.values()];
      let out = items;
      if (IndexName === "GSI1") out = items.filter((i) => i.GSI1PK === v[":p"] && (!v[":s"] || String(i.GSI1SK).startsWith(v[":s"])));
      out = out.sort((a, b) => String(a.GSI1SK || "").localeCompare(String(b.GSI1SK || "")));
      return ScanIndexForward === false ? out.reverse() : out;
    },
    _store: store,
  };
  const ctx = {
    ddb,
    ses: { sent: [], async send(from, to, subject, html, opts = {}) { this.sent.push({ from, to, subject, html, replyTo: opts.replyTo, text: opts.text }); } },
    // default: Creem live, real (long) secret so configured() passes
    secrets: async () => ({ BILLING_PROVIDER: "creem", CREEM_BUY_URL_DC: "https://creem.io/pay/dc", CREEM_WEBHOOK_SECRET: "creem_secret_long_enough_1234567890" }),
    config: { appEnv: "test", appOrigin: "https://app.test", sesFrom: "studio@cinefolio.test" },
    ...overrides,
  };
  return ctx;
}

// build a POST /billing/webhook event with a raw JSON body + headers
const webhookEv = (bodyObj, headers = {}) => {
  const body = typeof bodyObj === "string" ? bodyObj : JSON.stringify(bodyObj);
  return { requestContext: { routeKey: "POST /billing/webhook" }, headers, body, isBase64Encoded: false };
};
const checkoutEv = (sub, email) => ({
  requestContext: { routeKey: "GET /billing/checkout", authorizer: { jwt: { claims: { sub, email } } } },
  headers: {}, queryStringParameters: null,
});
const parse = (r) => ({ code: r.statusCode, body: JSON.parse(r.body) });

// ---------- signature helpers per provider ----------
const CREEM_SECRET = "creem_secret_long_enough_1234567890";
const POLAR_SECRET = "whsec_polar_secret_long_enough_123456";
const LS_SECRET = "ls_secret_long_enough_1234567890abcd";

function creemSig(raw, secret = CREEM_SECRET) {
  return createHmac("sha256", secret).update(raw, "utf8").digest("hex");
}
function polarHeaders(raw, { id = "msg_1", ts = "1700000000", secret = POLAR_SECRET } = {}) {
  const key = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${raw}`, "utf8").digest("base64");
  return { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` };
}
function lsSig(raw, secret = LS_SECRET) {
  return createHmac("sha256", secret).update(raw, "utf8").digest("hex");
}

// canonical paid-order payloads per provider (real shapes from each provider's docs)
const creemPayload = (orderId, { sub = "u-creem", email = "buyer@x.io", amount = FOUNDING_PRICE * 100, product = "prod_dc", mode = "prod" } = {}) => ({
  id: `evt_${orderId}`, eventType: "checkout.completed", created_at: 1728734325927,
  object: { id: `ch_${orderId}`, object: "checkout", request_id: sub, metadata: { user_sub: sub },
    order: { id: orderId, object: "order", product, amount, currency: "USD", status: "paid", mode },
    product: { id: product }, customer: { email }, mode },
});
const polarPayload = (orderId, { sub = "u-polar", email = "buyer@x.io", amount = FOUNDING_PRICE * 100, product = "prod_dc" } = {}) => ({
  type: "order.paid",
  data: { id: orderId, status: "paid", paid: true, net_amount: amount, currency: "usd",
    product_id: product, metadata: { user_sub: sub }, customer: { email } },
});
const lsPayload = (orderId, { sub = "u-ls", email = "buyer@x.io", totalUsd = FOUNDING_PRICE * 100, variant = 42 } = {}) => ({
  meta: { event_name: "order_created", custom_data: { user_sub: sub } },
  data: { id: orderId, attributes: { user_email: email, status: "paid", total_usd: totalUsd, test_mode: false, identifier: `INV-${orderId}`, first_order_item: { variant_id: variant, product_id: 7, product_name: "The Director's Cut" } } },
});

// each provider under one table so the doctrine tests stay identical. pk() is
// the provider's idempotency partition key (Creem/Polar are namespaced under
// PURCHASE#<provider>#; LS keeps its historical LSORDER#; distinct, no collision).
const CASES = [
  { name: "creem", sub: "u-creem", pk: (id) => `PURCHASE#creem#${id}`, secretsBag: { BILLING_PROVIDER: "creem", CREEM_BUY_URL_DC: "https://creem.io/pay/dc", CREEM_WEBHOOK_SECRET: CREEM_SECRET },
    payload: creemPayload, headersFor: (raw) => ({ "creem-signature": creemSig(raw) }), badHeaders: (raw) => ({ "creem-signature": creemSig(raw).replace(/.$/, "0") }) },
  { name: "polar", sub: "u-polar", pk: (id) => `PURCHASE#polar#${id}`, secretsBag: { BILLING_PROVIDER: "polar", POLAR_BUY_URL_DC: "https://polar.sh/pay/dc", POLAR_WEBHOOK_SECRET: POLAR_SECRET },
    payload: polarPayload, headersFor: (raw) => polarHeaders(raw), badHeaders: (raw) => ({ ...polarHeaders(raw), "webhook-signature": "v1,Zm9yZ2VkZm9yZ2VkZm9yZ2VkZm9yZ2Vk" }) },
  { name: "lemonsqueezy", sub: "u-ls", pk: (id) => `LSORDER#${id}`, secretsBag: { BILLING_PROVIDER: "lemonsqueezy", LS_BUY_URL_DC: "https://ls.com/buy/dc", LS_WEBHOOK_SECRET: LS_SECRET },
    payload: lsPayload, headersFor: (raw) => ({ "x-signature": lsSig(raw) }), badHeaders: (raw) => ({ "x-signature": lsSig(raw).replace(/.$/, "0") }) },
];

// ---------- per-provider doctrine ----------
for (const c of CASES) {
  test(`${c.name}: valid signature on a paid order mints a credit and upgrades the plan`, async () => {
    const ctx = fakeCtx({ secrets: async () => c.secretsBag });
    const raw = JSON.stringify(c.payload("ORD1"));
    const r = parse(await webhook(webhookEv(raw, c.headersFor(raw)), ctx));
    assert.equal(r.code, 200);
    assert.equal(r.body.credited, true);
    assert.equal(r.body.credits, DC_CREDITS);
    // the credit landed on the buyer's profile
    const prof = ctx.ddb._store.get(`USER#${c.sub}|PROFILE`);
    assert.equal(prof.paidCredits, DC_CREDITS);
    assert.equal(prof.plan, "director"); // flagship -> director, an upgrade from free
    // the purchase row is keyed so ids cannot collide across providers
    assert.ok(ctx.ddb._store.has(`${c.pk("ORD1")}|META`));
    // a receipt email went out on success
    assert.equal(ctx.ses.sent.length, 1);
  });

  test(`${c.name}: invalid signature is 401 and never mints a credit`, async () => {
    const ctx = fakeCtx({ secrets: async () => c.secretsBag });
    const raw = JSON.stringify(c.payload("ORD2"));
    const r = await webhook(webhookEv(raw, c.badHeaders(raw)), ctx);
    assert.equal(r.statusCode, 401);
    assert.equal(ctx.ddb._store.size, 0, "a forged body writes nothing");
    assert.equal(ctx.ses.sent.length, 0);
  });

  test(`${c.name}: missing signature is 401`, async () => {
    const ctx = fakeCtx({ secrets: async () => c.secretsBag });
    const raw = JSON.stringify(c.payload("ORD3"));
    const r = await webhook(webhookEv(raw, {}), ctx); // no signature headers at all
    assert.equal(r.statusCode, 401);
    assert.equal(ctx.ddb._store.size, 0);
  });

  test(`${c.name}: replay of the same order id is idempotent (one credit, not two)`, async () => {
    const ctx = fakeCtx({ secrets: async () => c.secretsBag });
    const raw = JSON.stringify(c.payload("ORD4"));
    const first = parse(await webhook(webhookEv(raw, c.headersFor(raw)), ctx));
    assert.equal(first.code, 200);
    const again = parse(await webhook(webhookEv(raw, c.headersFor(raw)), ctx));
    assert.equal(again.code, 200);
    assert.equal(again.body.already, true, "the replay is recognized, not re-credited");
    assert.equal(ctx.ddb._store.get(`USER#${c.sub}|PROFILE`).paidCredits, DC_CREDITS, "still one grant");
    assert.equal(ctx.ses.sent.length, 1, "no second receipt on replay");
  });
}

// ---------- unconfigured store: fail-soft 503 ----------
test("webhook: an unconfigured provider (placeholder secret) is a fail-soft 503", async () => {
  const ctx = fakeCtx({ secrets: async () => ({ BILLING_PROVIDER: "creem", CREEM_WEBHOOK_SECRET: "unset" }) });
  const raw = JSON.stringify(creemPayload("ORD5"));
  const r = await webhook(webhookEv(raw, { "creem-signature": creemSig(raw) }), ctx);
  assert.equal(r.statusCode, 503);
  assert.equal(JSON.parse(r.body).error, "billing not configured");
  assert.equal(ctx.ddb._store.size, 0);
});

test("checkout: an unconfigured buy URL is a fail-soft 503, not a broken flow", async () => {
  const ctx = fakeCtx({ secrets: async () => ({ BILLING_PROVIDER: "creem", CREEM_BUY_URL_DC: "unset", CREEM_WEBHOOK_SECRET: CREEM_SECRET }) });
  const r = await checkout(checkoutEv("u1", "u1@x.io"), ctx);
  assert.equal(r.statusCode, 503);
});

// ---------- credits map ----------
test("credits map: an unmapped product mints the flagship default, a mapped one mints its count", async () => {
  const secretsBag = { BILLING_PROVIDER: "creem", CREEM_WEBHOOK_SECRET: CREEM_SECRET, CREDITS_MAP: JSON.stringify({ "prod_pack7": 7, default: DC_CREDITS }) };
  // unmapped product -> DC_CREDITS
  const ctxA = fakeCtx({ secrets: async () => secretsBag });
  const rawA = JSON.stringify(creemPayload("MAP1", { product: "prod_unknown", amount: CUT_PRICE * 100 }));
  const a = parse(await webhook(webhookEv(rawA, { "creem-signature": creemSig(rawA) }), ctxA));
  assert.equal(a.body.credits, DC_CREDITS);
  assert.equal(ctxA.ddb._store.get("USER#u-creem|PROFILE").plan, "director");

  // mapped 7-pack -> 7 credits and a coach upgrade
  const ctxB = fakeCtx({ secrets: async () => secretsBag });
  const rawB = JSON.stringify(creemPayload("MAP2", { product: "prod_pack7", amount: 29500 }));
  const b = parse(await webhook(webhookEv(rawB, { "creem-signature": creemSig(rawB) }), ctxB));
  assert.equal(b.body.credits, 7);
  assert.equal(ctxB.ddb._store.get("USER#u-creem|PROFILE").plan, "coach");
});

// ---------- plan upgrade only, never down ----------
test("plan upgrade: a coach who buys a single flagship cut stays a coach (never downgraded)", async () => {
  const ctx = fakeCtx({ secrets: async () => ({ BILLING_PROVIDER: "creem", CREEM_WEBHOOK_SECRET: CREEM_SECRET }) });
  // seed an existing coach
  ctx.ddb._store.set("USER#u-creem|PROFILE", { PK: "USER#u-creem", SK: "PROFILE", type: "user", plan: "coach", paidCredits: 7 });
  const raw = JSON.stringify(creemPayload("UP1", { amount: CUT_PRICE * 100 })); // flagship -> would be "director"
  await webhook(webhookEv(raw, { "creem-signature": creemSig(raw) }), ctx);
  const prof = ctx.ddb._store.get("USER#u-creem|PROFILE");
  assert.equal(prof.plan, "coach", "an upgrade-only path never demotes a coach to director");
  assert.equal(prof.paidCredits, 10, "but the flagship credits still stack on");
});

// ---------- namespacing across providers ----------
test("idempotency namespace: the same order id from two providers does not collide", async () => {
  const ctxCreem = fakeCtx({ secrets: async () => ({ BILLING_PROVIDER: "creem", CREEM_WEBHOOK_SECRET: CREEM_SECRET }) });
  const rawC = JSON.stringify(creemPayload("SAME"));
  assert.equal(parse(await webhook(webhookEv(rawC, { "creem-signature": creemSig(rawC) }), ctxCreem)).code, 200);
  // a polar webhook with the SAME order id, into the same store, is a distinct row
  const rawP = JSON.stringify(polarPayload("SAME"));
  ctxCreem.secrets = async () => ({ BILLING_PROVIDER: "polar", POLAR_WEBHOOK_SECRET: POLAR_SECRET });
  const p = parse(await webhook(webhookEv(rawP, polarHeaders(rawP)), ctxCreem));
  assert.equal(p.body.already ?? false, false, "not treated as a replay of the creem order");
  assert.ok(ctxCreem.ddb._store.has("PURCHASE#creem#SAME|META"));
  assert.ok(ctxCreem.ddb._store.has("PURCHASE#polar#SAME|META"));
});

// ---------- non-paid events are ignored, not credited ----------
test("webhook: a non-paid event (order.created on polar) is acknowledged but mints nothing", async () => {
  const ctx = fakeCtx({ secrets: async () => ({ BILLING_PROVIDER: "polar", POLAR_WEBHOOK_SECRET: POLAR_SECRET }) });
  const payload = { type: "order.created", data: { id: "PENDING1", paid: false, customer: { email: "x@x.io" }, metadata: { user_sub: "u-polar" } } };
  const raw = JSON.stringify(payload);
  const r = parse(await webhook(webhookEv(raw, polarHeaders(raw)), ctx));
  assert.equal(r.code, 200);
  assert.equal(r.body.ignored, "order.created");
  assert.equal(ctx.ddb._store.size, 0);
});

// ---------- checkout: personalized URL + honest founding price ----------
test("checkout: hands a personalized URL and the founding price while seats remain", async () => {
  const ctx = fakeCtx();
  const r = parse(await checkout(checkoutEv("sub-1", "buyer@x.io"), ctx));
  assert.equal(r.code, 200);
  assert.equal(r.body.provider, "creem");
  assert.equal(r.body.price, FOUNDING_PRICE, "founding price while seats remain");
  assert.equal(r.body.foundingSeatsLeft, FOUNDING_SEATS, "no founding purchases yet -> all seats open");
  assert.match(r.body.url, /metadata%5Buser_sub%5D=sub-1/); // sub rides along for the webhook
  assert.match(r.body.url, /email=buyer%40x\.io/);
});

test("checkout: once the founding seats are gone, the quoted price returns to CUT_PRICE", async () => {
  const ctx = fakeCtx();
  ctx.ddb._store.set("COUNTER|FOUNDING", { PK: "COUNTER", SK: "FOUNDING", count: FOUNDING_SEATS });
  const r = parse(await checkout(checkoutEv("sub-2", "b2@x.io"), ctx));
  assert.equal(r.body.foundingSeatsLeft, 0);
  assert.equal(r.body.price, CUT_PRICE);
});

test("checkout: signed-out is 401", async () => {
  const ctx = fakeCtx();
  const r = await checkout({ requestContext: {}, headers: {} }, ctx);
  assert.equal(r.statusCode, 401);
});

// ---------- founding counter advances only on a real founding purchase ----------
test("founding counter: a founding-priced purchase advances the real seat count by exactly one", async () => {
  const ctx = fakeCtx({ secrets: async () => ({ BILLING_PROVIDER: "creem", CREEM_WEBHOOK_SECRET: CREEM_SECRET }) });
  const raw = JSON.stringify(creemPayload("FND1", { amount: FOUNDING_PRICE * 100 }));
  await webhook(webhookEv(raw, { "creem-signature": creemSig(raw) }), ctx);
  assert.equal(ctx.ddb._store.get("COUNTER|FOUNDING").count, 1);
  // a replay must not advance it again (idempotency guards the counter too)
  await webhook(webhookEv(raw, { "creem-signature": creemSig(raw) }), ctx);
  assert.equal(ctx.ddb._store.get("COUNTER|FOUNDING").count, 1);
});

test("founding counter: a post-founding (full-price) purchase does not touch the seat count", async () => {
  const ctx = fakeCtx({ secrets: async () => ({ BILLING_PROVIDER: "creem", CREEM_WEBHOOK_SECRET: CREEM_SECRET }) });
  const raw = JSON.stringify(creemPayload("FULL1", { amount: CUT_PRICE * 100 }));
  await webhook(webhookEv(raw, { "creem-signature": creemSig(raw) }), ctx);
  assert.equal(ctx.ddb._store.get("COUNTER|FOUNDING"), undefined, "full-price sale is not a founding seat");
});

// ---------- entitlement snapshot: the founding fields ----------
test("entitlement snapshot: founding fields ride the snapshot honestly", () => {
  // no count supplied -> null seats, price held open (never a fabricated number)
  const blind = entitlementOf({ plan: "free" });
  assert.equal(blind.foundingSeatsLeft, null);
  assert.equal(blind.foundingPrice, FOUNDING_PRICE);
  assert.ok("foundingSeatsLeft" in blind && "foundingPrice" in blind, "keys always present so the console can read them");

  // a real remaining count -> real seats + founding price (pricing-v3 profile)
  const open = entitlementOf({ plan: "free", freeCutsLimit: 1 }, 5);
  assert.equal(open.foundingSeatsLeft, 5);
  assert.equal(open.foundingPrice, FOUNDING_PRICE);

  // sold out -> zero seats + the post-founding price
  const closed = entitlementOf({ plan: "director" }, 0);
  assert.equal(closed.foundingSeatsLeft, 0);
  assert.equal(closed.foundingPrice, CUT_PRICE);

  // the existing shape is preserved alongside the new fields
  assert.deepEqual(
    { plan: open.plan, aiCuts: open.aiCuts, freeCutsLeft: open.freeCutsLeft, freeCutsLimit: open.freeCutsLimit, paidCredits: open.paidCredits, publishSlots: open.publishSlots },
    { plan: "free", aiCuts: 0, freeCutsLeft: 1, freeCutsLimit: 1, paidCredits: 0, publishSlots: 1 }
  );
});

test("foundingSeatsLeftFrom: clamps untrusted input, never a fake number", () => {
  assert.equal(foundingSeatsLeftFrom(0), FOUNDING_SEATS);
  assert.equal(foundingSeatsLeftFrom(FOUNDING_SEATS + 3), 0, "oversold clamps to zero, never negative");
  assert.equal(foundingSeatsLeftFrom("nonsense"), null, "unparseable -> unknown, not a guess");
});

// ---------- the real seat count reaches every entitlement snapshot ----------
// Pricing v4 makes scarcity honest exactly where a user decides to pay. The
// counter is read via ONE shared helper (billing.mjs foundingSeatsLeft), so /me
// and both order responses (the 200 success and the 402 refusal, the moment of
// decision) all speak the same true number the checkout already quotes.

// GET /me event for a signed-in user
const meEv = (sub, email = `${sub}@x.io`) => ({
  requestContext: { routeKey: "GET /me", authorizer: { jwt: { claims: { sub, email } } } },
  headers: {}, queryStringParameters: null,
});
// POST /studio/order event for a signed-in user; a valid CV so parseCV is happy
const orderEv = (sub, email = `${sub}@x.io`) => ({
  requestContext: { routeKey: "POST /studio/order", authorizer: { jwt: { claims: { sub, email } } } },
  headers: {}, queryStringParameters: null,
  body: JSON.stringify({ email, name: "Buyer", role: "designer", cvText: "2020 designer figma branding" }),
  isBase64Encoded: false,
});
// seed the founding counter to a chosen number of sold seats
const seedFounding = (ctx, soldCount) => ctx.ddb._store.set("COUNTER|FOUNDING", { PK: "COUNTER", SK: "FOUNDING", count: soldCount });

test("shared reader: foundingSeatsLeft is the ONE helper and reads COUNTER/FOUNDING identically", async () => {
  const ctx = fakeCtx();
  // a missing row is zero founding purchases -> the full FOUNDING_SEATS, never null
  assert.equal(await foundingSeatsLeft(ctx), FOUNDING_SEATS, "missing row reads as full seats, not null");
  seedFounding(ctx, 5);
  assert.equal(await foundingSeatsLeft(ctx), FOUNDING_SEATS - 5, "a real count yields real seats-left");
  seedFounding(ctx, FOUNDING_SEATS + 4);
  assert.equal(await foundingSeatsLeft(ctx), 0, "oversold clamps to zero");
});

test("/me: the real founding-seat count reaches the entitlement snapshot", async () => {
  const ctx = fakeCtx();
  seedFounding(ctx, 5); // 5 sold -> 15 seats left
  const r = parse(await getMe(meEv("me-real"), ctx));
  assert.equal(r.code, 200);
  assert.equal(r.body.user.foundingSeatsLeft, FOUNDING_SEATS - 5, "/me carries the real number, not null");
  assert.equal(r.body.user.foundingPrice, FOUNDING_PRICE, "seats remain -> founding price still shown");
});

test("/me: a missing counter row reads as FULL seats, never null (the honest answer is computable)", async () => {
  const ctx = fakeCtx(); // no COUNTER/FOUNDING row seeded
  const r = parse(await getMe(meEv("me-missing"), ctx));
  assert.equal(r.body.user.foundingSeatsLeft, FOUNDING_SEATS, "no founding purchases yet -> all seats open, not null");
  assert.equal(r.body.user.foundingPrice, FOUNDING_PRICE);
});

test("/me: the seat count clamps at zero and the price flips to CUT_PRICE once the window closes", async () => {
  const ctx = fakeCtx();
  seedFounding(ctx, FOUNDING_SEATS + 3); // oversold: clamps to zero, never negative
  const r = parse(await getMe(meEv("me-closed"), ctx));
  assert.equal(r.body.user.foundingSeatsLeft, 0, "clamped at zero, never below");
  assert.equal(r.body.user.foundingPrice, CUT_PRICE, "window closed -> the post-founding price");
});

test("/me: a counter read failure degrades to null (unknown), never breaks sign-in", async () => {
  const ctx = fakeCtx();
  const realGet = ctx.ddb.get.bind(ctx.ddb);
  // only the counter read fails; the profile read must still succeed so /me works
  ctx.ddb.get = async (Key) => {
    if (Key.PK === "COUNTER" && Key.SK === "FOUNDING") throw new Error("ddb hiccup");
    return realGet(Key);
  };
  const r = parse(await getMe(meEv("me-degraded"), ctx));
  assert.equal(r.code, 200, "sign-in still succeeds through a counter hiccup");
  assert.equal(r.body.user.foundingSeatsLeft, null, "unknown, never a fabricated or zero seat number");
  assert.equal(r.body.user.foundingPrice, FOUNDING_PRICE, "null holds the founding price open");
});

test("order 200: the real founding-seat count reaches the success snapshot", async () => {
  const ctx = fakeCtx();
  seedFounding(ctx, 5); // 15 seats left
  const r = parse(await order(orderEv("ord-real"), ctx));
  assert.equal(r.code, 200);
  assert.equal(r.body.entitlement.foundingSeatsLeft, FOUNDING_SEATS - 5, "the 200 carries the real number");
  assert.equal(r.body.entitlement.foundingPrice, FOUNDING_PRICE);
});

test("order 200: a missing counter row reads as FULL seats, not null", async () => {
  const ctx = fakeCtx(); // no counter row
  const r = parse(await order(orderEv("ord-missing"), ctx));
  assert.equal(r.code, 200);
  assert.equal(r.body.entitlement.foundingSeatsLeft, FOUNDING_SEATS, "the honest answer is computable -> full seats");
});

test("order 402: the refusal (the moment of decision) carries the real seat count too", async () => {
  const ctx = fakeCtx();
  seedFounding(ctx, 5); // 15 seats left
  // spend the single free cut first (NEW_FREE_CUTS = 1), so the second order refuses
  const first = parse(await order(orderEv("ord-402"), ctx));
  assert.equal(first.code, 200);
  const second = parse(await order(orderEv("ord-402"), ctx));
  assert.equal(second.code, 402, "free cut spent, no paid credit -> the register");
  assert.equal(second.body.entitlement.foundingSeatsLeft, FOUNDING_SEATS - 5, "scarcity rides the refusal, honestly");
  assert.equal(second.body.entitlement.foundingPrice, FOUNDING_PRICE);
});

test("order 402: the seat count clamps at zero and the price flips to CUT_PRICE when closed", async () => {
  const ctx = fakeCtx();
  seedFounding(ctx, FOUNDING_SEATS + 2); // oversold
  const first = parse(await order(orderEv("ord-402-closed"), ctx));
  assert.equal(first.code, 200);
  const second = parse(await order(orderEv("ord-402-closed"), ctx));
  assert.equal(second.code, 402);
  assert.equal(second.body.entitlement.foundingSeatsLeft, 0, "clamped at zero on the refusal");
  assert.equal(second.body.entitlement.foundingPrice, CUT_PRICE, "window closed -> 99 on the refusal");
});

test("order: a counter read failure degrades to null without failing the purchase (200 stays 200)", async () => {
  const ctx = fakeCtx();
  const realGet = ctx.ddb.get.bind(ctx.ddb);
  ctx.ddb.get = async (Key) => {
    if (Key.PK === "COUNTER" && Key.SK === "FOUNDING") throw new Error("ddb hiccup");
    return realGet(Key);
  };
  const r = parse(await order(orderEv("ord-degraded"), ctx));
  assert.equal(r.code, 200, "a counter hiccup never breaks a purchase");
  assert.equal(r.body.entitlement.foundingSeatsLeft, null, "degraded to unknown, not a fabricated or zero number");
  assert.equal(r.body.entitlement.foundingPrice, FOUNDING_PRICE, "null holds the founding price open");
});

test("crash safety: the purchase claim and the credit grant are ATOMIC (all or nothing)", async () => {
  // the crash window this closes: the claim used to commit before the grant, so
  // a failure between them left a paid purchase marked claimed with no credit.
  // We prove atomicity two ways against the transactional path.
  const secretsBag = { BILLING_PROVIDER: "creem", CREEM_BUY_URL_DC: "https://creem.io/pay/dc", CREEM_WEBHOOK_SECRET: CREEM_SECRET };

  // 1) success: the purchase row AND the credit both land, together.
  const ctx = fakeCtx({ secrets: async () => secretsBag });
  const raw = JSON.stringify(creemPayload("ATOM1", { sub: "u-atom" }));
  const ok1 = parse(await webhook(webhookEv(raw, { "creem-signature": creemSig(raw) }), ctx));
  assert.equal(ok1.code, 200);
  assert.ok(ctx.ddb._store.has("PURCHASE#creem#ATOM1|META"), "purchase row landed");
  assert.equal(ctx.ddb._store.get("USER#u-atom|PROFILE").paidCredits, DC_CREDITS, "credit landed with it");

  // 2) if the transaction itself throws (a real DDB transact failure, not a
  //    replay), NEITHER the purchase nor the credit is written: the webhook
  //    surfaces the error (provider retries) rather than half-applying.
  const ctx2 = fakeCtx({ secrets: async () => secretsBag });
  ctx2.ddb.transact = async () => { throw Object.assign(new Error("ProvisionedThroughputExceeded"), { name: "ProvisionedThroughputExceededException" }); };
  const raw2 = JSON.stringify(creemPayload("ATOM2", { sub: "u-atom2" }));
  await assert.rejects(webhook(webhookEv(raw2, { "creem-signature": creemSig(raw2) }), ctx2), /ProvisionedThroughput/);
  assert.ok(!ctx2.ddb._store.has("PURCHASE#creem#ATOM2|META"), "no purchase row on a transaction failure");
  assert.equal(ctx2.ddb._store.get("USER#u-atom2|PROFILE"), undefined, "no orphaned credit on a transaction failure");

  // 3) a replay cancels the transaction on the idempotency condition: still
  //    exactly one credit, and the second call reports already.
  const replay = parse(await webhook(webhookEv(raw, { "creem-signature": creemSig(raw) }), ctx));
  assert.equal(replay.body.already, true, "replay is idempotent");
  assert.equal(ctx.ddb._store.get("USER#u-atom|PROFILE").paidCredits, DC_CREDITS, "still exactly one grant after replay");
});

test("purchase history: the buyer sees their own purchases, never anyone else's, and the webhook writes the GSI keys", async () => {
  const { purchases } = await import("../billing.mjs");
  const secretsBag = { BILLING_PROVIDER: "creem", CREEM_BUY_URL_DC: "https://creem.io/pay/dc", CREEM_WEBHOOK_SECRET: CREEM_SECRET };
  const ctx = fakeCtx({ secrets: async () => secretsBag });

  // a real webhook purchase writes the buyer's GSI keys (the paper-trail index)
  const raw = JSON.stringify(creemPayload("HIST1", { sub: "u-hist" }));
  await webhook(webhookEv(raw, { "creem-signature": creemSig(raw) }), ctx);
  const row = ctx.ddb._store.get("PURCHASE#creem#HIST1|META");
  assert.equal(row.GSI1PK, "USER#u-hist", "purchase row is indexed under the buyer");
  assert.match(row.GSI1SK, /^PURCHASE#/, "sortable under the PURCHASE# prefix");

  // a second buyer's purchase lands under their own partition
  const raw2 = JSON.stringify(creemPayload("HIST2", { sub: "u-other" }));
  await webhook(webhookEv(raw2, { "creem-signature": creemSig(raw2) }), ctx);

  // the route returns only the caller's purchases, shaped for the ledger UI
  const ev2 = { requestContext: { routeKey: "GET /billing/purchases", authorizer: { jwt: { claims: { sub: "u-hist", email: "u-hist@x.io" } } } }, headers: {} };
  const r = JSON.parse((await purchases(ev2, ctx)).body);
  assert.equal(r.ok, true);
  assert.equal(r.purchases.length, 1, "only the caller's own rows");
  assert.equal(r.purchases[0].reference, "HIST1");
  assert.equal(r.purchases[0].credits, DC_CREDITS);
  assert.equal(r.purchases[0].amountUsd, FOUNDING_PRICE);
  assert.equal(r.purchases[0].provider, "creem");

  // an anonymous purchase (no user_sub) is recorded but never indexed to a user
  const rawAnon = JSON.stringify(creemPayload("HIST3", { sub: "" }));
  await webhook(webhookEv(rawAnon, { "creem-signature": creemSig(rawAnon) }), ctx);
  const anonRow = ctx.ddb._store.get("PURCHASE#creem#HIST3|META");
  assert.equal(anonRow?.GSI1PK, undefined, "anonymous purchases carry no user index");
});
