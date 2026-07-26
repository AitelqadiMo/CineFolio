// admin.mjs — the Floor's data plane. Every route is JWT (gateway) + admin
// group (here). Reads aggregate the single table into operator truth; the one
// write is the pipeline kill switch, flipping the SSM circuit breaker the
// state machine's Validate step already honors.
//
// Listings run paginated scans filtered by item type. At demand-test scale
// (hundreds of rows) a scan is the correct tradeoff, not a shortcut; past
// ~10k items, move these callers to a type-overloaded GSI and delete scanAll.
import { ok, bad, json, claimsOf, isAdmin, bodyOf, clampStr, now } from "./lib.mjs";
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

// The chase: 1000 USD in 30 days. The goal is a constant so the bar and the
// backend agree on one number, never two.
export const REVENUE_GOAL_USD = 1000;

// Read a purchase row's provider order id without assuming the key shape. The
// original register wrote PK "LSORDER#<id>" with field lsOrderId; the
// multi-provider register writes PK "PURCHASE#<provider>#<id>" with the same
// type "purchase". We take the explicit field first, then fall back to the last
// "#" segment of the PK, so both shapes surface a stable id to the operator.
function purchaseOrderId(p) {
  if (p.lsOrderId) return String(p.lsOrderId);
  if (p.orderId) return String(p.orderId);
  const pk = String(p.PK || "");
  const tail = pk.slice(pk.lastIndexOf("#") + 1);
  return tail || null;
}

// GET /admin/stats — the platform on one card: people, films, orders,
// audience, and revenue. Traffic reads the daily hit counters (GSI1 "HIT") for
// 30 days; revenue reads the "purchase" rows the billing webhook writes.
export async function stats(event, ctx) {
  const denied = deny(event);
  if (denied) return denied;
  const [users, sites, waitRow, contacts, hits, purchases, ...orderCols] = await Promise.all([
    scanAll(ctx, "user"),
    scanAll(ctx, "site"),
    ctx.ddb.get({ PK: "COUNTER", SK: "WAITLIST" }),
    ctx.ddb.query({ IndexName: "GSI1", KeyConditionExpression: "GSI1PK = :p", ExpressionAttributeValues: { ":p": "CONTACT" } }),
    ctx.ddb.query({ IndexName: "GSI1", KeyConditionExpression: "GSI1PK = :p", ExpressionAttributeValues: { ":p": "HIT" } }),
    scanAll(ctx, "purchase"),
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

  // growth curves: one row per event, bucketed by day over the same window
  const seriesOf = (items, dateOf) => {
    const m = {};
    for (const it of items) {
      const d = String(dateOf(it) || "").slice(0, 10);
      if (d && d >= since) m[d] = (m[d] || 0) + 1;
    }
    return days.map((date) => ({ date, count: m[date] || 0 }));
  };
  const newest = [...users].sort(byNewest);
  const freshFilms = [...sites].sort(byNewest);

  // ---- revenue: the chase toward 1000 USD ----
  // Real money and test-mode validation purchases live in the same table with
  // the same type "purchase"; a provider's validation charge carries
  // testMode: true. We split them so the goal, the totals, and the daily
  // series only ever count real money, and the operator still sees that a test
  // purchase landed (obviously not real money).
  const realSales = purchases.filter((p) => !p.testMode);
  const testSales = purchases.filter((p) => p.testMode);
  const usdOf = (p) => (typeof p.totalUsd === "number" ? p.totalUsd : 0);
  const totalUsd = realSales.reduce((a, p) => a + usdOf(p), 0);
  const payingCustomers = realSales.length;
  const in30 = realSales.filter((p) => String(p.createdAt || "").slice(0, 10) >= since);
  const revenue30 = in30.reduce((a, p) => a + usdOf(p), 0);
  // one bucket per day over the same 30-day window as every other curve, summed
  // in USD (not a count) so the bar height is money, not order volume.
  const revByDay = {};
  for (const p of in30) {
    const d = String(p.createdAt || "").slice(0, 10);
    if (d) revByDay[d] = (revByDay[d] || 0) + usdOf(p);
  }
  const goalPct = REVENUE_GOAL_USD > 0
    ? Math.min(100, Math.round((totalUsd / REVENUE_GOAL_USD) * 100))
    : 0;
  const recentPurchases = [...realSales].sort(byNewest).slice(0, 8).map((p) => ({
    id: purchaseOrderId(p),
    product: p.product || null,
    amountUsd: usdOf(p),
    email: p.email || null,
    claimed: !!p.claimed,
    at: p.createdAt || null,
  }));

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
    revenue: {
      totalUsd,                 // real money only, test-mode excluded
      payingCustomers,          // count of real (non-test) purchases
      revenue30,                // real money in the last 30 days
      // money per day for the bar chart; count carries USD so TrafficBars,
      // which reads .count, draws revenue directly with no reshaping.
      daily: days.map((date) => ({ date, count: revByDay[date] || 0 })),
      goal: {
        targetUsd: REVENUE_GOAL_USD,
        amountUsd: totalUsd,
        pct: goalPct,
      },
      recent: recentPurchases,
      // every real purchase whose credits never landed, not just the recent
      // slice: someone paid and got nothing, so the operator must see all of them.
      unclaimed: realSales.filter((p) => !p.claimed).length,
      testCount: testSales.length, // provider validation purchases, not real money
    },
    signups: { daily: seriesOf(users, (u) => u.createdAt) },
    premieres: { daily: seriesOf(sites.filter((s) => s.publishedAt), (s) => s.publishedAt) },
    ordersTrend: { daily: seriesOf(orderCols.flat(), (o) => o.createdAt) },
    recent: {
      users: newest.slice(0, 6).map((u) => ({ email: u.email || null, name: u.name || null, at: u.createdAt || null })),
      films: freshFilms.slice(0, 6).map((s) => ({
        slug: s.slug, title: s.title || s.slug, status: s.status, at: s.publishedAt || s.createdAt || null, url: previewUrl(ctx, s.slug),
      })),
    },
  });
}

// GET /admin/sites — every film on the platform with its owner's email and
// live address. Moderation itself rides the existing owner-or-admin site
// routes (publish/rollback/takedown/delete/inspect all honor the admin group).
export async function sites(event, ctx) {
  const denied = deny(event);
  if (denied) return denied;
  const [rows0, hits] = await Promise.all([
    scanAll(ctx, "site"),
    ctx.ddb.query({ IndexName: "GSI1", KeyConditionExpression: "GSI1PK = :p", ExpressionAttributeValues: { ":p": "HIT" } }),
  ]);
  const rows = rows0.sort(byNewest);
  const owners = [...new Set(rows.map((s) => s.owner).filter(Boolean))];
  const profiles = await Promise.all(owners.map((sub) => ctx.ddb.get({ PK: `USER#${sub}`, SK: "PROFILE" })));
  const emailOf = Object.fromEntries(owners.map((sub, i) => [sub, profiles[i]?.email || null]));
  // 30-day audience per film: the publish-time beacon posts page "s/{slug}"
  const since = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const views = {};
  for (const h of hits) {
    const date = String(h.PK || "").slice(4);
    if (date < since) continue;
    views[h.SK] = (views[h.SK] || 0) + (h.count || 0);
  }
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
      views30: views[`s/${s.slug}`] || 0,
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

// POST /admin/users/{sub}/credits { delta, reason } — the operator's manual
// credit lever. The audit found there was NO way to fulfil "where is my credit"
// from the console: an operator had to hand-edit DynamoDB. This is also the
// recovery path for the known claim/grant crash window (a paid purchase whose
// credit never landed): the operator grants the owed credit here, once the
// Creem receipt is confirmed. Every grant writes an immutable GRANT# audit row
// under the user AND logs the operating admin, so a manual credit is never
// silent. delta is clamped to a sane band so a fat-fingered grant cannot mint a
// fortune; a NEGATIVE delta is allowed (to claw back after a refund is
// processed in Creem), floored so paidCredits can never go below zero.
const GRANT_MAX = 20;
export async function grantCredits(event, ctx) {
  const denied = deny(event);
  if (denied) return denied;
  const sub = event.pathParameters?.sub;
  if (!sub) return bad("bad user id");
  const b = bodyOf(event) || {};
  const delta = Number(b.delta);
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > GRANT_MAX) {
    return bad(`delta must be a non-zero integer within +/-${GRANT_MAX}`);
  }
  const reason = clampStr(b.reason, 300).trim();
  if (reason.length < 3) return bad("a reason is required for the audit trail");

  const profile = await ctx.ddb.get({ PK: `USER#${sub}`, SK: "PROFILE" });
  if (!profile) return bad("unknown user", 404);
  const by = claimsOf(event)?.sub || null;

  // apply the delta, floored at zero, then read back the true balance. We do a
  // conditional floor by computing the target instead of a raw ADD so a -N can
  // never drive the balance negative.
  const current = Number(profile.paidCredits || 0);
  const next = Math.max(0, current + delta);
  await ctx.ddb.update({
    Key: { PK: `USER#${sub}`, SK: "PROFILE" },
    UpdateExpression: "SET paidCredits = :n, updatedAt = :u",
    ExpressionAttributeValues: { ":n": next, ":u": now() },
  });
  // immutable audit row: who, how much, why, when. Sortable under the user.
  const at = now();
  await ctx.ddb.put({
    PK: `USER#${sub}`, SK: `GRANT#${at}`, type: "creditgrant",
    delta, from: current, to: next, reason, by, at,
  });
  console.log(JSON.stringify({ level: "info", msg: "admin credit grant", sub, delta, from: current, to: next, by, reason }));
  return ok({ ok: true, sub, delta, from: current, to: next, reason });
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
