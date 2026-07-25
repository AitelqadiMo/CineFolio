// node --test — the owner-facing audience route (GET /sites/{id}/stats).
//
// This route already existed; these tests pin the behaviors that make it safe
// to surface as free analytics: an owner sees ONLY their own film, a non-owner
// is refused, a brand-new film with zero traffic reads as an honest zero (never
// an error), the daily series covers the WHOLE window including silent days, and
// the label-driving fields (window/since/today) are truthful and additive so the
// existing api.test.mjs assertions (views/week/daily) keep holding.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeHandler } from "../index.mjs";

// A minimal in-memory ctx, mirroring api.test.mjs's fakes but scoped to what the
// stats route + publish + the /hit beacon touch (ddb get/put/update/query, plus
// the S3/KVS/CDN publish reaches through). Kept local so this file stands alone.
function fakeCtx() {
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
      if (ConditionExpression === "releases = :prev" && (item.releases || 0) !== ExpressionAttributeValues[":prev"]) {
        throw Object.assign(new Error("stale"), { name: "ConditionalCheckFailedException" });
      }
      const resolve = (n) => ExpressionAttributeNames[n] || n;
      for (const clause of UpdateExpression.split(/SET|ADD/).filter(Boolean).map((c) => c.trim())) {
        for (const part of clause.split(/,(?![^(]*\))/).map((p) => p.trim()).filter(Boolean)) {
          if (part.includes("=")) {
            const [lhs, rhs] = part.split("=").map((x) => x.trim());
            const ine = rhs.match(/^if_not_exists\((\S+?),\s*(:\S+)\)$/);
            if (ine) { const cur = item[resolve(ine[1])]; item[resolve(lhs)] = cur !== undefined ? cur : ExpressionAttributeValues[ine[2]]; }
            else item[resolve(lhs)] = ExpressionAttributeValues[rhs];
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
    async query({ IndexName, ExpressionAttributeValues: v, KeyConditionExpression }) {
      const items = [...store.values()];
      if (IndexName === "GSI1") return items.filter((i) => i.GSI1PK === v[":p"] && (!v[":s"] || String(i.GSI1SK).startsWith(v[":s"])));
      if (IndexName === "GSI2") return items.filter((i) => i.GSI2PK === v[":p"]);
      if (KeyConditionExpression?.includes("begins_with")) return items.filter((i) => i.PK === v[":p"] && String(i.SK).startsWith(v[":s"]));
      return items.filter((i) => i.PK === v[":p"]);
    },
    _store: store,
  };
  const s3store = new Map();
  return {
    ddb,
    s3: {
      async putObject(b, k, body) { s3store.set(`${b}/${k}`, body); },
      async getObjectText(b, k) { if (!s3store.has(`${b}/${k}`)) throw new Error("NoSuchKey"); return s3store.get(`${b}/${k}`); },
      async copyObject(b, from, to) { s3store.set(`${b}/${to}`, s3store.get(`${b}/${from}`)); },
      async deleteObject(b, k) { s3store.delete(`${b}/${k}`); },
      _store: s3store,
    },
    kvs: { async put() {}, async del() {} },
    cdn: { async invalidate() {} },
    ses: { sent: [], async send() {} },
    config: { appEnv: "test", apiBase: "https://api.test", publishedBucket: "pub", kvsArn: "arn:kvs", distributionId: "DIST", cdnDomain: "cdn.test" },
  };
}

const ev = (routeKey, { body, path, claims } = {}) => ({
  requestContext: {
    routeKey,
    http: { method: routeKey.split(" ")[0], path: routeKey.split(" ")[1] },
    ...(claims ? { authorizer: { jwt: { claims: { sub: claims, email: `${claims}@x.io` } } } } : {}),
  },
  headers: {},
  pathParameters: path,
  body: body ? JSON.stringify(body) : undefined,
});
const parse = (r) => ({ code: r.statusCode, body: JSON.parse(r.body) });
const dayKey = (back) => new Date(Date.now() - back * 86400000).toISOString().slice(0, 10);

// stand a live film up for the owner and return its id + slug
async function liveFilm(h, claims, slug) {
  const site = parse(await h(ev("POST /sites", { claims, body: { slug, title: slug } }))).body.site;
  await h(ev("POST /sites/{id}/publish", { claims, path: { id: site.siteId }, body: { html: "<!doctype html><html><body>x</body></html>" } }));
  return site;
}

test("stats: the owner sees their own film's views, week, and full window", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const site = await liveFilm(h, "u1", "nadia");

  // two views today (through the real beacon route), five seeded three days back
  await h(ev("POST /hit", { body: { page: "s/nadia" } }));
  await h(ev("POST /hit", { body: { page: "s/nadia" } }));
  ctx.ddb._store.set(`HIT#${dayKey(3)}|s/nadia`, { PK: `HIT#${dayKey(3)}`, SK: "s/nadia", count: 5 });

  const st = parse(await h(ev("GET /sites/{id}/stats", { claims: "u1", path: { id: site.siteId } })));
  assert.equal(st.code, 200);
  assert.equal(st.body.views, 7, "30-day total sums today + the seeded day");
  assert.equal(st.body.week, 7, "both fall inside the last 7 days");
  assert.equal(st.body.today, 2, "today's own count is exposed for the KPI");
  assert.equal(st.body.daily.length, 30, "the series is the full fixed window");
});

test("stats: a non-owner is refused (403), never shown another film's audience", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const site = await liveFilm(h, "owner", "prod");
  await h(ev("POST /hit", { body: { page: "s/prod" } }));

  const intruder = parse(await h(ev("GET /sites/{id}/stats", { claims: "intruder", path: { id: site.siteId } })));
  assert.equal(intruder.code, 403);
  assert.equal(intruder.body.ok, false);
});

test("stats: a brand-new film with zero views is an honest zero, not an error", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const site = await liveFilm(h, "u2", "fresh"); // published, but nobody has visited

  const st = parse(await h(ev("GET /sites/{id}/stats", { claims: "u2", path: { id: site.siteId } })));
  assert.equal(st.code, 200, "zero traffic is a 200, never a failure");
  assert.equal(st.body.views, 0);
  assert.equal(st.body.week, 0);
  assert.equal(st.body.today, 0);
  assert.equal(st.body.daily.length, 30);
  assert.ok(st.body.daily.every((d) => d.count === 0), "every day reads a real zero");
});

test("stats: the daily series covers the whole window, zero-filling silent days", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const site = await liveFilm(h, "u3", "gap");

  // traffic ONLY on the oldest in-window day and today; the 28 days between are silent
  ctx.ddb._store.set(`HIT#${dayKey(29)}|s/gap`, { PK: `HIT#${dayKey(29)}`, SK: "s/gap", count: 4 });
  ctx.ddb._store.set(`HIT#${dayKey(0)}|s/gap`, { PK: `HIT#${dayKey(0)}`, SK: "s/gap", count: 3 });

  const st = parse(await h(ev("GET /sites/{id}/stats", { claims: "u3", path: { id: site.siteId } })));
  assert.equal(st.body.daily.length, 30);
  assert.equal(st.body.daily[0].date, dayKey(29), "series starts at the window's oldest day");
  assert.equal(st.body.daily[0].count, 4, "the oldest day's traffic is present");
  assert.equal(st.body.daily.at(-1).date, dayKey(0), "series ends today");
  assert.equal(st.body.daily.at(-1).count, 3);
  // the silent middle is filled with real zeros, so a gap never becomes a hole
  const middle = st.body.daily.slice(1, -1);
  assert.equal(middle.length, 28);
  assert.ok(middle.every((d) => d.count === 0), "every silent day is an explicit zero");
  assert.equal(st.body.views, 7, "the total counts only the days with traffic");
});

test("stats: the window is self-describing so the UI can label it honestly", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const site = await liveFilm(h, "u4", "label");

  const st = parse(await h(ev("GET /sites/{id}/stats", { claims: "u4", path: { id: site.siteId } })));
  assert.equal(st.body.window, 30, "the fixed window is stated, not left for the UI to guess");
  assert.equal(st.body.since, dayKey(29), "the first day matches the 30-day window");
  assert.equal(st.body.metric, "views", "the metric names page loads, never 'unique visitors'");
});

test("stats: one owner's traffic never bleeds into another owner's film", async () => {
  const ctx = fakeCtx();
  const h = makeHandler(async () => ctx);
  const a = await liveFilm(h, "alice", "alice-film");
  const b = await liveFilm(h, "bob", "bob-film");

  // three views on alice's film only
  for (let i = 0; i < 3; i++) await h(ev("POST /hit", { body: { page: "s/alice-film" } }));

  const aStats = parse(await h(ev("GET /sites/{id}/stats", { claims: "alice", path: { id: a.siteId } })));
  const bStats = parse(await h(ev("GET /sites/{id}/stats", { claims: "bob", path: { id: b.siteId } })));
  assert.equal(aStats.body.views, 3, "alice sees her own three views");
  assert.equal(bStats.body.views, 0, "bob's untouched film stays a true zero");
});
