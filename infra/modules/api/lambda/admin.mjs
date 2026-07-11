// admin.mjs — the Floor's data plane. Every route is JWT (gateway) + admin
// group (here). Reads aggregate the single table into operator truth; the one
// write is the pipeline kill switch, flipping the SSM circuit breaker the
// state machine's Validate step already honors.
//
// Listings run paginated scans filtered by item type. At demand-test scale
// (hundreds of rows) a scan is the correct tradeoff, not a shortcut; past
// ~10k items, move these callers to a type-overloaded GSI and delete scanAll.
import { ok, bad, json, claimsOf, isAdmin, bodyOf } from "./lib.mjs";
import { previewUrl } from "./sites.mjs";

const deny = (event) => (isAdmin(claimsOf(event)) ? null : json(403, { ok: false, error: "admin only" }));

export const ORDER_STATUSES = ["queued", "filming", "ready", "human_review", "dispatch_failed", "preview"];

async function scanAll(ctx, type, cap = 5000) {
  const items = [];
  let lastKey;
  do {
    const r = await ctx.ddb.scan({
      FilterExpression: "#t = :t",
      ExpressionAttributeNames: { "#t": "type" },
      ExpressionAttributeValues: { ":t": type },
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    });
    items.push(...r.items);
    lastKey = r.lastKey;
  } while (lastKey && items.length < cap);
  return items;
}

const byNewest = (a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""));

// GET /admin/stats — the platform on one card: people, films, orders,
// audience. Traffic reads the daily hit counters (GSI1 "HIT") for 30 days.
export async function stats(event, ctx) {
  const denied = deny(event);
  if (denied) return denied;
  const [users, sites, waitRow, contacts, hits, ...orderCols] = await Promise.all([
    scanAll(ctx, "user"),
    scanAll(ctx, "site"),
    ctx.ddb.get({ PK: "COUNTER", SK: "WAITLIST" }),
    ctx.ddb.query({ IndexName: "GSI1", KeyConditionExpression: "GSI1PK = :p", ExpressionAttributeValues: { ":p": "CONTACT" } }),
    ctx.ddb.query({ IndexName: "GSI1", KeyConditionExpression: "GSI1PK = :p", ExpressionAttributeValues: { ":p": "HIT" } }),
    ...ORDER_STATUSES.map((s) =>
      ctx.ddb.query({ IndexName: "GSI2", KeyConditionExpression: "GSI2PK = :p", ExpressionAttributeValues: { ":p": `STATUS#${s}` } })),
  ]);

  const since = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const daily = {};
  const pages = {};
  for (const h of hits) {
    const date = String(h.PK || "").slice(4); // "HIT#2026-07-11" -> "2026-07-11"
    if (date < since) continue;
    daily[date] = (daily[date] || 0) + (h.count || 0);
    pages[h.SK] = (pages[h.SK] || 0) + (h.count || 0);
  }
  const days = [...Array(30)].map((_, i) => new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10));

  return ok({
    ok: true,
    users: {
      total: users.length,
      cutsSpent: users.reduce((a, u) => a + (u.aiCuts || 0), 0),
    },
    films: {
      total: sites.length,
      live: sites.filter((s) => s.status === "live").length,
      dark: sites.filter((s) => s.status === "taken_down").length,
      draft: sites.filter((s) => s.status === "draft").length,
    },
    orders: Object.fromEntries(ORDER_STATUSES.map((s, i) => [s, orderCols[i].length])),
    waitlist: waitRow?.count || 0,
    notes: contacts.length,
    traffic: {
      views30: days.reduce((a, d) => a + (daily[d] || 0), 0),
      daily: days.map((date) => ({ date, count: daily[date] || 0 })),
      top: Object.entries(pages).map(([page, count]) => ({ page, count }))
        .sort((a, b) => b.count - a.count).slice(0, 8),
    },
  });
}

// GET /admin/sites — every film on the platform with its owner's email and
// live address. Moderation itself rides the existing owner-or-admin site
// routes (publish/rollback/takedown/delete/inspect all honor the admin group).
export async function sites(event, ctx) {
  const denied = deny(event);
  if (denied) return denied;
  const rows = (await scanAll(ctx, "site")).sort(byNewest);
  const owners = [...new Set(rows.map((s) => s.owner).filter(Boolean))];
  const profiles = await Promise.all(owners.map((sub) => ctx.ddb.get({ PK: `USER#${sub}`, SK: "PROFILE" })));
  const emailOf = Object.fromEntries(owners.map((sub, i) => [sub, profiles[i]?.email || null]));
  return ok({
    ok: true,
    total: rows.length,
    sites: rows.map((s) => ({
      siteId: s.siteId, slug: s.slug, title: s.title, status: s.status,
      owner: s.owner || null, ownerEmail: emailOf[s.owner] || null,
      releases: s.releases || 0, liveRelease: s.liveRelease ?? null, stagedRelease: s.stagedRelease ?? null,
      pointerMode: s.pointerMode || null, orderId: s.orderId || null,
      customDomain: s.customDomain || null, audienceOf: s.audienceOf || null,
      createdAt: s.createdAt || null, publishedAt: s.publishedAt || null,
      url: previewUrl(ctx, s.slug),
    })),
  });
}

// GET /admin/users — the people directory (profile rows are lazy-upserted on
// first console load, so this is exactly "everyone who entered the studio").
export async function users(event, ctx) {
  const denied = deny(event);
  if (denied) return denied;
  const rows = (await scanAll(ctx, "user")).sort(byNewest);
  return ok({
    ok: true,
    total: rows.length,
    users: rows.map((u) => ({
      sub: String(u.PK || "").slice(5),
      email: u.email || null, name: u.name || null, plan: u.plan || "free",
      aiCuts: u.aiCuts || 0, createdAt: u.createdAt || null,
    })),
  });
}

// GET /admin/contacts — the visitor inbox straight from the system of record
// (DynamoDB), not just the email forward.
export async function contacts(event, ctx) {
  const denied = deny(event);
  if (denied) return denied;
  const rows = await ctx.ddb.query({
    IndexName: "GSI1",
    KeyConditionExpression: "GSI1PK = :p",
    ExpressionAttributeValues: { ":p": "CONTACT" },
    ScanIndexForward: false,
    Limit: 100,
  });
  const notes = rows
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .map((c) => ({ id: String(c.PK || "").slice(8), name: c.name || null, email: c.email, message: c.message, at: c.createdAt }));
  return ok({ ok: true, total: notes.length, notes });
}

// ---------- the kill switch ----------
// The pipeline's Validate step throws when PIPELINE_ENABLED reads "false"
// (retries drain to human_review, nothing dispatches). These two routes make
// that breaker operable from the Floor instead of the AWS console.
const breakerName = (ctx) => `${ctx.config.ssmPrefix || "/cinefolio/dev"}/PIPELINE_ENABLED`;

export async function pipelineGet(event, ctx) {
  const denied = deny(event);
  if (denied) return denied;
  const p = await ctx.params.get(breakerName(ctx));
  return ok({ ok: true, enabled: p.value !== "false", raw: p.value });
}

export async function pipelineSet(event, ctx) {
  const denied = deny(event);
  if (denied) return denied;
  const b = bodyOf(event);
  if (!b || typeof b.enabled !== "boolean") return bad("enabled: true or false required");
  const name = breakerName(ctx);
  const existing = await ctx.params.get(name); // preserve the parameter's type
  await ctx.params.put(name, b.enabled ? "true" : "false", existing.type);
  console.log(JSON.stringify({ level: "info", msg: "pipeline breaker set", enabled: b.enabled, by: claimsOf(event)?.sub || null }));
  // honesty: workers cache secrets per container; warm workers pick the flip
  // up as they recycle, new containers see it immediately.
  return ok({ ok: true, enabled: b.enabled, propagation: "new workers immediately; warm workers as they recycle" });
}
