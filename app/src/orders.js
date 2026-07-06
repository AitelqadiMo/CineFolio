// orders.js: the buyer's order ledger. A paid order must always have a home
// that outlives the tab. Server truth is merged in when the /orders route is
// wired; until then a persistent localStorage ledger carries the record
// (replacing the old cf.activeOrder chip that erased itself after 2 minutes).
import { api, notWired } from "./api.js";

const KEY = "cf.orderLedger";

const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
};
const write = (list) => {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50))); } catch { /* storage full */ }
};

export const ledger = {
  list: () => read().sort((a, b) => (b.at || "").localeCompare(a.at || "")),

  record(order) {
    const list = read().filter((o) => o.orderId !== order.orderId);
    list.push({ acknowledged: false, revisionRequested: false, at: new Date().toISOString(), ...order });
    write(list);
  },

  patch(orderId, patch) {
    write(read().map((o) => (o.orderId === orderId ? { ...o, ...patch } : o)));
  },

  setStatus(orderId, status, extra = {}) {
    this.patch(orderId, { status, ...extra });
  },

  acknowledge(orderId) {
    this.patch(orderId, { acknowledged: true });
    // the shell chip keys off cf.activeOrder; delivery acknowledged closes it
    try {
      const active = JSON.parse(localStorage.getItem("cf.activeOrder") || "null");
      if (active?.orderId === orderId) localStorage.removeItem("cf.activeOrder");
    } catch { /* noop */ }
  },

  // entitlement truth: any production order on record makes this a paying client
  isClient: (list) => (list || read()).some((o) => o.production && o.status !== "preview_only"),

  unseenDelivery: (list) => (list || read()).find((o) => o.status === "ready" && !o.acknowledged),

  // merge server truth over the local ledger once the backend route exists
  async sync() {
    let wired = false;
    try {
      const r = await api.myOrders();
      wired = true;
      const server = r.orders || [];
      const local = read();
      const byId = Object.fromEntries(local.map((o) => [o.orderId, o]));
      for (const s of server) {
        byId[s.orderId] = { ...byId[s.orderId], ...s, production: true };
      }
      write(Object.values(byId));
    } catch (e) {
      if (!notWired(e)) throw e;
    }
    return { orders: this.list(), wired };
  },
};
