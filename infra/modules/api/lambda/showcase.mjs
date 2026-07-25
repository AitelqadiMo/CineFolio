// showcase.mjs: the public proof wall. GET /showcase is the ONLY route here
// and it is deliberately unauthenticated: a logged-out buyer (and a payment
// provider's reviewer) must see real delivered portfolios without an account.
//
// Consent is mandatory and the default is OFF. A film appears here only when its
// owner opted in (showcase === true) AND it is actually live (status === "live").
// The response carries a tiny, curated public shape: slug, title, the live url,
// and a poster image if the record has one. Owner identity and every private
// field (email, owner sub, orderId, domain intent, trial clocks) never leave
// this handler. When nothing qualifies, the answer is an honest empty list, a
// 200 with films: [], never an error, and never a fabricated entry.
import { ok, bad, json, claimsOf, isAdmin, bodyOf, pathParam, now } from "./lib.mjs";
import { previewUrl } from "./sites.mjs";

// paginated, type-filtered scan, the same read shape admin.mjs uses for the
// Floor's site listing. At demand-test scale (hundreds of rows) a scan is the
// right tradeoff; past ~10k items this caller moves to a type-overloaded GSI.
async function scanSites(ctx, cap = 5000) {
  const items = [];
  let lastKey;
  do {
    const r = await ctx.ddb.scan({
      FilterExpression: "#t = :t",
      ExpressionAttributeNames: { "#t": "type" },
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

// the public card: exactly what a stranger may see, nothing more. A poster is
// surfaced only if the record actually carries one; there is no owner, no email,
// no order id, no internal counter in this object.
const card = (s, ctx) => {
  const out = {
    slug: s.slug,
    title: s.title || s.slug,
    url: previewUrl(ctx, s.slug),
  };
  const poster = s.poster || s.posterUrl || s.thumbnail || null;
  if (poster) out.poster = poster;
  return out;
};

// GET /showcase: PUBLIC, no auth. Returns the opted-in, live films as public
// cards, newest premiere first. Empty is a valid, honest answer.
export async function getShowcase(_event, ctx) {
  const sites = await scanSites(ctx);
  const films = sites
    .filter(isShowcased)
    .sort((a, b) => String(b.publishedAt || b.createdAt || "").localeCompare(String(a.publishedAt || a.createdAt || "")))
    .map((s) => card(s, ctx));
  return ok({ ok: true, count: films.length, films });
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

  await ctx.ddb.update({
    Key: { PK: site.PK, SK: "META" },
    UpdateExpression: "SET showcase = :v, updatedAt = :t",
    ConditionExpression: "attribute_exists(PK)",
    ExpressionAttributeValues: { ":v": b.showcase, ":t": now() },
  });
  return ok({ ok: true, siteId: site.siteId, slug: site.slug, showcase: b.showcase });
}
