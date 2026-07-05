// misc.mjs — profile, waitlist, contact, hits, admin. All handlers take (event, ctx).
import { ok, bad, json, claimsOf, isAdmin, bodyOf, isEmail, clampStr, now, today, uuid, qs } from "./lib.mjs";

// GET /me — lazy-upsert the profile on first authenticated call (no Cognito trigger needed)
export async function getMe(event, ctx) {
  const claims = claimsOf(event);
  const PK = `USER#${claims.sub}`;
  let item = await ctx.ddb.get({ PK, SK: "PROFILE" });
  if (!item) {
    item = {
      PK, SK: "PROFILE", type: "user",
      email: claims.email || null, name: claims.name || null,
      plan: "free", createdAt: now(),
    };
    try {
      await ctx.ddb.put(item, "attribute_not_exists(PK)");
    } catch { item = await ctx.ddb.get({ PK, SK: "PROFILE" }); } // lost the race, read winner
  }
  return ok({ ok: true, user: { sub: claims.sub, admin: isAdmin(claims), ...pub(item) } });
}

// PUT /me { name?, company?, links? }
export async function putMe(event, ctx) {
  const claims = claimsOf(event);
  const b = bodyOf(event);
  if (!b) return bad("invalid json");
  const sets = [];
  const vals = {};
  if (b.name !== undefined) { sets.push("#n = :n"); vals[":n"] = clampStr(b.name, 80); }
  if (b.company !== undefined) { sets.push("company = :c"); vals[":c"] = clampStr(b.company, 120); }
  if (b.links !== undefined) { sets.push("links = :l"); vals[":l"] = clampStr(b.links, 500); }
  if (!sets.length) return bad("nothing to update");
  const item = await ctx.ddb.update({
    Key: { PK: `USER#${claims.sub}`, SK: "PROFILE" },
    UpdateExpression: `SET ${sets.join(", ")}, updatedAt = :u`,
    ExpressionAttributeNames: sets.some((s) => s.startsWith("#n")) ? { "#n": "name" } : undefined,
    ExpressionAttributeValues: { ...vals, ":u": now() },
    ReturnValues: "ALL_NEW",
  });
  return ok({ ok: true, user: pub(item) });
}

const pub = (i) => ({ email: i.email, name: i.name, company: i.company, links: i.links, plan: i.plan, createdAt: i.createdAt });

// POST /waitlist { email } — idempotent (conditional put) + O(1) counter
export async function joinWaitlist(event, ctx) {
  const b = bodyOf(event);
  if (!b) return bad("invalid json");
  if (b.company) return ok({ ok: true, joined: true }); // honeypot: pretend success
  const email = String(b.email || "").trim().toLowerCase();
  if (!isEmail(email)) return bad("valid email required");
  try {
    await ctx.ddb.put(
      { PK: `WAITLIST#${email}`, SK: "ENTRY", type: "waitlist", email, GSI1PK: "WAITLIST", GSI1SK: now(), createdAt: now() },
      "attribute_not_exists(PK)"
    );
    await ctx.ddb.update({
      Key: { PK: "COUNTER", SK: "WAITLIST" },
      UpdateExpression: "ADD #c :one",
      ExpressionAttributeNames: { "#c": "count" },
      ExpressionAttributeValues: { ":one": 1 },
    });
    return ok({ ok: true, joined: true });
  } catch (e) {
    if (e?.name === "ConditionalCheckFailedException") return ok({ ok: true, joined: true, already: true });
    throw e;
  }
}

// GET /waitlist/count
export async function waitlistCount(_event, ctx) {
  const item = await ctx.ddb.get({ PK: "COUNTER", SK: "WAITLIST" });
  return ok({ ok: true, count: item?.count || 0 });
}

// POST /contact { name, email, message }
export async function contact(event, ctx) {
  const b = bodyOf(event);
  if (!b) return bad("invalid json");
  if (b.company) return ok({ ok: true }); // honeypot
  const email = String(b.email || "").trim().toLowerCase();
  const message = clampStr(b.message, 4000).trim();
  if (!isEmail(email) || message.length < 3) return bad("email and message required");
  const id = uuid();
  await ctx.ddb.put({
    PK: `CONTACT#${id}`, SK: "MSG", type: "contact",
    GSI1PK: "CONTACT", GSI1SK: now(),
    name: clampStr(b.name, 120), email, message, createdAt: now(),
  });
  return ok({ ok: true, id });
}

// POST /hit { page } — daily per-page atomic counters
export async function hit(event, ctx) {
  const b = bodyOf(event) || {};
  const page = clampStr(b.page || "home", 40).replace(/[^a-z0-9_/-]/gi, "") || "home";
  await ctx.ddb.update({
    Key: { PK: `HIT#${today()}`, SK: page },
    UpdateExpression: "ADD #c :one SET GSI1PK = :g, GSI1SK = :s",
    ExpressionAttributeNames: { "#c": "count" },
    ExpressionAttributeValues: { ":one": 1, ":g": "HIT", ":s": `${today()}#${page}` },
  });
  return ok({ ok: true });
}

// GET /admin/orders?status=queued — admin-only order queue (GSI2)
export async function adminOrders(event, ctx) {
  const claims = claimsOf(event);
  if (!isAdmin(claims)) return json(403, { ok: false, error: "admin only" });
  const status = clampStr(qs(event, "status") || "queued", 24);
  const items = await ctx.ddb.query({
    IndexName: "GSI2",
    KeyConditionExpression: "GSI2PK = :p",
    ExpressionAttributeValues: { ":p": `STATUS#${status}` },
    ScanIndexForward: false,
    Limit: 50,
  });
  return ok({ ok: true, status, orders: items.map((o) => ({ orderId: o.orderId, email: o.email, name: o.name, role: o.role, status: o.status, createdAt: o.createdAt, updatedAt: o.updatedAt })) });
}
