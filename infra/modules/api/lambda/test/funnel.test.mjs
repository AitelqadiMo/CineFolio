// node --test: funnel analytics, tested through the real router (makeHandler)
// against an in-memory ctx that mirrors the DDB behaviors funnel.mjs uses:
// atomic ADD on update, and a GSI1 query that filters by GSI1PK. Kept in its
// own file (api.test.mjs is owned elsewhere) with its own fakes so it stands
// alone. Covers: every step records, per-day aggregation, silent honeypot,
// report conversion math with the divide-by-zero guard, and the admin gate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeHandler } from "../index.mjs";
import { FUNNEL_STEPS } from "../funnel.mjs";

// ---------- fakes (only what the funnel handlers touch) ----------
function fakeCtx() {
  const store = new Map(); // "PK|SK" -> item
  const ddb = {
    async get(Key) { return store.get(`${Key.PK}|${Key.SK}`) || null; },
    async update({ Key, UpdateExpression, ExpressionAttributeValues = {}, ExpressionAttributeNames = {} }) {
      const k = `${Key.PK}|${Key.SK}`;
      const item = store.get(k) || { ...Key };
      const resolve = (n) => ExpressionAttributeNames[n] || n;
      // minimal SET/ADD interpreter matching the "ADD #c :one SET g,s" shape.
      for (const clause of UpdateExpression.split(/SET|ADD/).filter(Boolean).map((c) => c.trim())) {
        for (const part of clause.split(",").map((p) => p.trim()).filter(Boolean)) {
          if (part.includes("=")) {
            const [lhs, rhs] = part.split("=").map((x) => x.trim());
            item[resolve(lhs)] = ExpressionAttributeValues[rhs];
          } else {
            const m = part.match(/^(\S+)\s+(:\S+)$/); // ADD #c :one
            if (m) item[resolve(m[1])] = (item[resolve(m[1])] || 0) + ExpressionAttributeValues[m[2]];
          }
        }
      }
      store.set(k, item);
      return item;
    },
    async query({ IndexName, ExpressionAttributeValues: v }) {
      const items = [...store.values()];
      if (IndexName === "GSI1") return items.filter((i) => i.GSI1PK === v[":p"]);
      return items.filter((i) => i.PK === v[":p"]);
    },
    _store: store,
  };
  return { ddb, config: { appEnv: "test" } };
}

// event builder: mirrors the HTTP API v2 shape the router reads.
const ev = (routeKey, { body, claims, groups } = {}) => ({
  requestContext: {
    routeKey,
    http: { method: routeKey.split(" ")[0], path: routeKey.split(" ")[1] },
    ...(claims ? { authorizer: { jwt: { claims: { sub: claims, email: `${claims}@x.io`, ...(groups ? { "cognito:groups": groups } : {}) } } } } : {}),
  },
  body: body ? JSON.stringify(body) : undefined,
});
const parse = (r) => ({ code: r.statusCode, body: JSON.parse(r.body) });
const today = () => new Date().toISOString().slice(0, 10);

// ---------- POST /funnel ----------

test("funnel: every named step records its own daily counter", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  for (const step of FUNNEL_STEPS) {
    const { code, body } = parse(await h(ev("POST /funnel", { body: { step } })));
    assert.equal(code, 200);
    assert.equal(body.recorded, true, `${step} should record`);
  }
  // one row per step for today, count 1 each, tagged for the GSI1 "FUNNEL" fan.
  for (const step of FUNNEL_STEPS) {
    const row = ctx.ddb._store.get(`FUNNEL#${today()}|${step}`);
    assert.ok(row, `row exists for ${step}`);
    assert.equal(row.count, 1);
    assert.equal(row.GSI1PK, "FUNNEL");
    assert.equal(row.GSI1SK, `${today()}#${step}`);
  }
});

test("funnel: repeated hits aggregate on one row per day per step (atomic ADD)", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  await h(ev("POST /funnel", { body: { step: "signup_start" } }));
  await h(ev("POST /funnel", { body: { step: "signup_start" } }));
  await h(ev("POST /funnel", { body: { step: "signup_start" } }));
  const row = ctx.ddb._store.get(`FUNNEL#${today()}|signup_start`);
  assert.equal(row.count, 3, "three hits collapse into one counter of 3");
  // exactly one row for that step/day: no per-event fan-out, no PII rows.
  const rows = [...ctx.ddb._store.values()].filter((r) => r.SK === "signup_start");
  assert.equal(rows.length, 1);
});

test("funnel: a session id is accepted but never stored (no identifier persisted)", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  await h(ev("POST /funnel", { body: { step: "landing_view", sid: "abc-123-anon" } }));
  const row = ctx.ddb._store.get(`FUNNEL#${today()}|landing_view`);
  assert.equal(row.count, 1);
  // the whole stored item is just the counter keys: no sid, no email, no ip.
  assert.deepEqual(
    Object.keys(row).sort(),
    ["GSI1PK", "GSI1SK", "PK", "SK", "count"],
  );
});

test("funnel: honeypot is silent (200, nothing recorded, no counter row)", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const { code, body } = parse(await h(ev("POST /funnel", { body: { step: "purchase", company: "AcmeBot Inc" } })));
  assert.equal(code, 200, "bot learns nothing from a hard error");
  assert.equal(body.recorded, false);
  assert.equal(ctx.ddb._store.size, 0, "no counter touched by the honeypot");
});

test("funnel: an unknown step is accepted quietly and records nothing", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const { code, body } = parse(await h(ev("POST /funnel", { body: { step: "hack_step_or_pii@email" } })));
  assert.equal(code, 200, "the beacon never errors on a drifted name");
  assert.equal(body.recorded, false);
  assert.equal(ctx.ddb._store.size, 0);
});

// ---------- GET /funnel/report ----------

test("funnel/report: non-admin gets 403, admin gets 200", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  assert.equal(parse(await h(ev("GET /funnel/report", { claims: "u1" }))).code, 403, "no group, no floor");
  assert.equal(parse(await h(ev("GET /funnel/report", { claims: "u1", groups: [] }))).code, 403);
  const { code, body } = parse(await h(ev("GET /funnel/report", { claims: "boss", groups: ["admin"] })));
  assert.equal(code, 200);
  assert.equal(body.ok, true);
});

test("funnel/report: computes per-step totals and consecutive conversion rates", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  // build a funnel: 10 landing -> 4 signup_start -> 2 signup_complete.
  const fire = async (step, n) => { for (let i = 0; i < n; i++) await h(ev("POST /funnel", { body: { step } })); };
  await fire("landing_view", 10);
  await fire("signup_start", 4);
  await fire("signup_complete", 2);

  const { body } = parse(await h(ev("GET /funnel/report", { claims: "boss", groups: ["admin"] })));

  // steps come back in the fixed stage order with a 30-long daily series each.
  assert.deepEqual(body.steps.map((s) => s.step), FUNNEL_STEPS);
  const total = Object.fromEntries(body.steps.map((s) => [s.step, s.total]));
  assert.equal(total.landing_view, 10);
  assert.equal(total.signup_start, 4);
  assert.equal(total.signup_complete, 2);
  for (const s of body.steps) assert.equal(s.daily.length, 30, "30-day window per step");
  // today's bucket carries the count.
  const landingToday = body.steps.find((s) => s.step === "landing_view").daily.find((d) => d.date === today());
  assert.equal(landingToday.count, 10);

  // conversions: one entry per consecutive pair, rate = to/from.
  assert.equal(body.conversions.length, FUNNEL_STEPS.length - 1);
  const c = Object.fromEntries(body.conversions.map((x) => [`${x.from}->${x.to}`, x]));
  assert.equal(c["landing_view->signup_start"].rate, 0.4, "4/10");
  assert.equal(c["signup_start->signup_complete"].rate, 0.5, "2/4");
  assert.equal(c["landing_view->signup_start"].fromCount, 10);
  assert.equal(c["landing_view->signup_start"].toCount, 4);
});

test("funnel/report: divide-by-zero, an empty source step yields null rate, not NaN or a false 0", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  // only a mid-funnel step has traffic; everything around it is empty.
  await h(ev("POST /funnel", { body: { step: "film_generated" } }));

  const { body } = parse(await h(ev("GET /funnel/report", { claims: "boss", groups: ["admin"] })));
  const c = Object.fromEntries(body.conversions.map((x) => [`${x.from}->${x.to}`, x]));

  // profile_uploaded had zero traffic, so its onward rate is unknown (null),
  // never NaN and never a misleading 0% that looks like a total collapse.
  assert.equal(c["profile_uploaded->film_generated"].rate, null);
  assert.equal(c["profile_uploaded->film_generated"].fromCount, 0);
  assert.equal(c["profile_uploaded->film_generated"].toCount, 1);
  // and a downstream empty stage after a real one is a genuine 0, not null.
  assert.equal(c["film_generated->film_published"].rate, 0, "1 -> 0 is a real 0%");
  // with no traffic at all, every rate is null and nothing throws.
  const ctx2 = fakeCtx();
  const h2 = makeHandler(async () => ctx2);
  const empty = parse(await h2(ev("GET /funnel/report", { claims: "boss", groups: ["admin"] }))).body;
  assert.ok(empty.conversions.every((x) => x.rate === null), "all rates null on an empty funnel");
});

test("funnel/report: only the last 30 days count (older counters are excluded)", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  await h(ev("POST /funnel", { body: { step: "landing_view" } })); // today, counts
  // seed a 60-day-old counter directly, tagged for the same GSI1 fan.
  const old = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  ctx.ddb._store.set(`FUNNEL#${old}|landing_view`, { PK: `FUNNEL#${old}`, SK: "landing_view", count: 999, GSI1PK: "FUNNEL", GSI1SK: `${old}#landing_view` });

  const { body } = parse(await h(ev("GET /funnel/report", { claims: "boss", groups: ["admin"] })));
  const landing = body.steps.find((s) => s.step === "landing_view");
  assert.equal(landing.total, 1, "the 60-day-old 999 is outside the window");
});
