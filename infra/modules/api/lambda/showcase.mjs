// showcase.mjs: the public proof wall. GET /showcase is the ONLY route here
// and it is deliberately unauthenticated: a logged-out buyer (and a payment
// provider's reviewer) must see real delivered portfolios without an account.
//
// Consent is mandatory and the default is OFF. A film appears here only when its
// owner opted in (showcase === true) AND it is actually live (status === "live").
// The response carries a tiny, curated public shape: slug, title, the live url,
// a poster image if the record has one, and a coarse public role label (kind)
// when a real one exists. Owner identity and every private field (email, owner
// sub, orderId, domain intent, trial clocks) never leave this handler. When
// nothing qualifies, the answer is an honest empty list, a 200 with films: [],
// never an error, and never a fabricated entry.
import { ok, bad, json, claimsOf, isAdmin, bodyOf, pathParam, now, clampStr, publicCacheHeaders } from "./lib.mjs";

import { previewUrl } from "./sites.mjs";

// how long a public showcase response may be cached at the edge and in the
// browser. Short by design: the wall changes only when an owner flips consent or
// a film goes live/dark, and a small window bounds how stale it can be while
// still collapsing an anonymous burst to one origin read (see getShowcase).
export const SHOWCASE_CACHE_SECONDS = 60;

// SCAN_CEILING bounds the work one anonymous request can trigger. A DynamoDB
// scan reads the table's items regardless of FilterExpression (the filter only
// drops rows AFTER they are read), so the honest cost control is a hard page
// cap: this caller reads at most SCAN_CEILING site rows per request and then
// stops, even if more exist. At demand-test scale (hundreds of rows) that is the
// whole table in one or two pages; the documented ceiling is the ~2k-row point
// past which this route must move to a type-overloaded GSI (a keys-only query,
// out of scope today). Until then the short edge cache above means the scan runs
// at most once per SHOWCASE_CACHE_SECONDS across every viewer, not once per hit.
export const SCAN_CEILING = 2000;

// type-filtered scan for the public wall. Two cost/privacy tightenings over a
// plain scan:
//   1. ProjectionExpression returns ONLY the fields the predicate, the sort, and
//      the public card need. Private columns (owner, email, orderId, domain
//      intent, trial clocks, GSI keys) never leave DynamoDB, which shrinks the
//      response and is defense in depth beneath card()'s allow-list.
//   2. a hard SCAN_CEILING (above) caps how many rows one request can read.
async function scanSites(ctx, cap = SCAN_CEILING) {
  const items = [];
  let lastKey;
  do {
    const r = await ctx.ddb.scan({
      FilterExpression: "#t = :t",
      // only the fields we actually read downstream; nothing private is projected
      ProjectionExpression: "#t, showcase, #s, slug, title, publishedAt, createdAt, poster, posterUrl, thumbnail",
      ExpressionAttributeNames: { "#t": "type", "#s": "status" },
      ExpressionAttributeValues: { ":t": "site" },
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    });
    items.push(...r.items);
    lastKey = r.lastKey;
  } while (lastKey && items.length < cap);
  return items;
}

// a site is showcased ONLY with explicit consent AND a live pointer. Consent is
// a strict boolean true: undefined, null, "true", 1 and every other truthy-ish
// value are treated as NOT consented, so the default can never drift to opt-out.
export const isShowcased = (s) => s?.showcase === true && s?.status === "live";

// the "kind of professional" a portfolio belongs to: a COARSE, public role
// label (e.g. "Engineer", "Founder", "Designer", "Professional"), the same kind
// of one-word descriptor a person already prints on their own public site. It is
// NOT personal data: no name, no email, no order id, no free text a visitor
// typed. We source it, in order, from:
//   1. a public-facing label already on the site record, if the record carries
//      one (role/headline/kind/craft), then
//   2. the coarse role label on the ORDER this film was cut from, reading ONLY
//      that one field and nothing else off the order (never the email, the name,
//      or the order id, which stay private).
// It returns null when there is no real value; the card then simply omits it.
// This never invents a role: a stranger only ever sees a label a real record
// already held.
const ROLE_LABEL_MAX = 40;
async function kindOf(s, ctx) {
  const onSite = s.role || s.headline || s.kind || s.craft || null;
  if (onSite) return clampStr(onSite, ROLE_LABEL_MAX) || null;
  // fall back to the cut's order, projecting ONLY its coarse role label
  if (s.orderId) {
    try {
      const order = await ctx.ddb.get({ PK: `ORDER#${s.orderId}`, SK: "META" });
      const role = order?.role || null; // the roleLabel studio.mjs stored
      if (role) return clampStr(role, ROLE_LABEL_MAX) || null;
    } catch {
      /* a missing or unreadable order simply means no label; never fatal */
    }
  }
  return null;
}

// the public card: exactly what a stranger may see, nothing more. A poster and a
// role label are each surfaced ONLY when a real value exists; there is no owner,
// no email, no order id, no internal counter in this object. `kind` is resolved
// by the caller (kindOf) so the shape stays pure and the read stays one place.
const card = (s, ctx, kind = null) => {
  const out = {
    slug: s.slug,
    title: s.title || s.slug,
    url: previewUrl(ctx, s.slug),
  };
  const poster = s.poster || s.posterUrl || s.thumbnail || null;
  if (poster) out.poster = poster;
  if (kind) out.kind = kind;
  return out;
};

// GET /showcase: PUBLIC, no auth. Returns the opted-in, live films as public
// cards, newest premiere first. Empty is a valid, honest answer. Role labels are
// resolved in parallel over the small showcased set (a handful of consented
// films), and only ever add a coarse public descriptor, never any private field.
// cards, newest premiere first. Empty is a valid, honest answer. The response
// carries a short public cache header (SHOWCASE_CACHE_SECONDS) so CloudFront and
// browsers can cache it: an anonymous burst then collapses to one origin read
// per window instead of a table scan on every hit. Caching is safe here because
// the payload is identical for every viewer and holds no per-user data.
export async function getShowcase(_event, ctx) {
  const sites = await scanSites(ctx);
  const shown = sites
    .filter(isShowcased)
    .sort((a, b) => String(b.publishedAt || b.createdAt || "").localeCompare(String(a.publishedAt || a.createdAt || "")));
  const kinds = await Promise.all(shown.map((s) => kindOf(s, ctx)));
  const films = shown.map((s, i) => card(s, ctx, kinds[i]));
  return ok({ ok: true, count: films.length, films }, publicCacheHeaders(SHOWCASE_CACHE_SECONDS));
}

// ownership gate, mirrored from sites.mjs ownedSite() on purpose: the read path
// already borrows previewUrl from sites.mjs, but the WRITE path keeps its own
// tiny copy so consent never depends on any other handler's internals and no
// import cycle is ever introduced. A site's owner is the only person who may
// speak for it; an admin may act on their behalf. Everyone else gets 403 and
// can never flip a stranger's site.
async function ownedSite(ctx, siteId, claims) {
  const site = await ctx.ddb.get({ PK: `SITE#${siteId}`, SK: "META" });
  if (!site) return { err: bad("site not found", 404) };
  if (site.owner !== claims.sub && !isAdmin(claims)) return { err: json(403, { ok: false, error: "not your site" }) };
  return { site };
}

// POST /sites/{id}/showcase { showcase: boolean }: the OWNER (or an admin) sets
// their own consent to appear on the public wall. This is the ONLY way the flag
// is ever set; no operator hand-edits DynamoDB anymore.
//
// Consent is explicit and reversible by construction:
//   - the body MUST carry a real boolean; anything else is a 400, so consent can
//     never be inferred from a truthy-ish value (matching isShowcased's strict ===).
//   - turning ON requires the film to be LIVE (status === "live"). A draft, a
//     taken-down site, or an expired engagement cannot be showcased, because the
//     read rule would hide it anyway; we reject with 409 rather than store a
//     true flag that silently does nothing and later surprises the owner.
//   - turning OFF always works, in any status, immediately. The next public read
//     re-scans and the film is gone from the gallery.
// The response returns the persisted flag so an optimistic UI reconciles with
// server truth and never shows a state the server did not confirm.
export async function setShowcase(event, ctx) {
  const claims = claimsOf(event);
  const { site, err } = await ownedSite(ctx, pathParam(event, "id"), claims);
  if (err) return err;
  const b = bodyOf(event);
  if (!b) return bad("invalid json");
  if (typeof b.showcase !== "boolean") return bad("showcase must be true or false");

  // turning ON a film that is not live would store consent the read path ignores.
  // Refuse it plainly instead: the film must premiere first.
  if (b.showcase === true && site.status !== "live") {
    return json(409, { ok: false, error: "premiere the film first, then add it to the showcase" });
  }

  // Turning OFF is immediate: leaving the wall never needs permission.
  // Turning ON is a REQUEST: the wall lists a film only after a director
  // approves it (showcase === true via POST /admin/sites/{id}/showcase), so
  // consent flows owner -> Floor -> public and the wall stays curated. An
  // admin's own opt-in approves itself; they ARE the Floor.
  const value = b.showcase === true ? (isAdmin(claims) ? true : "pending") : false;
  await ctx.ddb.update({
    Key: { PK: site.PK, SK: "META" },
    UpdateExpression: "SET showcase = :v, updatedAt = :t",
    ConditionExpression: "attribute_exists(PK)",
    ExpressionAttributeValues: { ":v": value, ":t": now() },
  });
  return ok({ ok: true, siteId: site.siteId, slug: site.slug, showcase: value });
}
