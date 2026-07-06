// api.js: typed-ish client for the CineFolio API. Authenticated calls attach the
// Cognito ID token (the authorizer validates aud = clientId on ID tokens).
import { CONFIG } from "./config.js";
import { idToken } from "./cognito.js";

async function req(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "content-type": "application/json" };
  if (auth) {
    const t = await idToken();
    if (!t) { const e = new Error("Session expired. Sign in again."); e.code = "NO_SESSION"; throw e; }
    headers.authorization = `Bearer ${t}`;
  }
  const r = await fetch(`${CONFIG.apiBase}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const isJson = (r.headers.get("content-type") || "").includes("json");
  const data = isJson ? await r.json().catch(() => ({})) : await r.text();
  if (!r.ok) {
    const e = new Error(isJson ? data.error || `Request failed (${r.status})` : `Request failed (${r.status})`);
    e.status = r.status;
    throw e;
  }
  return data;
}

export const api = {
  health: () => req("/health"),
  me: () => req("/me", { auth: true }),
  updateMe: (patch) => req("/me", { method: "PUT", body: patch, auth: true }),

  generate: (order) => req("/studio/generate", { method: "POST", body: order }),
  orderStatus: (orderId) => req(`/studio/status?orderId=${encodeURIComponent(orderId)}`),
  orderCut: (orderId) => req(`/studio/cut?orderId=${encodeURIComponent(orderId)}`), // returns HTML string

  sites: () => req("/sites", { auth: true }),
  site: (id) => req(`/sites/${id}`, { auth: true }),
  source: (id, release) => req(`/sites/${id}/source${release ? `?release=${release}` : ""}`, { auth: true }), // returns HTML string
  createSite: (body) => req("/sites", { method: "POST", body, auth: true }),
  publish: (id, body) => req(`/sites/${id}/publish`, { method: "POST", body, auth: true }),
  rollback: (id, to) => req(`/sites/${id}/rollback`, { method: "POST", body: to ? { to } : {}, auth: true }),
  takedown: (id) => req(`/sites/${id}`, { method: "DELETE", auth: true }),
  deleteSite: (id) => req(`/sites/${id}/delete`, { method: "POST", auth: true }),

  media: (contentType) => req("/media", { method: "POST", body: { contentType }, auth: true }),
  getDraft: () => req("/draft", { auth: true }),
  putDraft: (draft) => req("/draft", { method: "PUT", body: { draft }, auth: true }),
  getProfile: () => req("/profile", { auth: true }),
  putProfile: (profile) => req("/profile", { method: "PUT", body: { profile }, auth: true }),
  duplicate: (id, body) => req(`/sites/${id}/duplicate`, { method: "POST", body, auth: true }),

  adminOrders: (status) => req(`/admin/orders?status=${encodeURIComponent(status)}`, { auth: true }),
  adminRetry: (orderId) => req(`/admin/orders/${orderId}/retry`, { method: "POST", auth: true }),

  // ---------- buyer-facing surfaces (UI-first) ----------
  // These routes are the contract the console expects; some are not wired in the
  // gateway yet. Callers must treat notWired errors as "backend pending" and fall
  // back gracefully (local ledger, contact fallback, hidden widget). Never a dead end.
  myOrders: () => req("/orders", { auth: true }),
  requestRevision: (orderId, body) => req(`/orders/${encodeURIComponent(orderId)}/revision`, { method: "POST", body, auth: true }),
  contact: (body) => req("/contact", { method: "POST", body }),
  siteStats: (id) => req(`/sites/${id}/stats`, { auth: true }),
  connectDomain: (id, domain) => req(`/sites/${id}/domain`, { method: "POST", body: { domain }, auth: true }),
};

// True when an endpoint is missing or not deployed yet (route absent from the
// HTTP API returns 404, JWT-scoped stages can answer 401/403 for unknown paths).
export const notWired = (e) => [401, 403, 404, 405, 501].includes(e?.status);
