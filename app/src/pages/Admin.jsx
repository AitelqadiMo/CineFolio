// Admin — the studio operator's order queue (Cognito "admin" group only).
import { useEffect, useState } from "react";
import { api } from "../api.js";

const STATUSES = ["queued", "filming", "ready", "dispatch_failed", "human_review"];

export default function Admin() {
  const [status, setStatus] = useState("queued");
  const [orders, setOrders] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(null);

  const retry = async (orderId) => {
    setBusy(orderId); setErr("");
    try { await api.adminRetry(orderId); setOrders(orders.filter((o) => o.orderId !== orderId)); }
    catch (e) { setErr(e.message); } finally { setBusy(null); }
  };

  useEffect(() => {
    setOrders(null); setErr("");
    api.adminOrders(status).then((r) => setOrders(r.orders)).catch((e) => setErr(e.message));
  }, [status]);

  return (
    <>
      <div className="pagehead">
        <h1>Order <em>queue</em></h1>
        <p className="sub">Production pipeline state, straight from DynamoDB's status index.</p>
      </div>

      <div className="steps">
        {STATUSES.map((s) => (
          <button key={s} className={`step ${status === s ? "on" : ""}`} style={{ cursor: "pointer", background: "none" }} onClick={() => setStatus(s)}>
            {s.replace("_", " ").toUpperCase()}
          </button>
        ))}
      </div>

      {err && <div className="err">{err}</div>}
      {orders === null && !err && <div className="mono"><span className="spin" style={{ marginRight: 10 }} />LOADING…</div>}
      {orders?.length === 0 && <div className="panel mono">NO ORDERS IN "{status.toUpperCase()}"</div>}

      {orders?.length > 0 && (
        <div className="panel" style={{ padding: 0, overflow: "auto" }}>
          <table>
            <thead><tr><th>Order</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.orderId}>
                  <td className="mono" style={{ textTransform: "none", letterSpacing: 0 }}>{o.orderId.slice(0, 8)}</td>
                  <td>{o.name}</td>
                  <td>{o.email}</td>
                  <td>{o.role}</td>
                  <td><span className={`badge ${o.status}`}>{o.status.replace("_", " ")}</span></td>
                  <td className="mono" style={{ textTransform: "none", letterSpacing: 0 }}>{(o.createdAt || "").slice(0, 16).replace("T", " ")}</td>
                  <td style={{ textAlign: "right" }}>
                    {["dispatch_failed", "human_review", "filming", "queued"].includes(o.status) && (
                      <button className="btn ghost" style={{ padding: "6px 11px" }} disabled={busy === o.orderId} onClick={() => retry(o.orderId)}>
                        {busy === o.orderId ? "…" : "Retry"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
