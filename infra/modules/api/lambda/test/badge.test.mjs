// node --test: the "Made with CineFolio" end credit (the growth-loop badge).
// Two things are guarded here, matching how the feature is built:
//   1. the ENGINE emits the badge by default on every published page, in every
//      film-stock palette, and emits NOTHING when the owner has turned it off.
//   2. the WRITE path (POST /sites/{id}/badge) lets only the OWNER (or an admin)
//      flip the flag, takes a strict boolean, and returns the persisted value.
// The badge is ON by default and always removable for free in one click, so the
// tests assert both that it is present by default AND that turning it off leaves
// no trace at all in the compiled markup.
//
// The engine lives in the app (client-compiled at publish time); it is a pure ESM
// module with no browser globals, so node imports it directly by relative path and
// exercises the very code the published site ships.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, compileBundle, parseProfile, TEMPLATES } from "../../../../../app/src/templates/engine.js";

// A bundle's files[] holds HTML pages AND the share assets (favicon, og card)
// that the heads reference. The credit lives in markup, so badge assertions walk
// the pages; an asset entry has no .html and correctly carries no credit.
const pages = (files) => files.filter((f) => typeof f.html === "string");
import { setBadge } from "../sites.mjs";

// a realistic profile with one case-study project, so the bundle has an index
// page AND a standalone case page to check.
const profile = parseProfile(
  "Ada Lovelace\nAnalytical Engineer\nSkills: React, Node, SQL\nExperience\n2019-2021 Lead Engineer at Acme"
);
profile.projects = [
  { name: "Analytical Engine", desc: "the first program", problem: "hard", process: "math", results: "it computed", role: "Lead" },
];

// the two ways to know the badge is on a page and, crucially, GONE when off. The
// engine tags the credit with data-cf-credit and the visible text is unambiguous.
const hasBadge = (html) => /data-cf-credit/.test(html) && /Made with CineFolio/.test(html);

// ---------- the ENGINE: renders the badge by default ----------

test("badge engine: the credit renders by DEFAULT on every template", () => {
  for (const t of TEMPLATES) {
    const html = compile(t.id, t.palettes[0].id, profile, {}); // no badge opt -> default
    assert.ok(hasBadge(html), `${t.id} must show the badge by default`);
  }
});

test("badge engine: the credit is a real link to cinefolio.dev with rel=noopener", () => {
  for (const t of TEMPLATES) {
    const html = compile(t.id, t.palettes[0].id, profile, {});
    const block = html.match(/<footer data-cf-credit[\s\S]*?<\/footer>/);
    assert.ok(block, `${t.id} must contain the credit footer`);
    const markup = block[0];
    // links out to the product, opens safely, and reads like an end credit
    assert.match(markup, /href="https:\/\/cinefolio\.dev\/\?ref=made-with"/, `${t.id} links to cinefolio.dev`);
    assert.match(markup, /rel="noopener"/, `${t.id} uses rel=noopener`);
    assert.match(markup, /target="_blank"/, `${t.id} opens the credit in a new tab`);
    assert.match(markup, /Made with CineFolio/, `${t.id} carries the end-credit text`);
    // it must NOT read like an ad or a nag: no "upgrade", no "remove", no price
    assert.doesNotMatch(markup, /upgrade|remove the badge|\$\d|pro\b/i, `${t.id} credit must not upsell`);
  }
});

test("badge engine: the credit ADAPTS to each film-stock palette (borrows the page color)", () => {
  // every palette resolves a real foreground color onto the credit anchor, so it
  // never ships a fixed color that would clash on a light or a dark stock.
  const colorOf = (html) => {
    const block = html.match(/<footer data-cf-credit[\s\S]*?<\/footer>/)?.[0] || "";
    return block.match(/color:(#[0-9A-Fa-f]{3,8});opacity:\.5;text-decoration/)?.[1] || null;
  };
  for (const t of TEMPLATES) {
    const seen = new Set();
    for (const pal of t.palettes) {
      const html = compile(t.id, pal.id, profile, {});
      assert.ok(hasBadge(html), `${t.id}/${pal.id} shows the badge`);
      const c = colorOf(html);
      assert.ok(c, `${t.id}/${pal.id} resolves a palette color onto the credit`);
      seen.add(c);
    }
    // the three stocks of a family do not all collapse to one identical color:
    // the credit really tracks the palette rather than being hard-coded.
    assert.ok(seen.size > 1, `${t.id} credit color must vary across its palettes`);
  }
});

// ---------- the ENGINE: renders NOTHING when the owner turned it off ----------

test("badge engine: with badge:false the credit is GONE, leaving no trace", () => {
  for (const t of TEMPLATES) {
    const off = compile(t.id, t.palettes[0].id, profile, { badge: false });
    assert.doesNotMatch(off, /data-cf-credit/, `${t.id} off: no credit footer`);
    assert.doesNotMatch(off, /Made with CineFolio/, `${t.id} off: no credit text`);
    assert.doesNotMatch(off, /cinefolio\.dev\/\?ref=made-with/, `${t.id} off: no credit link`);
    // the page is still a whole, valid document; removing the badge broke nothing
    assert.ok(off.trim().endsWith("</html>"), `${t.id} off: still a complete page`);
  }
});

test("badge engine: badge:true is equivalent to the default (explicit on)", () => {
  for (const t of TEMPLATES) {
    const on = compile(t.id, t.palettes[0].id, profile, { badge: true });
    assert.ok(hasBadge(on), `${t.id} explicit on shows the badge`);
  }
});

// ---------- the BUNDLE: the badge rides EVERY published page (or none) ----------

test("badge engine: a published bundle carries the credit on the index AND case pages by default", () => {
  const files = pages(compileBundle("gallery", "porcelain", profile, {}).files);
  assert.ok(files.length >= 2, "bundle has an index and at least one case page");
  for (const f of files) assert.ok(hasBadge(f.html), `${f.path} must carry the badge by default`);
});

test("badge engine: turning the badge off removes it from EVERY page of the bundle", () => {
  const files = pages(compileBundle("gallery", "porcelain", profile, { badge: false }).files);
  assert.ok(files.length >= 2, "bundle still has an index and a case page");
  for (const f of files) {
    assert.doesNotMatch(f.html, /data-cf-credit/, `${f.path} off: no credit`);
    assert.doesNotMatch(f.html, /Made with CineFolio/, `${f.path} off: no credit text`);
  }
});

// ---------- the WRITE path: POST /sites/{id}/badge (owner sets the flag) ----------
// Mirrors showcase.test.mjs: an in-memory ctx with get + update, and the same
// event shape the router builds. These guard that only the owner (or an admin)
// may flip the flag, the value must be a real boolean, and the persisted flag is
// returned so an optimistic UI reconciles to server truth. Removal is free and
// always allowed: there is no plan check and no status gate anywhere in setBadge.
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
    _store: store,
  };
  return { ddb, config: { appEnv: "test", sitesDomain: "cinefolio.dev", cdnDomain: "cdn.test" } };
}

// a site record; badge defaults to "not stored" (which the engine reads as ON)
const site = (over = {}) => ({
  PK: `SITE#${over.siteId || "s1"}`, SK: "META", type: "site",
  siteId: over.siteId || "s1", slug: over.slug || "ada-lovelace", title: over.title || "Ada Lovelace",
  status: over.status || "live", owner: over.owner || "owner-1",
  releases: 2, liveRelease: 2, createdAt: "2026-06-01T00:00:00.000Z",
  ...over,
});

// POST /sites/{id}/badge event; sub is the caller, groups optional (admin)
const badgeEvent = (siteId, sub, badge, groups) => ({
  requestContext: {
    routeKey: "POST /sites/{id}/badge",
    http: { method: "POST", path: `/sites/${siteId}/badge` },
    authorizer: { jwt: { claims: { sub, email: `${sub}@x.io`, ...(groups ? { "cognito:groups": groups } : {}) } } },
  },
  pathParameters: { id: siteId },
  body: JSON.stringify({ badge }),
});
const parse = (r) => ({ code: r.statusCode, body: JSON.parse(r.body) });

test("badge write: the owner can turn the credit OFF and back ON", async () => {
  const ctx = writeCtx([site({ siteId: "s1", owner: "owner-1" })]); // badge absent -> on by default

  // OFF (the free, one-click removal)
  let r = parse(await setBadge(badgeEvent("s1", "owner-1", false), ctx));
  assert.equal(r.code, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.badge, false);            // server confirms the persisted flag
  assert.equal(r.body.slug, "ada-lovelace");
  assert.equal(ctx.ddb._store.get("SITE#s1|META").badge, false); // truly stored

  // ON again, just as frictionless
  r = parse(await setBadge(badgeEvent("s1", "owner-1", true), ctx));
  assert.equal(r.code, 200);
  assert.equal(r.body.badge, true);
  assert.equal(ctx.ddb._store.get("SITE#s1|META").badge, true);
});

test("badge write: a NON-OWNER is refused with 403 and cannot change another user's setting", async () => {
  const ctx = writeCtx([site({ siteId: "s1", owner: "owner-1", badge: true })]);
  const r = parse(await setBadge(badgeEvent("s1", "someone-else", false), ctx));
  assert.equal(r.code, 403);
  assert.equal(r.body.ok, false);
  // the stored flag is untouched: a stranger never changed the owner's badge
  assert.equal(ctx.ddb._store.get("SITE#s1|META").badge, true);
});

test("badge write: an admin may set the flag on someone else's film", async () => {
  const ctx = writeCtx([site({ siteId: "s1", owner: "owner-1", badge: true })]);
  const r = parse(await setBadge(badgeEvent("s1", "admin-sub", false, ["admin"]), ctx));
  assert.equal(r.code, 200);
  assert.equal(r.body.badge, false);
  assert.equal(ctx.ddb._store.get("SITE#s1|META").badge, false);
});

test("badge write: the body must be a real boolean; a truthy string is a 400", async () => {
  const ctx = writeCtx([site({ siteId: "s1", owner: "owner-1" })]);
  const ev = badgeEvent("s1", "owner-1", false);
  ev.body = JSON.stringify({ badge: "false" }); // truthy-ish, not a boolean
  const r = parse(await setBadge(ev, ctx));
  assert.equal(r.code, 400);
  assert.equal(ctx.ddb._store.get("SITE#s1|META").badge, undefined); // nothing stored
});

test("badge write: turning the credit off works in ANY status (removal is never gated)", async () => {
  // unlike the showcase flag, the badge has no live-only requirement: a draft, a
  // taken-down film, or an expired one can all remove the credit for the next
  // publish, immediately and for free.
  for (const status of ["draft", "taken_down", "trial_ended", "live"]) {
    const ctx = writeCtx([site({ siteId: "s1", owner: "owner-1", status })]);
    const r = parse(await setBadge(badgeEvent("s1", "owner-1", false), ctx));
    assert.equal(r.code, 200, `${status} must allow turning the badge off`);
    assert.equal(r.body.badge, false);
    assert.equal(ctx.ddb._store.get("SITE#s1|META").badge, false);
  }
});

test("badge write: the response is never cached (a mutating owner response is no-store)", async () => {
  const ctx = writeCtx([site({ siteId: "s1", owner: "owner-1" })]);
  const raw = await setBadge(badgeEvent("s1", "owner-1", false), ctx);
  assert.equal(raw.statusCode, 200);
  assert.equal(raw.headers["cache-control"], "no-store");
});

test("badge write: setting the flag on an unknown site is a 404", async () => {
  const ctx = writeCtx([]);
  const r = parse(await setBadge(badgeEvent("ghost", "owner-1", false), ctx));
  assert.equal(r.code, 404);
});

// ---------- the WRITE path meets the ENGINE: off-then-republish removes it ----------

test("badge end to end: an owner turns it off, and the next compiled publish omits the credit", async () => {
  // the flag the write path stores is the exact flag the engine reads at publish
  // time. Prove the whole loop: default publish shows the badge; after the owner
  // stores badge:false, recompiling with that flag ships a page with no credit.
  const ctx = writeCtx([site({ siteId: "s1", owner: "owner-1" })]);

  // a publish today (flag absent -> default on) carries the credit
  const before = compileBundle("monolith", "jersey", profile, { badge: ctx.ddb._store.get("SITE#s1|META").badge });
  assert.ok(pages(before.files).every((f) => hasBadge(f.html)), "default publish shows the badge");

  // owner turns it off (free, one click)
  const r = parse(await setBadge(badgeEvent("s1", "owner-1", false), ctx));
  assert.equal(r.body.badge, false);

  // the very next publish, compiled with the now-persisted flag, has no credit
  const after = compileBundle("monolith", "jersey", profile, { badge: ctx.ddb._store.get("SITE#s1|META").badge });
  assert.ok(pages(after.files).every((f) => !hasBadge(f.html)), "next publish omits the badge");
});
