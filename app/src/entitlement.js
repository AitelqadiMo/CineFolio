// entitlement.js — ONE truth for the studio pass across the whole console.
// The server computes the snapshot (lib.mjs entitlementOf) and every response
// that matters carries it: /me, order 200s, order 402s. This store is the only
// client-side copy; Home, Studio, and Account all subscribe here, so a credit
// landing on one surface updates every surface. No page keeps its own version.
import { useEffect, useState } from "react";
import { api } from "./api.js";

let current = null;
const subs = new Set();

export function entNow() { return current; }

export function setEnt(next) {
  if (!next || typeof next.freeCutsLeft !== "number") return; // only accept full server snapshots
  current = { ...next };
  subs.forEach((fn) => fn(current));
}

export function useEntitlement() {
  const [ent, set] = useState(current);
  useEffect(() => { subs.add(set); set(current); return () => subs.delete(set); }, []);
  return ent;
}

// re-read /me; safe to call from anywhere, silent when signed out or offline
export async function refreshEnt() {
  try {
    const r = await api.me();
    if (r?.user) {
      const next = {
        plan: r.user.plan || "free",
        aiCuts: r.user.aiCuts || 0,
        freeCutsLeft: r.user.freeCutsLeft ?? 0,
        freeCutsLimit: r.user.freeCutsLimit || 3,
        paidCredits: r.user.paidCredits || 0,
        publishSlots: r.user.publishSlots || 1,
      };
      // founding-member pricing: forward the server's honest figures when they
      // ride the snapshot. Only pass through real numbers, so the UI never
      // invents a seat count or a price the server did not send.
      if (typeof r.user.foundingSeatsLeft === "number") next.foundingSeatsLeft = r.user.foundingSeatsLeft;
      if (typeof r.user.foundingPrice === "number") next.foundingPrice = r.user.foundingPrice;
      setEnt(next);
    }
  } catch { /* the store keeps its last truth */ }
  return current;
}

// after the buyer heads to Creem checkout: watch /me until the webhook lands
// the credits, then every subscribed surface updates itself. Self-stopping.
// The watcher used to time out SILENTLY after 3 minutes: a buyer whose webhook
// was slow stared at an unchanged page with no signal either way. Callers can
// now pass onLanded / onTimeout so the surface can say something honest when
// the window closes without a credit (the money is safe with the provider; the
// webhook can lag; the operator can grant manually if it truly got stuck).
let watcher = null;
export function watchForCredits({ intervalMs = 5000, timeoutMs = 180000, onLanded, onTimeout } = {}) {
  const before = current?.paidCredits || 0;
  if (watcher) clearInterval(watcher);
  const started = Date.now();
  watcher = setInterval(async () => {
    const e = await refreshEnt();
    if ((e?.paidCredits || 0) > before) {
      clearInterval(watcher);
      watcher = null;
      if (onLanded) try { onLanded(e); } catch { /* caller's problem, never the watcher's */ }
      return;
    }
    if (Date.now() - started > timeoutMs) {
      clearInterval(watcher);
      watcher = null;
      if (onTimeout) try { onTimeout(); } catch { /* noop */ }
    }
  }, intervalMs);
}
