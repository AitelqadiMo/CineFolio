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
import { ok } from "./lib.mjs";
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
