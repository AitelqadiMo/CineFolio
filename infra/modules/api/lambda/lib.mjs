// lib.mjs — pure helpers: http responses, auth, validation. Zero AWS imports (testable).
import { timingSafeEqual, randomUUID } from "node:crypto";

export const json = (statusCode, body, extra = {}) => ({
  statusCode,
  headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  body: JSON.stringify(body),
});
// ok() defaults to no-store like every other response. A route that is PUBLIC
// and safe to cache at the edge (no auth, no per-user data) may pass extra
// headers, e.g. ok(body, publicCacheHeaders(60)), which overrides the default
// cache-control for that one response without touching the default for any other.
export const ok = (body, extra = {}) => json(200, body, extra);
export const bad = (msg, code = 400) => json(code, { ok: false, error: msg });

// a short, shared public-cache header for edge-cacheable, unauthenticated
// responses. max-age lets the browser hold it; s-maxage lets CloudFront hold and
// coalesce it, so a burst of anonymous requests collapses to one origin read.
// Keep the window short: the payload changes when an owner flips consent or a
// film goes live/dark, and a short TTL bounds how stale the public wall can be.
export const publicCacheHeaders = (seconds = 60) => ({
  "cache-control": `public, max-age=${seconds}, s-maxage=${seconds}`,
});

export const uuid = () => randomUUID();
export const now = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);

// Constant-time secret comparison (avoids timing side-channel on callback auth)
export function safeEqual(a, b) {
  const A = Buffer.from(String(a || ""));
  const B = Buffer.from(String(b || ""));
  return A.length === B.length && timingSafeEqual(A, B);
}

export const isEmail = (e) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;
export const clampStr = (s, n) => String(s ?? "").slice(0, n);

// ---- pricing v4 (single source of truth; keep the landing + terms copy in lockstep) ----
// v4 retires the Coach's Slate and opens a founding window: the first
// FOUNDING_SEATS buyers of the Director's Cut pay FOUNDING_PRICE, everyone
// after pays CUT_PRICE. The tier does not change (same DC_CREDITS, same
// entitlement); only the price the buyer sees while seats remain.
export const CUT_PRICE = 99;        // The Director's Cut: one-time, mints DC_CREDITS productions (post-founding price)
export const FOUNDING_PRICE = 49;   // founding price for the first FOUNDING_SEATS Director's Cut buyers
export const FOUNDING_SEATS = 20;   // how many founding seats exist before the price returns to CUT_PRICE
export const DC_CREDITS = 3;        // production credits per Director's Cut purchase
export const NEW_FREE_CUTS = 1;     // free AI films for accounts created from pricing v3 on
export const LEGACY_FREE_CUTS = 3;  // earlier accounts keep the three they were promised

// the limited engagement: a free-plan account's AI-born premiere screens for
// this many hours, then returns to the vault (preserved, address held) until
// a plan unlock revives it. The Set's manual films and paid plans have no clock.
export const TRIAL_HOURS = 72;

// premiere slots: how many films a plan screens LIVE at once. Free accounts
// track their free-film era (1 from pricing v3, 3 for legacy profiles) and the
// flagship unlocks three. "coach" is a LEGACY plan (the retired Coach's Slate,
// unsellable in pricing v4): its ten-slot grant is kept only so a grandfathered
// coach never loses the slots they already hold. No new account can reach it.
export const PUBLISH_SLOTS = { director: 3, coach: 10 };
export function publishSlots(profile) {
  if (profile?.plan === "coach") return PUBLISH_SLOTS.coach; // legacy grandfather only
  if (profile?.plan === "director") return PUBLISH_SLOTS.director;
  return profile?.freeCutsLimit ?? LEGACY_FREE_CUTS;
}

// founding seats remaining, given the running count of founding purchases made
// so far. Kept pure and defensive: a non-finite or negative count is untrusted
// input, so we clamp to the [0, FOUNDING_SEATS] range rather than surface a lie.
export function foundingSeatsLeftFrom(foundingSoldCount) {
  const sold = Number(foundingSoldCount);
  if (!Number.isFinite(sold)) return null;
  return Math.max(0, FOUNDING_SEATS - Math.max(0, Math.floor(sold)));
}

// ONE authoritative entitlement snapshot. /me, order responses (200 and 402
// alike), and the console's shared store all speak exactly this shape; no
// surface computes its own version of the truth.
//
// foundingSeatsLeft/foundingPrice are honest by construction. The seat count is
// a GLOBAL fact (how many founding buyers have paid), which this pure snapshot
// cannot read on its own without an AWS import. So a caller that already holds
// the running count (the webhook keeps a real COUNTER/FOUNDING row, an O(1)
// GetItem) passes it in as foundingSeatsLeft and we surface the true number;
// a caller that does not know it passes nothing and we return null. Never a
// fabricated number; the console shows no seat counter rather than a fake one.
export function entitlementOf(i = {}, foundingSeatsLeft = null) {
  const limit = i.freeCutsLimit ?? LEGACY_FREE_CUTS;
  // null seats-left means "unknown here" -> hold the founding price open, since
  // the window is open far more often than not; the checkout handler, which
  // does read the counter, is the authority that actually charges the right price.
  const seatsLeft = Number.isFinite(foundingSeatsLeft) ? foundingSeatsLeft : null;
  const foundingOpen = seatsLeft === null ? true : seatsLeft > 0;
  return {
    plan: i.plan || "free",
    aiCuts: i.aiCuts || 0,
    freeCutsLeft: Math.max(0, limit - (i.aiCuts || 0)),
    freeCutsLimit: limit,
    paidCredits: i.paidCredits || 0,
    publishSlots: publishSlots(i),
    foundingSeatsLeft: seatsLeft,
    foundingPrice: foundingOpen ? FOUNDING_PRICE : CUT_PRICE,
  };
}

// ---- auth ----
// HTTP API JWT authorizer puts claims at requestContext.authorizer.jwt.claims
export function claimsOf(event) {
  return event?.requestContext?.authorizer?.jwt?.claims || null;
}
// cognito:groups arrives as an array OR a "[admin client]" string depending on path
export function groupsOf(claims) {
  const g = claims?.["cognito:groups"];
  if (Array.isArray(g)) return g;
  if (typeof g === "string") return g.replace(/^\[|\]$/g, "").split(/[,\s]+/).filter(Boolean);
  return [];
}
export const isAdmin = (claims) => groupsOf(claims).includes("admin");

export function routeKeyOf(event) {
  return event?.requestContext?.routeKey || `${event?.requestContext?.http?.method} ${event?.rawPath}`;
}
export function bodyOf(event) {
  if (!event?.body) return {};
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
    return JSON.parse(raw);
  } catch {
    return null; // caller returns 400
  }
}
export const qs = (event, k) => event?.queryStringParameters?.[k];
export const pathParam = (event, k) => event?.pathParameters?.[k];

// ---- release bundles: [{ path, html }] validation shared by publish + callback
// A release bundle carries pages AND assets now:
//   pages:  { path: "index.html", html: "<!doctype html..." }
//   assets: { path: "assets/hero.jpg", content: "<base64>", contentType: "image/jpeg" }
// Small images/fonts ride the bundle; anything heavy (video) stays an external URL.
const BUNDLE_PATH_RE = /^(?:[a-z0-9_-]+\/){0,3}[a-z0-9_-]+\.[a-z0-9]{2,5}$/;
export const isPagePath = (p) => /\.html$/.test(String(p || ""));
export const ASSET_TYPES = {
  css: "text/css", js: "text/javascript", svg: "image/svg+xml", json: "application/json",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", ico: "image/x-icon",
  woff: "font/woff", woff2: "font/woff2", mp4: "video/mp4", webm: "video/webm",
  pdf: "application/pdf",
};
export const BUNDLE_ASSET_PATH_RE = /^(?:[a-z0-9_-]+\/){0,3}[a-z0-9_-]+\.[a-z0-9]{2,5}$/;
export function assetTypeOf(path) {
  const ext = String(path || "").split(".").pop().toLowerCase();
  return ASSET_TYPES[ext] || null;
}
export function validateBundle(files, { maxFiles = 30, maxTotal = 3 * 1024 * 1024 } = {}) {
  if (!Array.isArray(files) || !files.length) return "html document required";
  if (files.length > maxFiles) return `too many files (${maxFiles} max)`;
  if (!files.some((f) => f?.path === "index.html")) return "bundle must include index.html";
  let total = 0;
  const seen = new Set();
  for (const f of files) {
    if (!BUNDLE_PATH_RE.test(f?.path || "")) return `bad path: ${String(f?.path).slice(0, 60)}`;
    if (seen.has(f.path)) return `duplicate path: ${f.path}`;
    seen.add(f.path);
    if (isPagePath(f.path)) {
      if (typeof f.html !== "string" || !f.html.trimStart().toLowerCase().startsWith("<!doctype html")) return `not an html document: ${f.path}`;
      total += Buffer.byteLength(f.html, "utf8");
    } else {
      if (!assetTypeOf(f.path)) return `unsupported asset type: ${f.path}`;
      if (typeof f.content !== "string" || !f.content) return `asset needs base64 content: ${f.path}`;
      if (!/^[A-Za-z0-9+/=\r\n]+$/.test(f.content)) return `asset content must be base64: ${f.path}`;
      total += Math.floor(f.content.length * 0.75);
    }
  }
  if (total > maxTotal) return "bundle too large";
  return null;
}

// slugify a display name -> DNS-safe site slug candidate
export function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "site";
}
