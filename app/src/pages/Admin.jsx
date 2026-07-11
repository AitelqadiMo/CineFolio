// Admin v3: the production floor becomes an operations console. Six desks on
// real data: Overview (platform stats + audience), Films (every site on the
// platform, with moderation), Orders (the pipeline kanban), People, Inbox,
// and Controls (the pipeline kill switch). Admin group enforced server-side
// on every route; this page is just the window.
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { SplitTitle, Skeleton, friendly, ConfirmDialog, Dialog } from "../ui.jsx";

const TABS = [
  { k: "overview", label: "Overview" },
  { k: "films", label: "Films" },
  { k: "orders", label: "Orders" },
  { k: "people", label: "People" },
  { k: "inbox", label: "Inbox" },
  { k: "controls", label: "Controls" },
];

const COLS = [
  { k: "queued", label: "Queued" },
  { k: "filming", label: "Filming" },
  { k: "ready", label: "Premiered cuts" },
  { k: "dispatch_failed", label: "Dispatch failed" },
  { k: "human_review", label: "Human review" },
];

const mono9 = { fontFamily: "var(--mono)", fontSize: 9, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--dim)" };
const when = (iso) => (iso ? String(iso).slice(0, 16).replace("T", " ") : "—");

function StatusDot({ status }) {
  const color = status === "live" ? "var(--green)" : status === "taken_down" ? "var(--red-lit)" : "var(--gold)";
  const label = status === "taken_down" ? "dark" : status;
  return (
    <span style={{ ...mono9, color: "var(--navy)", whiteSpace: "nowrap" }}>
      <i aria-hidden="true" style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: color, marginRight: 6 }} />
      {label}
    </span>
  );
}

// 30-day audience bars, no dependencies: the data is the decoration.
function TrafficBars({ daily }) {
  const max = Math.max(1, ...daily.map((d) => d.count));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 84, padding: "10px 2px 0" }}>
      {daily.map((d) => (
        <div key={d.date} title={`${d.date} · ${d.count} view${d.count === 1 ? "" : "s"}`}
          style={{ flex: 1, minWidth: 4, height: `${Math.max(3, Math.round((d.count / max) * 100))}%`,
            background: d.count ? "var(--navy)" : "var(--line)", borderRadius: "2px 2px 0 0" }} />
      ))}
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState({}); // per-tab payloads
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind, site }
  const [inspecting, setInspecting] = useState(null); // { site, report }

  const put = (k, v) => setData((d) => ({ ...d, [k]: v }));

  const load = async (which = tab, force = false) => {
    if (data[which] && !force) return;
    setErr("");
    try {
      if (which === "overview") put("overview", await api.adminStats());
      if (which === "films") put("films", await api.adminSites());
      if (which === "orders") {
        const results = await Promise.all(COLS.map((c) => api.adminOrders(c.k).then((r) => [c.k, r.orders]).catch(() => [c.k, []])));
        put("orders", Object.fromEntries(results));
      }
      if (which === "people") put("people", await api.adminUsers());
      if (which === "inbox") put("inbox", await api.adminContacts());
      if (which === "controls") put("controls", await api.adminPipeline());
    } catch (e) { setErr(friendly(e.message)); }
  };
  useEffect(() => { load(tab); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- film moderation (existing owner-or-admin routes) ---------- */
  const act = async (fn, siteId) => {
    setBusy(siteId); setErr("");
    try { await fn(); await load("films", true); await load("overview", true); }
    catch (e) { setErr(friendly(e.message)); }
    finally { setBusy(null); setConfirm(null); }
  };
  const inspect = async (site) => {
    setBusy(site.siteId); setErr("");
    try { setInspecting({ site, report: await api.inspect(site.siteId) }); }
    catch (e) { setErr(friendly(e.message)); }
    finally { setBusy(null); }
  };

  const retry = async (orderId) => {
    setBusy(orderId); setErr("");
    try { await api.adminRetry(orderId); await load("orders", true); }
    catch (e) { setErr(friendly(e.message)); } finally { setBusy(null); }
  };

  const flipBreaker = async (enabled) => {
    setBusy("breaker"); setErr("");
    try { await api.adminPipelineSet(enabled); put("controls", await api.adminPipeline()); }
    catch (e) { setErr(friendly(e.message)); }
    finally { setBusy(null); setConfirm(null); }
  };

  const ov = data.overview;
  const films = data.films;
  const board = data.orders;
  const people = data.people;
  const inbox = data.inbox;
  const breaker = data.controls;
  const attention = ov ? (ov.orders.human_review || 0) + (ov.orders.dispatch_failed || 0) : 0;

  return (
    <>
      <div className="pagehead" data-scene="SCENE 03 · THE FLOOR">
        <SplitTitle text="Production" serif="floor" />
        <p className="sub">The whole studio on one desk: real platform data, every film, every order, and the master switch.</p>
      </div>

      {/* desk switcher */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--line-2)", marginBottom: 26, overflowX: "auto" }}>
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={{ ...mono9, color: tab === t.k ? "var(--navy)" : "var(--dim)", background: "none", border: 0, cursor: "pointer",
              padding: "10px 14px", borderBottom: tab === t.k ? "2px solid var(--gold-g)" : "2px solid transparent", marginBottom: -1 }}>
            {t.label}
            {t.k === "orders" && attention > 0 && <b style={{ color: "var(--red-lit)", marginLeft: 6 }}>{attention}</b>}
          </button>
        ))}
        <button onClick={() => load(tab, true)} title="Refresh this desk"
          style={{ ...mono9, marginLeft: "auto", background: "none", border: 0, cursor: "pointer", padding: "10px 14px", color: "var(--dim)" }}>
          ↻ Refresh
        </button>
      </div>

      {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}

      {/* ================= OVERVIEW ================= */}
      {tab === "overview" && (!ov ? <><Skeleton h={96} style={{ marginBottom: 14 }} /><Skeleton h={180} /></> : (
        <>
          <div className="metrics">
            <div className="metric"><b>{ov.users.total}</b><span>Studio accounts</span></div>
            <div className="metric"><b>{ov.films.live}<i style={{ fontStyle: "normal", color: "var(--faint)", fontSize: "60%" }}> / {ov.films.total}</i></b><span>Films live / total</span></div>
            <div className="metric"><b>{ov.traffic.views30}</b><span>Audience · 30 days</span></div>
          </div>
          <div className="metrics">
            <div className="metric"><b>{ov.orders.queued + ov.orders.filming}</b><span>Orders in motion</span></div>
            <div className="metric"><b style={{ color: attention ? "var(--red-lit)" : undefined }}>{attention}</b><span>Need attention</span></div>
            <div className="metric"><b>{ov.users.cutsSpent}</b><span>AI cuts spent</span></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 22, alignItems: "start" }}>
            <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", padding: "16px 18px" }}>
              <div style={mono9}>The audience · last 30 days</div>
              <TrafficBars daily={ov.traffic.daily} />
            </div>
            <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", padding: "16px 18px" }}>
              <div style={{ ...mono9, marginBottom: 10 }}>Top screens</div>
              {ov.traffic.top.length === 0 && <div style={{ ...mono9, padding: "8px 0" }}>No views yet</div>}
              {ov.traffic.top.map((p) => (
                <div key={p.page} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: "1px solid var(--line)", fontFamily: "var(--mono)", fontSize: 11 }}>
                  <span style={{ color: "var(--navy)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.page}</span>
                  <b style={{ color: "var(--gold)", paddingLeft: 10 }}>{p.count}</b>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, ...mono9 }}>
                <span>Waitlist {ov.waitlist}</span><span>Notes {ov.notes}</span>
              </div>
            </div>
          </div>
        </>
      ))}

      {/* ================= FILMS ================= */}
      {tab === "films" && (!films ? <Skeleton h={300} /> : (
        <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", overflow: "hidden" }}>
          <div style={{ ...mono9, padding: "12px 18px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
            <span>Every film on the platform</span><b style={{ color: "var(--navy)" }}>{films.total}</b>
          </div>
          {films.sites.length === 0 && <div style={{ ...mono9, padding: 22 }}>No films yet</div>}
          {films.sites.map((s) => (
            <div key={s.siteId} style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", alignItems: "center", padding: "13px 18px", borderTop: "1px solid var(--line)" }}>
              <div style={{ flex: "1 1 230px", minWidth: 0 }}>
                <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 15, color: "var(--navy)" }}>{s.title || s.slug}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.slug} · {s.ownerEmail || s.owner || "unknown owner"}{s.orderId ? " · AI cut" : ""}{s.audienceOf ? " · audience version" : ""}
                </div>
              </div>
              <StatusDot status={s.status} />
              <span style={{ ...mono9, color: "var(--navy)" }}>R{s.releases}{s.liveRelease ? ` · live ${s.liveRelease}` : ""}{s.stagedRelease ? ` · staged ${s.stagedRelease}` : ""}</span>
              <span style={mono9}>{when(s.publishedAt || s.createdAt)}</span>
              <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                {s.status === "live" && <a className="btn ghost" style={{ padding: "5px 10px", fontSize: 9 }} href={s.url} target="_blank" rel="noopener noreferrer">Watch</a>}
                <button className="btn ghost" style={{ padding: "5px 10px", fontSize: 9 }} disabled={busy === s.siteId} onClick={() => inspect(s)}>Inspect</button>
                {s.status === "live" && (
                  <button className="btn ghost" style={{ padding: "5px 10px", fontSize: 9, color: "var(--red-lit)" }} onClick={() => setConfirm({ kind: "takedown", site: s })}>Take down</button>
                )}
                {s.status === "taken_down" && (<>
                  <button className="btn ghost" style={{ padding: "5px 10px", fontSize: 9 }} disabled={busy === s.siteId} onClick={() => act(() => api.rollback(s.siteId), s.siteId)}>Relight</button>
                  <button className="btn danger" style={{ padding: "5px 10px", fontSize: 9 }} onClick={() => setConfirm({ kind: "delete", site: s })}>Delete</button>
                </>)}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* ================= ORDERS (the original kanban) ================= */}
      {tab === "orders" && (!board ? <div className="kanban"><Skeleton h={160} /><Skeleton h={160} /><Skeleton h={160} /><Skeleton h={160} /><Skeleton h={160} /></div> : (
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
      ))}

      {/* ================= PEOPLE ================= */}
      {tab === "people" && (!people ? <Skeleton h={260} /> : (
        <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", overflow: "hidden" }}>
          <div style={{ ...mono9, padding: "12px 18px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
            <span>Everyone in the studio</span><b style={{ color: "var(--navy)" }}>{people.total}</b>
          </div>
          {people.users.map((u) => (
            <div key={u.sub} style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", alignItems: "baseline", padding: "12px 18px", borderTop: "1px solid var(--line)" }}>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--navy)" }}>{u.email || u.sub}</span>
                {u.name && <span style={{ ...mono9, marginLeft: 10 }}>{u.name}</span>}
              </div>
              <span style={{ ...mono9, color: u.plan === "free" ? "var(--dim)" : "var(--gold)" }}>{u.plan}</span>
              <span style={{ ...mono9, color: u.aiCuts >= 3 ? "var(--red-lit)" : "var(--navy)" }}>cuts {u.aiCuts}/3</span>
              <span style={mono9}>joined {when(u.createdAt)}</span>
            </div>
          ))}
        </div>
      ))}

      {/* ================= INBOX ================= */}
      {tab === "inbox" && (!inbox ? <Skeleton h={220} /> : (
        <div style={{ display: "grid", gap: 14 }}>
          {inbox.notes.length === 0 && <div style={{ ...mono9, padding: 10 }}>The inbox is quiet.</div>}
          {inbox.notes.map((n) => (
            <div key={n.id} style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--navy)" }}><b>{n.name || "Visitor"}</b> · {n.email}</span>
                <span style={mono9}>{when(n.at)}</span>
              </div>
              <p style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6, color: "var(--navy)", borderLeft: "3px solid var(--red)", paddingLeft: 12, margin: "0 0 12px" }}>{n.message}</p>
              <a className="btn ghost" style={{ padding: "6px 12px", fontSize: 9 }} href={`mailto:${n.email}?subject=${encodeURIComponent("Re: your note to CineFolio Studios")}`}>Reply</a>
            </div>
          ))}
        </div>
      ))}

      {/* ================= CONTROLS ================= */}
      {tab === "controls" && (!breaker ? <Skeleton h={160} /> : (
        <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", padding: "22px 24px", maxWidth: 560 }}>
          <div style={{ ...mono9, marginBottom: 14 }}>Order pipeline · circuit breaker</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <i aria-hidden="true" style={{ width: 12, height: 12, borderRadius: "50%", background: breaker.enabled ? "var(--green)" : "var(--red-lit)", boxShadow: breaker.enabled ? "0 0 10px rgba(14,158,98,.5)" : "0 0 10px rgba(176,14,40,.5)" }} />
            <b style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 22, color: "var(--navy)", textTransform: "uppercase" }}>
              {breaker.enabled ? "Cameras rolling" : "Cut. Floor stopped"}
            </b>
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--dim)", marginBottom: 16 }}>
            {breaker.enabled
              ? "New orders dispatch to the AI director normally. Stopping the floor makes the pipeline's Validate step refuse every dispatch: queued orders drain to human review instead of filming, nothing is lost."
              : "The breaker is open: nothing dispatches. Orders keep queuing and drain to human review. Roll the cameras to resume, then retry stuck orders from the Orders desk."}
          </p>
          <button className={`btn ${breaker.enabled ? "danger" : "primary"}`} disabled={busy === "breaker"}
            onClick={() => (breaker.enabled ? setConfirm({ kind: "cut" }) : flipBreaker(true))}>
            {busy === "breaker" ? <span className="spin" /> : null}
            {breaker.enabled ? "Cut: stop the floor" : "Roll cameras: resume the floor"}
          </button>
          <p style={{ ...mono9, marginTop: 14 }}>New workers obey immediately · warm workers as they recycle</p>
        </div>
      ))}

      {/* ---------- confirmations ---------- */}
      <ConfirmDialog
        open={confirm?.kind === "takedown"}
        kicker="Moderation" title={`Take down ${confirm?.site?.slug}?`}
        body={`The film goes dark everywhere a viewer could reach it. Releases stay archived; the owner (${confirm?.site?.ownerEmail || "unknown"}) can relight or you can, from here.`}
        confirmLabel="Take it down" danger busy={busy === confirm?.site?.siteId}
        onConfirm={() => act(() => api.takedown(confirm.site.siteId), confirm.site.siteId)}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === "delete"}
        kicker="Moderation" title={`Delete ${confirm?.site?.slug} forever?`}
        body="Every release, row, and the slug claim burns. This is the real delete; there is no relight after this."
        confirmLabel="Delete forever" danger busy={busy === confirm?.site?.siteId}
        onConfirm={() => act(() => api.deleteSite(confirm.site.siteId), confirm.site.siteId)}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === "cut"}
        kicker="Master switch" title="Stop the production floor?"
        body="Every new dispatch is refused until you roll again. Orders keep queuing and drain to human review; clients are emailed the honest delay note by the pipeline."
        confirmLabel="Cut" danger busy={busy === "breaker"}
        onConfirm={() => flipBreaker(false)}
        onClose={() => setConfirm(null)}
      />

      {/* ---------- release inspector ---------- */}
      <Dialog open={!!inspecting} title={`Release truth · ${inspecting?.site?.slug || ""}`} kicker="Inspector" onClose={() => setInspecting(null)} width={560}>
        {inspecting?.report?.releases?.map((r) => (
          <div key={r.n} style={{ borderTop: "1px solid var(--line)", padding: "10px 0", fontFamily: "var(--mono)", fontSize: 11 }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--navy)" }}>
              <b>Release {r.n}{inspecting.report.liveRelease === r.n ? " · LIVE" : ""}</b>
              <span style={{ color: "var(--dim)" }}>{r.source || "direct"}</span>
            </div>
            {r.listError
              ? <div style={{ color: "var(--red-lit)", marginTop: 4 }}>{r.listError}</div>
              : <div style={{ color: "var(--dim)", marginTop: 4 }}>
                  manifest {r.manifest.length} · in S3 {r.inS3?.length ?? "?"}
                  {r.missing?.length > 0 && <span style={{ color: "var(--red-lit)" }}> · missing {r.missing.join(", ")}</span>}
                  {r.extra?.length > 0 && <span style={{ color: "var(--gold)" }}> · extra {r.extra.length}</span>}
                </div>}
          </div>
        ))}
        {inspecting?.report?.orderAssets && (
          <div style={{ ...mono9, marginTop: 10 }}>
            Born from order {String(inspecting.report.orderAssets.orderId).slice(0, 8)} · {inspecting.report.orderAssets.uploadedAssets.length} uploaded assets
          </div>
        )}
      </Dialog>
    </>
  );
}
