// funnel.js: one tiny helper the whole app shares to fire funnel steps.
// track(step) posts to POST /funnel and is deliberately fire-and-forget: it
// never throws and never blocks a render or a click, exactly like the existing
// /hit beacon in marketing/effects.js. A page can call it in the same tick it
// navigates and nothing waits on it.
import { CONFIG } from "./config.js";

// The anonymous session id exists only so the CLIENT can reason about a single
// visit (e.g. fire-once-per-session logic a caller may add later). It lives in
// sessionStorage, is a random value with zero PII, and is NEVER a cookie and
// NEVER sent cross-site. The server does not persist it (it only counts steps)
// so this is genuinely anonymous and there is nothing to correlate to a person.
function sessionId() {
  try {
    const KEY = "cf_fnl_sid";
    let sid = sessionStorage.getItem(KEY);
    if (!sid) {
      // crypto.randomUUID where available; a cheap random string is a fine
      // fallback since the id is opaque and never leaves this browser session.
      sid = (globalThis.crypto?.randomUUID?.() ||
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
      sessionStorage.setItem(KEY, sid);
    }
    return sid;
  } catch {
    // private mode / storage disabled: skip the id entirely, still track the step.
    return null;
  }
}

// The canonical step names. Kept here as well as on the server so callers import
// a constant instead of hand-typing a string that could drift out of the
// server's allowlist (a drifted name is silently dropped server-side).
export const STEP = {
  landingView: "landing_view",
  signupStart: "signup_start",
  signupComplete: "signup_complete",
  profileUploaded: "profile_uploaded",
  filmGenerated: "film_generated",
  filmPublished: "film_published",
  pricingView: "pricing_view",
  checkoutClick: "checkout_click",
  purchase: "purchase",
};

// track(step): post the step, swallow everything. Returns nothing useful on
// purpose so no caller is tempted to await it in a way that could block.
export function track(step) {
  try {
    const sid = sessionId();
    fetch(`${CONFIG.apiBase}/funnel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sid ? { step, sid } : { step }),
      keepalive: true, // let the beacon survive a page transition fired on unload
    }).catch(() => {});
  } catch {
    /* noop: analytics can never break the app */
  }
}
