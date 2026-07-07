// lib.mjs — pure helpers: http responses, auth, validation. Zero AWS imports (testable).
import { timingSafeEqual, randomUUID } from "node:crypto";

export const json = (statusCode, body, extra = {}) => ({
  statusCode,
  headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  body: JSON.stringify(body),
});
export const ok = (body) => json(200, body);
export const bad = (msg, code = 400) => json(code, { ok: false, error: msg });

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
