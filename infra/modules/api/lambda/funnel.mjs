// funnel.mjs: first-party conversion funnel on the existing beacon rails.
// POST /funnel records a named step as a daily atomic counter (one row per day
// per step), exactly mirroring the /hit counter so retrieval rides the same
// GSI1 query the Floor already uses. GET /funnel/report is admin-only and turns
// those counters into per-day step counts plus the drop-off math between stages.
//
// Privacy-first by construction: we never accept or store an email, a name, or
// an IP. The client sends a random sessionStorage id purely so IT can dedupe
// its own fire-once logic; the server aggregates to counts and deliberately
// DOES NOT persist that id, so there is no cookie, no cross-site identifier,
// and nothing to tie a step back to a person.
import { ok, bad, json, claimsOf, isAdmin, bodyOf, clampStr, today } from "./lib.mjs";

// The funnel is a fixed vocabulary in stage order. An allowlist (not free text)
// keeps the data clean and, just as importantly, guarantees a caller can never
// smuggle PII into the SK the way an open "page" field could. The order here is
// the order the report walks to compute consecutive conversion rates.
export const FUNNEL_STEPS = [
  "landing_view",     // marketing landing rendered
  "signup_start",     // create-account tab opened / first field touched
  "signup_complete",  // account confirmed (Cognito confirm succeeded)
  "profile_uploaded", // portfolio dossier saved to the studio
  "film_generated",   // an AI cut came back
  "film_published",   // a film went live
  "pricing_view",     // the register / pricing surface was seen
  "checkout_click",   // the buyer clicked through to Lemon Squeezy
  "purchase",         // a paid credit landed (webhook-confirmed)
];
const STEP_SET = new Set(FUNNEL_STEPS);

// POST /funnel { step, sid? }: public, honeypot-guarded like /waitlist + /contact.
// Daily per-step atomic ADD. Same shape as misc.hit so the counter aggregates
// identically: PK groups the day, SK is the step, GSI1 "FUNNEL" fans the whole
// window back for the report in one query.
export async function record(event, ctx) {
  const b = bodyOf(event);
  if (!b) return bad("invalid json");
  // honeypot: a filled "company" field is a bot. Pretend success so the bot
  // learns nothing, and never let it touch a counter (mirrors the forms).
  if (b.company) return ok({ ok: true, recorded: false });

  const step = clampStr(b.step, 40);
  // unknown or missing step: accept quietly (200) but record nothing. The beacon
  // must never surface a hard error to a page just because a step name drifted.
  if (!STEP_SET.has(step)) return ok({ ok: true, recorded: false });

  await ctx.ddb.update({
    Key: { PK: `FUNNEL#${today()}`, SK: step },
    UpdateExpression: "ADD #c :one SET GSI1PK = :g, GSI1SK = :s",
    ExpressionAttributeNames: { "#c": "count" },
    ExpressionAttributeValues: { ":one": 1, ":g": "FUNNEL", ":s": `${today()}#${step}` },
  });
  return ok({ ok: true, recorded: true });
}

// GET /funnel/report: admin-only (same JWT-then-group gate as the Floor).
// Returns, for the last 30 days: per-day counts per step, a 30-day total per
// step, and the conversion rate between each consecutive pair of steps.
export async function report(event, ctx) {
  // admin group check in-handler, exactly like admin.mjs desks.
  if (!isAdmin(claimsOf(event))) return json(403, { ok: false, error: "admin only" });

  // one GSI1 query pulls every funnel counter row; we window it in memory.
  const rows = await ctx.ddb.query({
    IndexName: "GSI1",
    KeyConditionExpression: "GSI1PK = :p",
    ExpressionAttributeValues: { ":p": "FUNNEL" },
  });

  // 30-day window, inclusive of today, matching admin.stats' traffic window.
  const since = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const days = [...Array(30)].map((_, i) =>
    new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10));

  // perStep[step][date] = count ; totals[step] = 30-day sum
  const perStep = Object.fromEntries(FUNNEL_STEPS.map((s) => [s, {}]));
  const totals = Object.fromEntries(FUNNEL_STEPS.map((s) => [s, 0]));
  for (const r of rows) {
    const date = String(r.PK || "").slice(7); // "FUNNEL#2026-07-11" -> "2026-07-11"
    if (date < since) continue;
    const step = r.SK;
    if (!perStep[step]) continue; // ignore any legacy/unknown SK defensively
    perStep[step][date] = (perStep[step][date] || 0) + (r.count || 0);
    totals[step] += (r.count || 0);
  }

  // steps: the vocabulary in stage order, each with its daily series + total.
  const steps = FUNNEL_STEPS.map((step) => ({
    step,
    total: totals[step],
    daily: days.map((date) => ({ date, count: perStep[step][date] || 0 })),
  }));

  // conversions: rate from one stage to the next over the 30-day window. The
  // divide-by-zero guard is the whole point of a funnel report: a stage with
  // no traffic yet must read null (unknown), never NaN and never a false 0%,
  // so an empty top-of-funnel does not look like a catastrophic drop.
  const conversions = [];
  for (let i = 0; i < FUNNEL_STEPS.length - 1; i++) {
    const from = FUNNEL_STEPS[i];
    const to = FUNNEL_STEPS[i + 1];
    const fromCount = totals[from];
    const toCount = totals[to];
    conversions.push({
      from,
      to,
      fromCount,
      toCount,
      // rate is a 0..1 fraction rounded to 4 dp; null when the source stage is
      // empty (nothing to convert FROM), which is distinct from a real 0.
      rate: fromCount > 0 ? Math.round((toCount / fromCount) * 10000) / 10000 : null,
    });
  }

  return ok({ ok: true, days, steps, conversions });
}
