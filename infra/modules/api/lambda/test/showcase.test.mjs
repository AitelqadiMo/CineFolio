// node --test: the public showcase wall. These tests guard the promises that
// make it safe to point a buyer (or a payment-provider reviewer) at it:
//   1. it answers with NO auth at all (a logged-out stranger's request)
//   2. only LIVE and opted-in films appear (consent is mandatory, default OFF)
//   3. private fields (owner, email, orderId, domain, trial clocks) never leak
//   4. an empty wall returns an empty LIST, a 200, never an error
// The handler runs through the real router (makeHandler) so the route wiring is
// exercised too: if /showcase ever slipped behind the JWT authorizer the "no
// auth" test would still pass at the gateway, but keeping it on the public path
// is enforced in infra; here we prove the handler itself never reads claims.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeHandler } from "../index.mjs";
import { isShowcased, setShowcase, SHOWCASE_CACHE_SECONDS } from "../showcase.mjs";
import { showcaseDecide } from "../admin.mjs";

// ---------- a minimal fake ctx: an in-memory table + the config previewUrl reads ----------
function fakeCtx(seedSites = []) {
  const store = new Map(); // "PK|SK" -> item
  for (const s of seedSites) store.set(`${s.PK}|${s.SK}`, structuredClone(s));
  const ddb = {
    async get(Key) { return store.get(`${Key.PK}|${Key.SK}`) || null; },
    async scan({ ExpressionAttributeValues: v }) {
      // single-page type-filtered scan, mirroring the real caller's usage
      return { items: [...store.values()].filter((i) => i.type === v[":t"]), lastKey: null };
    },
    _store: store,
  };
  return {
    ddb,
    // previewUrl uses sitesDomain when set: https://{slug}.{sitesDomain}/
    config: { appEnv: "test", sitesDomain: "cinefolio.dev", cdnDomain: "cdn.test" },
  };
}

// a live, opted-in site carrying a full set of PRIVATE fields we must never emit
const site = (over = {}) => ({
  PK: `SITE#${over.siteId || "s1"}`, SK: "META", type: "site",
  siteId: over.siteId || "s1", slug: over.slug || "saad-bougha", title: over.title || "Saad Bougha",
  status: "live", showcase: true,
  // --- private, must never appear in the public payload ---
  owner: "cognito-sub-abc", ownerEmail: "saad@example.com", orderId: "ord-778899",
  customDomain: "saad.dev", domainStatus: "pending_dns", trialEndsAt: "2030-01-01T00:00:00.000Z",
  releases: 3, liveRelease: 3, publishedAt: "2026-07-01T00:00:00.000Z", createdAt: "2026-06-01T00:00:00.000Z",
  GSI1PK: "USER#cognito-sub-abc", GSI1SK: "SITE#2026-06-01",
  ...over,
});

// the router event for GET /showcase with NO authorizer block at all
const publicEvent = () => ({
  requestContext: { routeKey: "GET /showcase", http: { method: "GET", path: "/showcase" } },
  // deliberately no requestContext.authorizer: this is a logged-out visitor
});
const parse = (r) => ({ code: r.statusCode, body: JSON.parse(r.body) });

// ---------- tests ----------

test("showcase: a logged-out visitor (no auth) gets the wall", async () => {
  const ctx = fakeCtx([site()]);
  const h = makeHandler(async () => ctx);
  const ev = publicEvent();
  assert.equal(ev.requestContext.authorizer, undefined, "the request carries no claims");
  const { code, body } = parse(await h(ev));
  assert.equal(code, 200);
  assert.equal(body.ok, true);
  assert.equal(body.films.length, 1);
  assert.equal(body.count, 1);
  assert.equal(body.films[0].slug, "saad-bougha");
  assert.equal(body.films[0].title, "Saad Bougha");
  // the live url is the real subdomain the buyer can click
  assert.equal(body.films[0].url, "https://saad-bougha.cinefolio.dev/");
});

test("showcase: only LIVE and opted-in films appear; every other state is hidden", async () => {
  const ctx = fakeCtx([
    site({ siteId: "live-in", slug: "saad-bougha" }),                              // live + opted in  -> SHOWN
    site({ siteId: "live-in-2", slug: "abdelhamid-chouraichio", title: "Abdelhamid" }), // live + opted in  -> SHOWN
    site({ siteId: "live-out", slug: "not-consented", showcase: false }),          // live, NOT opted in -> hidden
    site({ siteId: "live-default", slug: "no-flag", showcase: undefined }),        // live, flag absent  -> hidden (default OFF)
    site({ siteId: "draft-in", slug: "draft-optin", status: "draft" }),            // opted in but draft  -> hidden
    site({ siteId: "down-in", slug: "was-live", status: "taken_down" }),           // opted in but dark   -> hidden
    site({ siteId: "trial-in", slug: "trial-over", status: "trial_ended" }),       // opted in but expired -> hidden
  ]);
  const h = makeHandler(async () => ctx);
  const { code, body } = parse(await h(publicEvent()));
  assert.equal(code, 200);
  const slugs = body.films.map((f) => f.slug).sort();
  assert.deepEqual(slugs, ["abdelhamid-chouraichio", "saad-bougha"]);
  assert.equal(body.count, 2);
  // the predicate itself is strict: only boolean-true consent on a live site
  assert.equal(isShowcased({ showcase: true, status: "live" }), true);
  assert.equal(isShowcased({ showcase: false, status: "live" }), false);
  assert.equal(isShowcased({ showcase: true, status: "draft" }), false);
  assert.equal(isShowcased({ status: "live" }), false);            // flag absent -> default OFF
  assert.equal(isShowcased({ showcase: "true", status: "live" }), false); // truthy string is not consent
  assert.equal(isShowcased({ showcase: 1, status: "live" }), false);      // truthy number is not consent
  assert.equal(isShowcased(null), false);
});

test("showcase: private fields NEVER leak into the public payload", async () => {
  const ctx = fakeCtx([site()]);
  const h = makeHandler(async () => ctx);
  const { body } = parse(await h(publicEvent()));
  const film = body.films[0];
  // the ONLY keys a stranger may see
  assert.deepEqual(Object.keys(film).sort(), ["slug", "title", "url"]);
  // spell out the forbidden fields so a future refactor that widens the card
  // trips this test loudly
  for (const forbidden of ["owner", "ownerEmail", "email", "orderId", "customDomain", "domainStatus", "trialEndsAt", "GSI1PK", "GSI1SK", "PK", "SK"]) {
    assert.equal(film[forbidden], undefined, `public card must not expose ${forbidden}`);
  }
  // belt and suspenders: the serialized JSON must not contain the private values
  const raw = JSON.stringify(body);
  assert.equal(raw.includes("saad@example.com"), false, "owner email must not appear anywhere");
  assert.equal(raw.includes("cognito-sub-abc"), false, "owner sub must not appear anywhere");
  assert.equal(raw.includes("ord-778899"), false, "order id must not appear anywhere");
});

test("showcase: a poster/thumbnail is surfaced only when the record carries one", async () => {
  const ctx = fakeCtx([
    site({ siteId: "with", slug: "has-poster", poster: "https://cdn.test/media/u/hero.jpg" }),
    site({ siteId: "without", slug: "no-poster" }),
  ]);
  const h = makeHandler(async () => ctx);
  const { body } = parse(await h(publicEvent()));
  const byslug = Object.fromEntries(body.films.map((f) => [f.slug, f]));
  assert.equal(byslug["has-poster"].poster, "https://cdn.test/media/u/hero.jpg");
  assert.equal("poster" in byslug["no-poster"], false, "no fabricated poster when the record has none");
});

test("showcase: an empty wall returns an empty LIST and 200, never an error, never a fake entry", async () => {
  // nothing opted in at all
  const ctx = fakeCtx([
    site({ siteId: "a", slug: "private-a", showcase: false }),
    site({ siteId: "b", slug: "private-b", showcase: undefined }),
  ]);
  const h = makeHandler(async () => ctx);
  const { code, body } = parse(await h(publicEvent()));
  assert.equal(code, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.films, []);
  assert.equal(body.count, 0);
});

test("showcase: a genuinely empty table (no sites) still returns 200 with an empty list", async () => {
  const ctx = fakeCtx([]);
  const h = makeHandler(async () => ctx);
  const { code, body } = parse(await h(publicEvent()));
  assert.equal(code, 200);
  assert.deepEqual(body.films, []);
  assert.equal(body.count, 0);
});

// ---------- the EDGE CACHE: the public read opts into a short cache header ----------
// The public wall is identical for every viewer and carries no per-user data, so
// it is safe to cache at the edge. These guard that the ONE public route opts in
// (so an anonymous burst collapses to one origin scan per window) while the cache
// never becomes a way to leak private fields, and the WRITE path stays no-store.

test("showcase: the public read is edge-cacheable with a short max-age, not no-store", async () => {
  const ctx = fakeCtx([site()]);
  const h = makeHandler(async () => ctx);
  const r = await h(publicEvent());
  assert.equal(r.statusCode, 200);
  const cc = r.headers["cache-control"];
  // no longer the default no-store: CloudFront and the browser may hold it
  assert.notEqual(cc, "no-store", "the public wall must be cacheable, not no-store");
  assert.match(cc, /(^|[,\s])public([,\s]|$)/, "must be publicly cacheable");
  assert.match(cc, new RegExp(`max-age=${SHOWCASE_CACHE_SECONDS}\\b`), "browser cache TTL");
  assert.match(cc, new RegExp(`s-maxage=${SHOWCASE_CACHE_SECONDS}\\b`), "CloudFront cache TTL");
  // the window is short by design so the wall can never go badly stale
  assert.ok(SHOWCASE_CACHE_SECONDS > 0 && SHOWCASE_CACHE_SECONDS <= 300, "a short, bounded TTL");
});

test("showcase: an empty public wall is still cacheable (a burst of empties is coalesced too)", async () => {
  const ctx = fakeCtx([]);
  const h = makeHandler(async () => ctx);
  const r = await h(publicEvent());
  assert.equal(r.statusCode, 200);
  assert.match(r.headers["cache-control"], new RegExp(`max-age=${SHOWCASE_CACHE_SECONDS}\\b`));
});

test("showcase: caching never widens the payload, a cached response still exposes only slug/title/url", async () => {
  // the cache header and the privacy shape are independent guarantees; prove the
  // response that carries the cache header still holds nothing private.
  const ctx = fakeCtx([site()]);
  const h = makeHandler(async () => ctx);
  const r = await h(publicEvent());
  assert.match(r.headers["cache-control"], /public/);
  const body = JSON.parse(r.body);
  assert.deepEqual(Object.keys(body.films[0]).sort(), ["slug", "title", "url"]);
  // the cacheable bytes must not contain any owner-identifying value
  assert.equal(r.body.includes("saad@example.com"), false, "no owner email in the cacheable body");
  assert.equal(r.body.includes("cognito-sub-abc"), false, "no owner sub in the cacheable body");
  assert.equal(r.body.includes("ord-778899"), false, "no order id in the cacheable body");
});

// ---------- the WRITE path: POST /sites/{id}/showcase (owner consent) ----------
// These guard the promise that consent comes from the OWNER clicking a control,
// never an operator hand-editing the table: only the owner (or an admin) may
// flip the flag, the value must be a real boolean, turning ON requires a live
// film, turning OFF always works, and the public read reflects the change.

// a write-capable fake ctx: get + update + the type-filtered scan the read uses.
// The update interpreter handles exactly the one expression setShowcase issues.
function writeCtx(seedSites = []) {
  const store = new Map();
  for (const s of seedSites) store.set(`${s.PK}|${s.SK}`, structuredClone(s));
  const ddb = {
    async get(Key) { return store.get(`${Key.PK}|${Key.SK}`) || null; },
    async update({ Key, UpdateExpression, ExpressionAttributeValues = {}, ConditionExpression }) {
      const k = `${Key.PK}|${Key.SK}`;
      if (ConditionExpression === "attribute_exists(PK)" && !store.has(k)) {
        throw Object.assign(new Error("missing"), { name: "ConditionalCheckFailedException" });
      }
      const item = store.get(k) || { ...Key };
      for (const part of UpdateExpression.replace(/^SET\s+/, "").split(",").map((p) => p.trim())) {
        const [lhs, rhs] = part.split("=").map((x) => x.trim());
        item[lhs] = ExpressionAttributeValues[rhs];
      }
      store.set(k, item);
      return item;
    },
    async scan({ ExpressionAttributeValues: v }) {
      return { items: [...store.values()].filter((i) => i.type === v[":t"]), lastKey: null };
    },
    _store: store,
  };
  return { ddb, config: { appEnv: "test", sitesDomain: "cinefolio.dev", cdnDomain: "cdn.test" } };
}

// POST /sites/{id}/showcase event; sub is the caller, groups optional (admin)
const setEvent = (siteId, sub, showcase, groups) => ({
  requestContext: {
    routeKey: "POST /sites/{id}/showcase",
    http: { method: "POST", path: `/sites/${siteId}/showcase` },
    authorizer: { jwt: { claims: { sub, email: `${sub}@x.io`, ...(groups ? { "cognito:groups": groups } : {}) } } },
  },
  pathParameters: { id: siteId },
  body: JSON.stringify({ showcase }),
});

test("showcase write: owner opt-in is a PENDING request, the Floor approves, opt-out is immediate", async () => {
  // default OFF to start: the flag is absent on a freshly live film
  const ctx = writeCtx([site({ siteId: "s1", slug: "hindi", owner: "owner-1", showcase: undefined })]);

  // ON: the owner's opt-in stores a REQUEST, never a public listing
  let r = parse(await setShowcase(setEvent("s1", "owner-1", true), ctx));
  assert.equal(r.code, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.showcase, "pending");    // server confirms the persisted state
  assert.equal(r.body.slug, "hindi");
  assert.equal(ctx.ddb._store.get("SITE#s1|META").showcase, "pending"); // truly stored
  assert.equal(isShowcased(ctx.ddb._store.get("SITE#s1|META")), false, "a pending request never reaches the wall");

  // the Floor approves: only now does the listing become public truth
  const adminEv = (approve) => ({
    requestContext: { routeKey: "POST /admin/sites/{id}/showcase", http: { method: "POST", path: "/admin/sites/s1/showcase" },
      authorizer: { jwt: { claims: { sub: "floor-1", email: "floor-1@x.io", "cognito:groups": ["admin"] } } } },
    pathParameters: { id: "s1" },
    body: JSON.stringify({ approve }),
  });
  const d = parse(await showcaseDecide(adminEv(true), ctx));
  assert.equal(d.code, 200);
  assert.equal(d.body.showcase, true);
  assert.equal(ctx.ddb._store.get("SITE#s1|META").showcase, true);
  assert.equal(isShowcased(ctx.ddb._store.get("SITE#s1|META")), true);

  // OFF: leaving the wall is immediate, no approval needed in that direction
  r = parse(await setShowcase(setEvent("s1", "owner-1", false), ctx));
  assert.equal(r.code, 200);
  assert.equal(r.body.showcase, false);
  assert.equal(ctx.ddb._store.get("SITE#s1|META").showcase, false);
});

test("showcase write: the consent WRITE response stays no-store (the cache opt-in is read-only)", async () => {
  // the public read is edge-cacheable, but the per-owner mutating response must
  // never be cached; the cache header must not have leaked onto this route.
  const ctx = writeCtx([site({ siteId: "s1", slug: "hindi", owner: "owner-1", showcase: undefined })]);
  const raw = await setShowcase(setEvent("s1", "owner-1", true), ctx);
  assert.equal(raw.statusCode, 200);
  assert.equal(raw.headers["cache-control"], "no-store", "a mutating owner response is never cached");
});

test("showcase write: a non-owner is refused with 403 and cannot flip the flag", async () => {
  const ctx = writeCtx([site({ siteId: "s1", slug: "yass", owner: "owner-1", showcase: false })]);
  const r = parse(await setShowcase(setEvent("s1", "someone-else", true), ctx));
  assert.equal(r.code, 403);
  assert.equal(r.body.ok, false);
  // the stored flag is untouched: a stranger never changed another owner's site
  assert.equal(ctx.ddb._store.get("SITE#s1|META").showcase, false);
});

test("showcase write: an admin may set the flag on someone else's film", async () => {
  const ctx = writeCtx([site({ siteId: "s1", slug: "saad-bougha", owner: "owner-1", showcase: false })]);
  const r = parse(await setShowcase(setEvent("s1", "admin-sub", true, ["admin"]), ctx));
  assert.equal(r.code, 200);
  assert.equal(r.body.showcase, true);
  assert.equal(ctx.ddb._store.get("SITE#s1|META").showcase, true);
});

test("showcase write: a NON-LIVE film cannot be showcased (409), consistent with the read rule", async () => {
  // draft, taken_down, and trial_ended all fail the read predicate, so turning
  // ON is rejected rather than storing a true flag the gallery would ignore.
  for (const status of ["draft", "taken_down", "trial_ended"]) {
    const ctx = writeCtx([site({ siteId: "s1", slug: "not-live", owner: "owner-1", status, showcase: undefined })]);
    const r = parse(await setShowcase(setEvent("s1", "owner-1", true), ctx));
    assert.equal(r.code, 409, `${status} must be rejected`);
    assert.equal(r.body.ok, false);
    assert.equal(ctx.ddb._store.get("SITE#s1|META").showcase, undefined, `${status} must not gain consent`);
  }
});

test("showcase write: turning OFF works in any status (consent is always reversible)", async () => {
  // a film that went dark after opting in can always withdraw consent
  const ctx = writeCtx([site({ siteId: "s1", slug: "was-live", owner: "owner-1", status: "taken_down", showcase: true })]);
  const r = parse(await setShowcase(setEvent("s1", "owner-1", false), ctx));
  assert.equal(r.code, 200);
  assert.equal(r.body.showcase, false);
  assert.equal(ctx.ddb._store.get("SITE#s1|META").showcase, false);
});

test("showcase write: the body must be a real boolean; a truthy string is a 400", async () => {
  const ctx = writeCtx([site({ siteId: "s1", slug: "hindi", owner: "owner-1", showcase: undefined })]);
  const ev = setEvent("s1", "owner-1", true);
  ev.body = JSON.stringify({ showcase: "true" }); // truthy-ish, not consent
  const r = parse(await setShowcase(ev, ctx));
  assert.equal(r.code, 400);
  assert.equal(ctx.ddb._store.get("SITE#s1|META").showcase, undefined);
});

test("showcase write: setting the flag on an unknown site is a 404", async () => {
  const ctx = writeCtx([]);
  const r = parse(await setShowcase(setEvent("ghost", "owner-1", true), ctx));
  assert.equal(r.code, 404);
});

test("showcase write: the public read reflects the change end to end", async () => {
  // one shared ctx: opt in through the write handler, then read the public wall
  // through the real router and confirm the film appears; opt out and it is gone.
  const ctx = writeCtx([
    site({ siteId: "s1", slug: "abdelhamid-chouraichi", title: "Abdelhamid Chouraichi", owner: "owner-1", showcase: undefined }),
  ]);
  const read = makeHandler(async () => ctx);

  // before consent: absent from the wall (default OFF)
  let wall = parse(await read(publicEvent()));
  assert.equal(wall.body.films.find((f) => f.slug === "abdelhamid-chouraichi"), undefined);

  // owner opts in: a PENDING request, still absent from the wall
  const on = parse(await setShowcase(setEvent("s1", "owner-1", true), ctx));
  assert.equal(on.body.showcase, "pending");
  wall = parse(await read(publicEvent()));
  assert.equal(wall.body.films.find((f) => f.slug === "abdelhamid-chouraichi"), undefined, "pending is never public");

  // the Floor approves the request
  const approve = parse(await showcaseDecide({
    requestContext: { routeKey: "POST /admin/sites/{id}/showcase", http: { method: "POST", path: "/admin/sites/s1/showcase" },
      authorizer: { jwt: { claims: { sub: "floor-1", email: "floor-1@x.io", "cognito:groups": ["admin"] } } } },
    pathParameters: { id: "s1" },
    body: JSON.stringify({ approve: true }),
  }, ctx));
  assert.equal(approve.body.showcase, true);

  // now it is on the public wall, with only the public card fields
  wall = parse(await read(publicEvent()));
  const card = wall.body.films.find((f) => f.slug === "abdelhamid-chouraichi");
  assert.ok(card, "opted-in live film appears on the public wall");
  assert.equal(card.title, "Abdelhamid Chouraichi");
  assert.equal(card.url, "https://abdelhamid-chouraichi.cinefolio.dev/");
  assert.deepEqual(Object.keys(card).sort(), ["slug", "title", "url"]);

  // owner opts out -> gone on the very next read
  parse(await setShowcase(setEvent("s1", "owner-1", false), ctx));
  wall = parse(await read(publicEvent()));
  assert.equal(wall.body.films.find((f) => f.slug === "abdelhamid-chouraichi"), undefined);
});
