// Admin v2: the production floor. Every order on a kanban of pipeline states,
// with retry actions and headline counts. Data storytelling, not raw rows.
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { SplitTitle, Skeleton, friendly } from "../ui.jsx";

const COLS = [
  { k: "queued", label: "Queued" },
  { k: "filming", label: "Filming" },
  { k: "ready", label: "Premiered cuts" },
  { k: "dispatch_failed", label: "Dispatch failed" },
  { k: "human_review", label: "Human review" },
];

export default function Admin() {
  const [board, setBoard] = useState(null); // { status: orders[] }
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(null);

  const load = async () => {
    setErr("");
    try {
      const results = await Promise.all(COLS.map((c) => api.adminOrders(c.k).then((r) => [c.k, r.orders]).catch(() => [c.k, []])));
      setBoard(Object.fromEntries(results));
    } catch (e) { setErr(friendly(e.message)); }
  };
  useEffect(() => { load(); }, []);

  const retry = async (orderId) => {
    setBusy(orderId); setErr("");
    try { await api.adminRetry(orderId); await load(); }
    catch (e) { setErr(friendly(e.message)); } finally { setBusy(null); }
  };

  const total = board ? Object.values(board).reduce((a, v) => a + v.length, 0) : 0;
  const stuck = board ? (board.dispatch_failed?.length || 0) + (board.human_review?.length || 0) : 0;

  return (
    <>
      <div className="pagehead" data-scene="SCENE 03 · THE FLOOR">
        <SplitTitle text="Production" serif="floor" />
        <p className="sub">Live pipeline state from the status index. Retry re-enqueues an order through the full state machine.</p>
      </div>

      <div className="metrics">
        <div className="metric"><b>{board ? total : "···"}</b><span>Orders on the floor</span></div>
        <div className="metric"><b>{board ? board.filming?.length || 0 : "···"}</b><span>Cameras rolling</span></div>
        <div className="metric"><b style={{ color: stuck ? "var(--red-lit)" : undefined }}>{board ? stuck : "···"}</b><span>Need attention</span></div>
      </div>

      {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}
      {board === null && <div className="kanban"><Skeleton h={160} /><Skeleton h={160} /><Skeleton h={160} /><Skeleton h={160} /><Skeleton h={160} /></div>}

      {board && (
        <div className="kanban">
          {COLS.map((c) => (
            <div key={c.k} className="kcol">
              <h4>{c.label} <b>{board[c.k]?.length || 0}</b></h4>
              {(board[c.k] || []).map((o) => (
                <div key={o.orderId} className="kcard">
                  <div className="who">{o.name || o.email}</div>
                  <div className="meta2">{o.orderId.slice(0, 8)} · {o.role} · {(o.createdAt || "").slice(5, 16).replace("T", " ")}</div>
                  {["queued", "filming", "dispatch_failed", "human_review"].includes(o.status) && (
                    <div className="acts">
                      <button className="btn ghost" style={{ padding: "5px 10px", fontSize: 9 }} disabled={busy === o.orderId} onClick={() => retry(o.orderId)}>
                        {busy === o.orderId ? "…" : "Retry"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {(board[c.k] || []).length === 0 && <div className="mono" style={{ padding: 14, fontSize: 8.5 }}>CLEAR</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
