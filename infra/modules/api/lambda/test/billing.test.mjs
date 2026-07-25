// node --test; the cash register, provider by provider. Verifies the doctrine
// that must hold no matter who the merchant is: constant-time signature checks
// (valid/invalid/missing), replay is idempotent per provider, the credits map
// mints the right count, a purchase upgrades the plan (never down), an
// unconfigured store is a fail-soft 503, and a forged body never mints a credit.
// Plus pricing v4: the founding fields ride the entitlement snapshot honestly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { checkout, webhook } from "../billing.mjs";
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
