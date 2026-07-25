// billing.mjs; the cash register. A merchant of record sells the Director's Cut
// (they are the legal seller; we never touch card data or VAT). Money becomes an
// entitlement here, and only here:
//   GET  /billing/checkout (JWT)    -> the buyer's personalized checkout URL
//   POST /billing/webhook  (public) -> a paid order lands a paid credit,
//                                      race-safe and replay-proof
// The credit is spent by POST /studio/order exactly like a free cut, so the
// pipeline stays payment-agnostic. Fail-soft doctrine: an unconfigured store
// is an honest 503, never a broken order flow; the register ships before the
// store opens, and goes live the moment the SSM parameters exist.
//
// v4 is multi-provider. Lemon Squeezy rejected us on Jul 21, so Creem is now
// the primary merchant, Polar the backup, and LS is kept as a third option for
// the day it comes back. A single SSM parameter, BILLING_PROVIDER, selects who
// is live; each provider is an adapter (verify + event name + normalize) behind
// one identical doctrine so the money path never forks. The parameters, per env:
//   {prefix}/BILLING_PROVIDER    "creem" | "polar" | "lemonsqueezy" (default creem)
//   {prefix}/CREEM_BUY_URL_DC    the Director's Cut buy link (Creem)
//   {prefix}/CREEM_WEBHOOK_SECRET  the signing secret set on the Creem webhook
//   {prefix}/POLAR_BUY_URL_DC    the Director's Cut buy link (Polar)
//   {prefix}/POLAR_WEBHOOK_SECRET  the Polar (Standard Webhooks) signing secret
//   {prefix}/LS_BUY_URL_DC       the Director's Cut buy link (Lemon Squeezy)
//   {prefix}/LS_WEBHOOK_SECRET   the LS webhook signing secret (X-Signature HMAC)
//   {prefix}/CREDITS_MAP         optional JSON {"product:<id>":7,"variant:<id>":7,"default":3}
//                                mapping a purchase to minted production credits;
//                                unmapped purchases mint DC_CREDITS (the flagship default)
import { createHmac } from "node:crypto";
import { ok, bad, json, claimsOf, now, safeEqual, CUT_PRICE, FOUNDING_PRICE, DC_CREDITS, foundingSeatsLeftFrom } from "./lib.mjs";
import { sendEmail, paymentReceivedEmail } from "./email.mjs";

// which provider is live. BILLING_PROVIDER is the explicit switch; when it is
// unset we auto-detect the first provider whose webhook secret is actually
// configured, in preference order (Creem primary, Polar backup, LS last). This
// keeps a single-provider environment working without the switch, and makes
// Creem win the moment its secret exists; never the rejected store by accident.
const PROVIDER_ORDER = ["creem", "polar", "lemonsqueezy"];
function providerName(secrets) {
  const explicit = String(secrets.BILLING_PROVIDER || "").trim().toLowerCase();
  if (PROVIDERS[explicit]) return explicit;
  for (const p of PROVIDER_ORDER) if (configured(secrets[PROVIDERS[p].secretKey])) return p;
  return PROVIDER_ORDER[0]; // nothing configured: fall to the primary and let it 503
}

// a real signing secret is long random material; anything short is the
// Terraform placeholder ("unset") or a misconfiguration; never verify against
// those, and never guess a buy URL from them.
const configured = (v) => typeof v === "string" && v.length >= 16 && v !== "unset";

// case-insensitive header read: API Gateway lower-cases header names, but tests
// and other gateways may not, and the webhook auth must not hinge on casing.
function header(headers, name) {
  if (!headers) return undefined;
  const want = name.toLowerCase();
  for (const k of Object.keys(headers)) if (k.toLowerCase() === want) return headers[k];
  return undefined;
}

// ---------- provider adapters ----------
// Each adapter is: { secretKey, buyUrlKey, verify, eventName, isPaid, normalize }.
//   verify(raw, headers, secret) -> boolean   constant-time, over the RAW body
//   eventName(payload, headers)  -> string     the provider's event label
//   isPaid(eventName)            -> boolean     is this "a paid order was created"
//   normalize(payload)           -> { providerOrderId, email, userSub, credits?, totalUsd, testMode, product }
// normalize returns credits undefined when the provider does not itself decide
// the count; the shared CREDITS_MAP (below) is the single place that maps a
// purchase to minted credits, so a new pack never needs a code change.

const creem = {
  secretKey: "CREEM_WEBHOOK_SECRET",
  buyUrlKey: "CREEM_BUY_URL_DC",
  // namespaced PK so a Creem "ord_1" can never collide with another provider's id
  pk: (id) => `PURCHASE#creem#${id}`,
  // Creem signs the raw body with HMAC-SHA256 and sends it hex-encoded in the
  // creem-signature header (verified against docs.creem.io/code/webhooks).
  verify(raw, headers, secret) {
    const given = header(headers, "creem-signature");
    const expected = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
    return safeEqual(given, expected);
  },
  eventName(payload) {
    return payload?.eventType || "";
  },
  // a one-time purchase completes as checkout.completed; the nested order is paid.
  isPaid(name) {
    return name === "checkout.completed";
  },
  normalize(payload) {
    const obj = payload?.object || {};
    const order = obj.order || {};
    // the order id is the money's identity; Creem retries on non-200s against
    // the SAME order, so this is the idempotency key.
    const providerOrderId = String(order.id || "");
    // metadata is our own custom data set at checkout; request_id is Creem's
    // echo of any tracking id we passed. Either may carry the Cognito sub.
    const meta = obj.metadata || {};
    const userSub = String(meta.user_sub || obj.request_id || "").trim() || null;
    const email = String(obj.customer?.email || meta.email || "").trim().toLowerCase() || null;
    // amount is in the currency's minor units (cents); status gates crediting.
    const paidStatus = !order.status || order.status === "paid";
    // mode is "prod"/"live" in production; anything else (local/sandbox/test)
    // is a test purchase that must be recorded but flagged.
    const testMode = !["prod", "live", "production"].includes(String(obj.mode || order.mode || "").toLowerCase());
    return {
      providerOrderId,
      email,
      userSub,
      totalUsd: Number.isFinite(order.amount) ? order.amount / 100 : null,
      testMode,
      // product id drives the CREDITS_MAP lookup for packs beyond the flagship.
      product: order.product ? String(order.product) : (obj.product?.id ? String(obj.product.id) : null),
      paid: paidStatus,
    };
  },
};

const polar = {
  secretKey: "POLAR_WEBHOOK_SECRET",
  buyUrlKey: "POLAR_BUY_URL_DC",
  pk: (id) => `PURCHASE#polar#${id}`,
  // Polar follows the Standard Webhooks spec: sign id.timestamp.body with
  // HMAC-SHA256, base64 the digest, and send space-separated "v1,<sig>" tokens
  // in webhook-signature (headers webhook-id, webhook-timestamp carry the rest).
  // ASSUMPTION we could not fully verify from a single canonical source: Polar
  // uses the whsec_ secret as RAW UTF-8 key material (strip the prefix), NOT
  // base64-decoded the way Svix does. Multiple community SDKs confirm Polar's
  // raw-UTF-8 behavior, so we key on the raw string; if a future Polar secret
  // is genuinely base64, this is the one line to revisit.
  verify(raw, headers, secret) {
    const id = header(headers, "webhook-id");
    const ts = header(headers, "webhook-timestamp");
    const sigHeader = header(headers, "webhook-signature");
    if (!id || !ts || !sigHeader) return false;
    const key = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const signed = `${id}.${ts}.${raw}`;
    const expected = createHmac("sha256", key).update(signed, "utf8").digest("base64");
    // the header may carry several signatures (key rotation); a match on ANY
    // valid one authenticates, and each compare is constant-time.
    for (const token of String(sigHeader).split(" ")) {
      const given = token.includes(",") ? token.slice(token.indexOf(",") + 1) : token;
      if (safeEqual(given, expected)) return true;
    }
    return false;
  },
  eventName(payload) {
    return payload?.type || "";
  },
  // order.paid is the settled one-time purchase; order.created can precede
  // payment, so we credit only on paid to never mint before the money clears.
  isPaid(name) {
    return name === "order.paid";
  },
  normalize(payload) {
    const d = payload?.data || {};
    const providerOrderId = String(d.id || "");
    const meta = d.metadata || {};
    const userSub = String(meta.user_sub || d.customer?.metadata?.user_sub || "").trim() || null;
    const email = String(d.customer?.email || d.customer_email || meta.email || "").trim().toLowerCase() || null;
    // net_amount is in cents; d.paid is the boolean settlement flag, status the label.
    const paid = d.paid === true || d.status === "paid" || d.status === "succeeded";
    return {
      providerOrderId,
      email,
      userSub,
      totalUsd: Number.isFinite(d.net_amount) ? d.net_amount / 100 : (Number.isFinite(d.amount) ? d.amount / 100 : null),
      testMode: !!(d.test_mode ?? d.testMode ?? false),
      product: d.product_id ? String(d.product_id) : (d.product?.id ? String(d.product.id) : null),
      paid,
    };
  },
};

const lemonsqueezy = {
  secretKey: "LS_WEBHOOK_SECRET",
  buyUrlKey: "LS_BUY_URL_DC",
  // LS keeps its historical PK (LSORDER#<id>): rows written before v4 must still
  // dedupe, and its distinct namespace already cannot collide with PURCHASE#*.
  pk: (id) => `LSORDER#${id}`,
  // LS reads its own credits map (LS_CREDITS_MAP) first for backward
  // compatibility, then the shared CREDITS_MAP; keys are LS's variant:/product:.
  creditsMapKeys: ["LS_CREDITS_MAP", "CREDITS_MAP"],
  // LS signs the raw body with HMAC-SHA256, hex, in X-Signature (unchanged from
  // the original single-provider register).
  verify(raw, headers, secret) {
    const given = header(headers, "x-signature");
    const expected = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
    return safeEqual(given, expected);
  },
  eventName(payload, headers) {
    return payload?.meta?.event_name || header(headers, "x-event-name") || "";
  },
  isPaid(name) {
    return name === "order_created";
  },
  normalize(payload) {
    const data = payload?.data;
    const attrs = data?.attributes || {};
    const item0 = attrs.first_order_item || {};
    // LS carries an explicit status; a non-paid order is reported with its exact
    // label so operators (and the existing tests) see "status <x>", not a generic
    // rejection. paidReason rides only when the order is present but not paid.
    const paid = !attrs.status || attrs.status === "paid";
    return {
      providerOrderId: String(data?.id || ""),
      email: String(attrs.user_email || "").trim().toLowerCase() || null,
      userSub: String(payload?.meta?.custom_data?.user_sub || "").trim() || null,
      totalUsd: typeof attrs.total_usd === "number" ? attrs.total_usd / 100 : null,
      testMode: !!attrs.test_mode,
      // LS keys credits by variant OR product; keep both so the shared map works.
      product: item0.variant_id != null ? `variant:${item0.variant_id}` : (item0.product_id != null ? `product:${item0.product_id}` : null),
      productName: item0.product_name || null,
      identifier: attrs.identifier || null,
      paid,
      unpaidReason: paid ? null : `status ${attrs.status}`,
    };
  },
};

const PROVIDERS = { creem, polar, lemonsqueezy };

// how many production credits does this purchase mint? The map lives in SSM so
// new packs never need a deploy; anything unmapped mints the flagship Director's
// Cut count; the safest default for the product we sell most. The lookup key is
// the provider's product identifier (Creem/Polar: "<product_id>"; LS keeps its
// "variant:<id>"/"product:<id>" form), so one map spans every provider. A
// provider may name its own map parameter first (LS keeps LS_CREDITS_MAP for
// backward compatibility) and the shared CREDITS_MAP is the fallback for all.
function creditsFor(shape, secrets, provider) {
  const mapKeys = provider?.creditsMapKeys || ["CREDITS_MAP"];
  for (const mapKey of mapKeys) {
    if (!secrets[mapKey]) continue;
    try {
      const map = JSON.parse(secrets[mapKey]);
      const key = shape.product;
      const hit = Number(map[key] ?? map[`product:${key}`] ?? map.default);
      if (Number.isFinite(hit) && hit > 0) return hit;
      // a valid map that simply does not mention this product -> flagship default
      return DC_CREDITS;
    } catch {
      console.error(JSON.stringify({ level: "warn", msg: `${mapKey} is not valid json; minting flagship default`, orderId: shape.providerOrderId }));
      return DC_CREDITS;
    }
  }
  return DC_CREDITS;
}

// GET /billing/checkout; hand the signed-in buyer their checkout URL for the
// active provider: email prefilled, Cognito sub riding along as custom data so
// the webhook can land the credit on the right account even from another device.
// The price shown is honest about the founding window: the first FOUNDING_SEATS
// buyers see FOUNDING_PRICE, everyone after sees CUT_PRICE. We read the real
// founding counter here (one O(1) GetItem), so the number the buyer is quoted is
// never a guess.
export async function checkout(event, ctx) {
  const claims = claimsOf(event);
  if (!claims?.sub) return json(401, { ok: false, error: "sign in to unlock a paid cut" });
  const secrets = await ctx.secrets();
  const name = providerName(secrets);
  const provider = PROVIDERS[name];
  const base = secrets[provider.buyUrlKey];
  let url;
  // the Terraform placeholder ("unset") fails URL parsing -> honest 503
  try { url = new URL(base); } catch { return json(503, { ok: false, error: "checkout_unavailable" }); }

  // the founding price is only real if we can read the running count cheaply;
  // if the counter read fails we hold the founding price open (the window is
  // open far more often than shut) rather than over-charge on a transient error.
  const seatsLeft = await foundingSeatsLeft(ctx).catch(() => null);
  const price = seatsLeft === null || seatsLeft > 0 ? FOUNDING_PRICE : CUT_PRICE;

  // prefill differs per provider: LS reads checkout[...] query params; Creem and
  // Polar read email + a metadata/custom bag. We set both families so a buy link
  // works whichever provider owns it, and neither provider trips on the other's.
  if (claims.email) {
    url.searchParams.set("checkout[email]", String(claims.email)); // LS shape
    url.searchParams.set("email", String(claims.email));            // Creem/Polar shape
    url.searchParams.set("customer_email", String(claims.email));   // Polar hosted-checkout alias
  }
  url.searchParams.set("checkout[custom][user_sub]", String(claims.sub)); // LS custom data
  url.searchParams.set("metadata[user_sub]", String(claims.sub));         // Creem/Polar metadata
  url.searchParams.set("request_id", String(claims.sub));                 // Creem tracking id echo
  return ok({ ok: true, provider: name, url: url.toString(), price, foundingSeatsLeft: seatsLeft });
}

// the running count of founding purchases, kept as a real O(1) counter row so
// the seat number is never fabricated. Returns seats-left (a real number) or
// null when the row cannot be read (degraded DDB); callers treat null as
// "unknown", never as zero. Exported as the ONE shared reader so checkout, /me,
// and both order responses read the seat count identically (a missing row means
// zero founding purchases, so seats-left is the full FOUNDING_SEATS, never null).
export async function foundingSeatsLeft(ctx) {
  const row = await ctx.ddb.get({ PK: "COUNTER", SK: "FOUNDING" });
  return foundingSeatsLeftFrom(row?.count || 0);
}

// POST /billing/webhook; the active provider calls here. The raw body is signed;
// constant-time compare, same doctrine as the agent callback. Only a paid-order
// creation event mints a credit, and only once per provider order id.
export async function webhook(event, ctx) {
  const secrets = await ctx.secrets();
  const name = providerName(secrets);
  const provider = PROVIDERS[name];
  const secret = secrets[provider.secretKey];
  // unconfigured provider -> honest 503, never verify against a placeholder.
  if (!configured(secret)) return json(503, { ok: false, error: "billing not configured" });

  const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "";
  // signature check first, over the RAW bytes; a bad signature must never reach
  // the crediting path, so no credit can ever be minted from a forged body.
  if (!provider.verify(raw, event.headers, secret)) return json(401, { ok: false });

  let payload = null;
  try { payload = JSON.parse(raw); } catch { return bad("invalid json body"); }
  const eventName = provider.eventName(payload, event.headers) || "";
  if (!provider.isPaid(eventName)) return ok({ ok: true, ignored: eventName || "unknown" });

  const shape = provider.normalize(payload);
  const providerOrderId = shape.providerOrderId;
  if (!providerOrderId) return bad("order id missing");
  // an order that exists but is not paid is acknowledged (never retried into a
  // credit) and reports its exact status where the provider gave one.
  if (shape.paid === false) return ok({ ok: true, ignored: shape.unpaidReason || "unpaid" });

  const credits = Number.isFinite(shape.credits) && shape.credits > 0 ? shape.credits : creditsFor(shape, secrets, provider);
  const userSub = shape.userSub;
  const email = shape.email;
  // a founding purchase is one paid at the founding price. We count it off the
  // real amount so the seat tally can never drift from the money actually taken.
  const isFounding = Number(shape.totalUsd) === FOUNDING_PRICE;

  // replay-proof: the provider order id is the idempotency key. Every provider
  // retries on non-200s and humans click "resend"; neither may ever mint a
  // second credit. The PK is namespaced per provider (PURCHASE#creem#<id>) so a
  // "1" from one provider can never collide with a "1" from another.
  try {
    await ctx.ddb.put(
      {
        PK: provider.pk(providerOrderId), SK: "META", type: "purchase",
        provider: name, providerOrderId, identifier: shape.identifier || null,
        email, userSub, product: shape.productName || shape.product || null, credits,
        totalUsd: Number.isFinite(shape.totalUsd) ? shape.totalUsd : null,
        testMode: !!shape.testMode, claimed: !!userSub, founding: isFounding,
        createdAt: now(),
      },
      "attribute_not_exists(PK)"
    );
  } catch (e) {
    if (e?.name === "ConditionalCheckFailedException") return ok({ ok: true, already: true });
    throw e;
  }

  // the purchase row landed for the first time (idempotency won above), so it is
  // now safe to advance the founding counter exactly once. A live purchase is
  // the only thing that moves this number, which is why the seat count is honest.
  if (isFounding && !shape.testMode) {
    await ctx.ddb.update({
      Key: { PK: "COUNTER", SK: "FOUNDING" },
      UpdateExpression: "ADD #c :one",
      ExpressionAttributeNames: { "#c": "count" },
      ExpressionAttributeValues: { ":one": 1 },
    });
  }

  if (userSub) {
    // land the credits on the buyer's account. The profile row may not exist
    // yet (fresh account, webhook won the race); ADD upserts either way.
    const updated = await ctx.ddb.update({
      Key: { PK: `USER#${userSub}`, SK: "PROFILE" },
      UpdateExpression: "SET updatedAt = :u ADD paidCredits :credits",
      ExpressionAttributeValues: { ":credits": credits, ":u": now() },
      ReturnValues: "ALL_NEW",
    });
    // a purchase upgrades the plan (and its premiere slots): the flagship makes a
    // director. Upgrades only, never down; a coach who buys a single flagship cut
    // stays a coach.
    //
    // LEGACY ONLY: "coach" was the Coach's Slate, retired in pricing v4 and no
    // longer sellable. There is no coach buy URL and checkout always serves the
    // flagship, so no new purchase mints seven-plus credits through the live
    // catalog. This branch survives purely as a GRANDFATHERING path: if an old
    // seven-pack ever settles (a CREDITS_MAP still maps its product to >= 7), it
    // must still land as a coach, and an existing coach must keep the plan and
    // slots they already hold. Do not repurpose this to sell a coach tier again.
    const plan = credits >= 7 ? "coach" : "director";
    if (updated?.plan !== "coach" && updated?.plan !== plan) {
      await ctx.ddb.update({
        Key: { PK: `USER#${userSub}`, SK: "PROFILE" },
        UpdateExpression: "SET #p = :p, updatedAt = :u",
        ExpressionAttributeNames: { "#p": "plan" },
        ExpressionAttributeValues: { ":p": plan, ":u": now() },
      });
    }
  } else {
    // paid outside the console flow: the money is recorded above (claimed:
    // false) so the Floor can resolve it by hand. Never lose a purchase, never
    // guess an account.
    console.error(JSON.stringify({ level: "warn", msg: "order without user_sub", provider: name, providerOrderId, email }));
  }

  if (email) {
    await sendEmail(
      ctx,
      email,
      paymentReceivedEmail(
        { lsOrderId: providerOrderId, identifier: shape.identifier || providerOrderId, credits, totalUsd: Number.isFinite(shape.totalUsd) ? shape.totalUsd : null },
        ctx.config?.appOrigin || ""
      )
    );
  }
  return ok({ ok: true, provider: name, providerOrderId, credited: !!userSub, credits });
}
