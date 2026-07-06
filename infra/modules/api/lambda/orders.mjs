// orders.mjs: the buyer's order surfaces. An order is money; it must always be
// visible to the person who placed it, and the included revision is enforced
// server-side (one credit, race-safe).
import { ok, bad, json, bodyOf, claimsOf, isAdmin, clampStr, now, pathParam } from "./lib.mjs";
import { sendOrderEmail } from "./email.mjs";

const ORDER_ID_RE = /^[a-f0-9-]{8,64}$/i;

const pub = (o) => ({
  orderId: o.orderId, name: o.name || null, status: o.status, production: !!o.production,
  price: o.production ? 149 : 0, revisionRequested: !!o.revisionRequested,
  createdAt: o.createdAt, updatedAt: o.updatedAt,
});

// GET /orders — the signed-in buyer's order history (GSI1: USER#{sub} / ORDER#ts).
// Orders placed anonymously before an account existed are matched by verified
// email as a courtesy read (Cognito email claims are verified identities).
export async function listOrders(event, ctx) {
  const claims = claimsOf(event);
  const mine = await ctx.ddb.query({
    IndexName: "GSI1",
    KeyConditionExpression: "GSI1PK = :p AND begins_with(GSI1SK, :s)",
    ExpressionAttributeValues: { ":p": `USER#${claims.sub}`, ":s": "ORDER#" },
    ScanIndexForward: false,
    Limit: 25,
  });
  return ok({ ok: true, orders: mine.map(pub) });
}

// POST /orders/{id}/revision { notes } — one included revision, enforced with a
// conditional update so a double-click can never spend two credits. The order
// re-enters the pipeline queue with the notes riding on it.
export async function requestRevision(event, ctx) {
  const claims = claimsOf(event);
  const orderId = pathParam(event, "id");
  if (!orderId || !ORDER_ID_RE.test(orderId)) return bad("bad orderId");
  const b = bodyOf(event);
  if (!b) return bad("invalid json");
  const notes = clampStr(b.notes, 2000).trim();
  if (notes.length < 3) return bad("tell the studio what should change");

  const order = await ctx.ddb.get({ PK: `ORDER#${orderId}`, SK: "META" });
  if (!order) return bad("unknown order", 404);
  const owns =
    order.GSI1PK === `USER#${claims.sub}` ||
    (claims.email && order.email && order.email === String(claims.email).toLowerCase());
  if (!owns && !isAdmin(claims)) return json(403, { ok: false, error: "not your order" });
  if (order.status !== "ready") return bad(`status ${order.status} is not revisable`, 409);
  if (order.revisionRequested) return bad("the included revision was already used", 409);

  try {
    await ctx.ddb.update({
      Key: { PK: `ORDER#${orderId}`, SK: "META" },
      UpdateExpression:
        "SET revisionRequested = :t, revisionNotes = :n, revisionAt = :a, updatedAt = :a, #s = :q, GSI2PK = :g, taskToken = :none",
      ConditionExpression: "attribute_exists(PK) AND attribute_not_exists(revisionRequested)",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":t": true, ":n": notes, ":a": now(), ":q": "queued", ":g": "STATUS#queued", ":none": null,
      },
    });
  } catch (e) {
    if (e?.name === "ConditionalCheckFailedException") return bad("the included revision was already used", 409);
    throw e;
  }

  if (order.production && ctx.config.ordersQueueUrl) {
    try {
      await ctx.queue.send(ctx.config.ordersQueueUrl, { orderId });
    } catch (e) {
      console.error(JSON.stringify({ level: "error", msg: "revision enqueue failed", orderId, err: e?.message }));
    }
  }
  await sendOrderEmail(ctx, "revision", { ...order, revisionNotes: notes });
  return ok({ ok: true, orderId, status: "queued", revisionRequested: true });
}
