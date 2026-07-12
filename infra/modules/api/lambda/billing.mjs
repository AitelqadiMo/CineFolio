// billing.mjs — the cash register. Lemon Squeezy sells the Director's Cut as
// merchant of record (they are the legal seller; we never touch card data or
// VAT). Money becomes an entitlement here, and only here:
//   GET  /billing/checkout (JWT)    -> the buyer's personalized checkout URL
//   POST /billing/webhook  (public) -> LS order_created lands a paid credit,
//                                      race-safe and replay-proof
// The credit is spent by POST /studio/order exactly like a free cut, so the
// pipeline stays payment-agnostic. Fail-soft doctrine: an unconfigured store
// is an honest 503, never a broken order flow — the register ships before the
// store opens, and goes live the moment two SSM parameters exist:
//   {prefix}/LS_BUY_URL_DC      the product's LS buy link
//   {prefix}/LS_WEBHOOK_SECRET  the signing secret set on the LS webhook
import { createHmac } from "node:crypto";
import { ok, bad, json, claimsOf, now, safeEqual } from "./lib.mjs";
import { sendEmail, paymentReceivedEmail } from "./email.mjs";

export const CUT_PRICE = 149;

// GET /billing/checkout — hand the signed-in buyer their checkout URL: email
// prefilled, Cognito sub riding along as custom data so the webhook can land
// the credit on the right account even if they pay from another device.
export async function checkout(event, ctx) {
  const claims = claimsOf(event);
  if (!claims?.sub) return json(401, { ok: false, error: "sign in to unlock a paid cut" });
  const secrets = await ctx.secrets();
  let url;
  try { url = new URL(secrets.LS_BUY_URL_DC); } catch { return json(503, { ok: false, error: "checkout_unavailable" }); }
  if (claims.email) url.searchParams.set("checkout[email]", String(claims.email));
  url.searchParams.set("checkout[custom][user_sub]", String(claims.sub));
  return ok({ ok: true, url: url.toString(), price: CUT_PRICE });
}

// POST /billing/webhook — Lemon Squeezy calls here. The raw body is signed
// (X-Signature: hex HMAC-SHA256); constant-time compare, same doctrine as the
// agent callback. Only order_created for a paid order mints a credit.
export async function webhook(event, ctx) {
  const secrets = await ctx.secrets();
  const secret = secrets.LS_WEBHOOK_SECRET;
  if (!secret) return json(503, { ok: false, error: "billing not configured" });
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

  // replay-proof: the LS order id is the idempotency key. LS retries on
  // non-200s and humans click "resend" — neither may ever mint a second credit.
  try {
    await ctx.ddb.put(
      {
        PK: `LSORDER#${lsOrderId}`, SK: "META", type: "purchase",
        lsOrderId, identifier: attrs.identifier || null,
        email, userSub, product: attrs.first_order_item?.product_name || null,
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
    // land the credit on the buyer's account. The profile row may not exist
    // yet (fresh account, webhook won the race) — ADD upserts either way.
    await ctx.ddb.update({
      Key: { PK: `USER#${userSub}`, SK: "PROFILE" },
      UpdateExpression: "SET updatedAt = :u ADD paidCredits :one",
      ExpressionAttributeValues: { ":one": 1, ":u": now() },
    });
  } else {
    // paid outside the console flow: the money is recorded above
    // (claimed: false) so the Floor can resolve it by hand. Never lose a
    // purchase, never guess an account.
    console.error(JSON.stringify({ level: "warn", msg: "ls order without user_sub", lsOrderId, email }));
  }

  if (email) await sendEmail(ctx, email, paymentReceivedEmail({ lsOrderId, identifier: attrs.identifier }, ctx.config?.appOrigin || ""));
  return ok({ ok: true, lsOrderId, credited: !!userSub });
}
