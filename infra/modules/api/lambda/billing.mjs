// billing.mjs — the cash register. Lemon Squeezy sells the Director's Cut as
// merchant of record (they are the legal seller; we never touch card data or
// VAT). Money becomes an entitlement here, and only here:
//   GET  /billing/checkout (JWT)    -> the buyer's personalized checkout URL
//   POST /billing/webhook  (public) -> LS order_created lands a paid credit,
//                                      race-safe and replay-proof
// The credit is spent by POST /studio/order exactly like a free cut, so the
// pipeline stays payment-agnostic. Fail-soft doctrine: an unconfigured store
// is an honest 503, never a broken order flow — the register ships before the
// store opens, and goes live the moment the SSM parameters exist:
//   {prefix}/LS_BUY_URL_DC      the Director's Cut buy link
//   {prefix}/LS_BUY_URL_COACH   the Coach's Slate buy link (optional)
//   {prefix}/LS_WEBHOOK_SECRET  the signing secret set on the LS webhook
//   {prefix}/LS_CREDITS_MAP     optional JSON {"variant:<id>":7,"product:<id>":7,"default":3}
//                               mapping an LS purchase to minted production credits;
//                               unmapped purchases mint DC_CREDITS (the flagship default)
import { createHmac } from "node:crypto";
import { ok, bad, json, qs, claimsOf, now, safeEqual, CUT_PRICE, COACH_PRICE, DC_CREDITS } from "./lib.mjs";
import { sendEmail, paymentReceivedEmail } from "./email.mjs";

// GET /billing/checkout — hand the signed-in buyer their checkout URL: email
// prefilled, Cognito sub riding along as custom data so the webhook can land
// the credit on the right account even if they pay from another device.
export async function checkout(event, ctx) {
  const claims = claimsOf(event);
  if (!claims?.sub) return json(401, { ok: false, error: "sign in to unlock a paid cut" });
  const secrets = await ctx.secrets();
  const coach = qs(event, "product") === "coach"; // ?product=coach -> the 7-pack
  const base = coach ? secrets.LS_BUY_URL_COACH : secrets.LS_BUY_URL_DC;
  let url;
  // the Terraform placeholder ("unset") fails URL parsing -> honest 503
  try { url = new URL(base); } catch { return json(503, { ok: false, error: "checkout_unavailable" }); }
  if (claims.email) url.searchParams.set("checkout[email]", String(claims.email));
  url.searchParams.set("checkout[custom][user_sub]", String(claims.sub));
  return ok({ ok: true, url: url.toString(), price: coach ? COACH_PRICE : CUT_PRICE });
}

// POST /billing/webhook — Lemon Squeezy calls here. The raw body is signed
// (X-Signature: hex HMAC-SHA256); constant-time compare, same doctrine as the
// agent callback. Only order_created for a paid order mints a credit.
export async function webhook(event, ctx) {
  const secrets = await ctx.secrets();
  const secret = secrets.LS_WEBHOOK_SECRET;
  // a real signing secret is long random hex; anything short is the Terraform
  // placeholder ("unset") or a misconfiguration — never verify against those
  if (!secret || secret.length < 16) return json(503, { ok: false, error: "billing not configured" });
  const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "";
  const given = event.headers?.["x-signature"] || event.headers?.["X-Signature"];
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  if (!safeEqual(given, expected)) return json(401, { ok: false });

  let payload = null;
  try { payload = JSON.parse(raw); } catch { return bad("invalid json body"); }
  const eventName = payload?.meta?.event_name || event.headers?.["x-event-name"] || "";
  if (eventName !== "order_created") return ok({ ok: true, ignored: eventName || "unknown" });

  const data = payload?.data;
  const attrs = data?.attributes || {};
  const lsOrderId = String(data?.id || "");
  if (!lsOrderId) return bad("order id missing");
  if (attrs.status && attrs.status !== "paid") return ok({ ok: true, ignored: `status ${attrs.status}` });

  const userSub = String(payload?.meta?.custom_data?.user_sub || "").trim() || null;
  const email = String(attrs.user_email || "").trim().toLowerCase() || null;

  // how many production credits does this purchase mint? The map lives in SSM
  // so new packs never need a deploy; anything unmapped mints the flagship
  // Director's Cut count — the safest default for the product we sell most.
  const item0 = attrs.first_order_item || {};
  let credits = DC_CREDITS;
  if (secrets.LS_CREDITS_MAP) {
    try {
      const map = JSON.parse(secrets.LS_CREDITS_MAP);
      const hit = Number(map[`variant:${item0.variant_id}`] ?? map[`product:${item0.product_id}`] ?? map.default);
      if (Number.isFinite(hit) && hit > 0) credits = hit;
    } catch {
      console.error(JSON.stringify({ level: "warn", msg: "LS_CREDITS_MAP is not valid json; minting flagship default", lsOrderId }));
    }
  }

  // replay-proof: the LS order id is the idempotency key. LS retries on
  // non-200s and humans click "resend" — neither may ever mint a second credit.
  try {
    await ctx.ddb.put(
      {
        PK: `LSORDER#${lsOrderId}`, SK: "META", type: "purchase",
        lsOrderId, identifier: attrs.identifier || null,
        email, userSub, product: item0.product_name || null, credits,
        totalUsd: typeof attrs.total_usd === "number" ? attrs.total_usd / 100 : null,
        testMode: !!attrs.test_mode, claimed: !!userSub,
        createdAt: now(),
      },
      "attribute_not_exists(PK)"
    );
  } catch (e) {
    if (e?.name === "ConditionalCheckFailedException") return ok({ ok: true, already: true });
    throw e;
  }

  if (userSub) {
    // land the credits on the buyer's account. The profile row may not exist
    // yet (fresh account, webhook won the race) — ADD upserts either way.
    const updated = await ctx.ddb.update({
      Key: { PK: `USER#${userSub}`, SK: "PROFILE" },
      UpdateExpression: "SET updatedAt = :u ADD paidCredits :credits",
      ExpressionAttributeValues: { ":credits": credits, ":u": now() },
      ReturnValues: "ALL_NEW",
    });
    // a purchase upgrades the plan (and its premiere slots): the flagship
    // makes a director, a slate makes a coach. Upgrades only, never down.
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
    // paid outside the console flow: the money is recorded above
    // (claimed: false) so the Floor can resolve it by hand. Never lose a
    // purchase, never guess an account.
    console.error(JSON.stringify({ level: "warn", msg: "ls order without user_sub", lsOrderId, email }));
  }

  if (email) await sendEmail(ctx, email, paymentReceivedEmail({ lsOrderId, identifier: attrs.identifier, credits, totalUsd: typeof attrs.total_usd === "number" ? attrs.total_usd / 100 : null }, ctx.config?.appOrigin || ""));
  return ok({ ok: true, lsOrderId, credited: !!userSub, credits });
}
