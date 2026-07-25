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
import { isShowcased } from "../showcase.mjs";

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
