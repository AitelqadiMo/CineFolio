// api.js — typed-ish client for the CineFolio API. Authenticated calls attach the
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

  adminOrders: (status) => req(`/admin/orders?status=${encodeURIComponent(status)}`, { auth: true }),
  adminRetry: (orderId) => req(`/admin/orders/${orderId}/retry`, { method: "POST", auth: true }),
};
