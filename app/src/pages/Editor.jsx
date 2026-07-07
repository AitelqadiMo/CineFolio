// The film workspace: reference anatomy, studio truth. A 48px chrome bar,
// the config panel on the left at the exact reference width, and the film
// screening on a light canvas filling the right half. The left panel is a
// production feed fed by real releases, orders and stats; the composer at
// its foot files a change order into The Set. Preview / Code / More views.
import { useEffect, useMemo, useRef, useState } from "react";
import { api, notWired } from "../api.js";
import { CONFIG } from "../config.js";
import { useAuth } from "../App.jsx";
import { friendly, ConfirmDialog } from "../ui.jsx";
import { ledger } from "../orders.js";

const fmt = (d) => (d ? new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export default function Editor({ siteId }) {
  const { nav } = useAuth();
  const [data, setData] = useState(null);        // { site, releases }
  const [err, setErr] = useState("");
  const [view, setView] = useState("preview");   // preview | code | more
  const [device, setDevice] = useState("desktop");
  const [relSel, setRelSel] = useState("live");  // "live" | release number
  const [relOpen, setRelOpen] = useState(false);
  const [projOpen, setProjOpen] = useState(false);
  const [source, setSource] = useState(null);    // HTML string for code/release view
  const [srcBusy, setSrcBusy] = useState(false);
  const [stats, setStats] = useState(null);
  const [moreTab, setMoreTab] = useState("analytics");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDown, setConfirmDown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const relRef = useRef(null); const projRef = useRef(null);

  const load = () => api.site(siteId)
    .then((r) => { setData(r); setErr(""); })
    .catch((e) => setErr(friendly(e.message)));
  useEffect(() => { load(); }, [siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.siteStats(siteId).then(setStats).catch((e) => { if (notWired(e)) setStats(null); });
  }, [siteId]);

  useEffect(() => {
    const h = (e) => {
      if (relRef.current && !relRef.current.contains(e.target)) setRelOpen(false);
      if (projRef.current && !projRef.current.contains(e.target)) setProjOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // source is needed for the code view, and for previewing a non-live release
  useEffect(() => {
    const wantRelease = relSel !== "live" ? relSel : null;
    if (view !== "code" && !wantRelease) { setSource(null); return; }
    setSrcBusy(true);
    api.source(siteId, wantRelease || undefined)
      .then((r) => setSource(typeof r === "string" ? r : r.html || ""))
      .catch((e) => { setSource(null); setErr(friendly(e.message)); })
      .finally(() => setSrcBusy(false));
  }, [siteId, view, relSel]);

  const site = data?.site;
  const releases = data?.releases || [];
  const orders = useMemo(() => ledger.list().filter((o) => !site || (o.name || "").toLowerCase() === (site.title || "").toLowerCase()), [site]);

  // the production feed: newest first, built only from real events
  const feed = useMemo(() => {
    const f = [];
    releases.forEach((r) => f.push({
      t: r.createdAt || "", dot: site?.liveRelease === r.n ? "green" : "",
      kicker: `RELEASE #${r.n}${site?.liveRelease === r.n ? " · NOW SCREENING" : site?.stagedRelease === r.n ? " · STAGED" : ""}`,
      title: site?.liveRelease === r.n ? "This cut is live." : site?.stagedRelease === r.n ? "Staged and waiting for its premiere." : `Release #${r.n} is in the vault.`,
      body: `Cut ${fmt(r.createdAt)}. ${site?.liveRelease === r.n ? "Rolling back is one click in More · Releases." : "Screen it from the release selector above the canvas."}`,
    }));
    orders.forEach((o) => f.push({
      t: o.at || "", dot: o.status === "ready" ? "green" : ["human_review", "dispatch_failed"].includes(o.status) ? "red" : "",
      kicker: `DIRECTOR'S CUT · ${String(o.status || "").replace("_", " ").toUpperCase()}`,
      title: o.status === "ready" ? "The Director's Cut is delivered." : o.status === "filming" ? "Cameras rolling on your cut." : "Order in the studio pipeline.",
      body: `Order ${String(o.orderId || "").slice(0, 8).toUpperCase()} · track it in All films.`,
    }));
    if (site?.status === "taken_down") f.push({ t: "9999", dot: "red", kicker: "OFF THE MARQUEE", title: "This film is taken down.", body: "Every release is safe. Relight from More · Releases." });
    return f.sort((a, b) => String(b.t).localeCompare(String(a.t)));
  }, [releases, orders, site]);

  const goLiveStaged = () => {
    if (!site?.stagedRelease) return;
    setBusy(true);
    api.rollback(siteId, site.stagedRelease).then(load).catch((e) => setErr(friendly(e.message))).finally(() => setBusy(false));
  };
  const rollback = (n) => {
    setBusy(true);
    api.rollback(siteId, n).then(load).catch((e) => setErr(friendly(e.message))).finally(() => setBusy(false));
  };
  const fileChange = () => {
    try {
      sessionStorage.setItem("cf.editSite", JSON.stringify({ siteId, slug: site?.slug, title: site?.title }));
      if (note.trim()) sessionStorage.setItem("cf.brief", JSON.stringify({ text: note.trim(), tpl: null }));
    } catch { /* noop */ }
    nav("studio");
  };
  const copyLink = () => {
    navigator.clipboard?.writeText(`https://${site?.slug}.cinefolio.site`);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };
  const download = () => {
    if (!source) return;
    const blob = new Blob([source], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${site?.slug || "film"}.html`; a.click();
    URL.revokeObjectURL(a.href);
  };

  const liveUrl = site?.previewUrl;
  const canvasSrcDoc = relSel !== "live" ? source : null;

  return (
    <div className="edshell">
      <div className="edbar">
        <div style={{ position: "relative" }} ref={projRef}>
          <button className="edproj" onClick={() => setProjOpen(!projOpen)} aria-haspopup="menu" aria-expanded={projOpen}>
            <span className="lens" aria-hidden="true" /><span>{site?.title || "…"}</span><span className="chev">▾</span>
          </button>
          {projOpen && (
            <div className="bkmenu" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0 }} role="menu">
              <button onClick={() => nav("")}><span className="mi">←</span>Go to Dashboard</button>
              <button onClick={() => nav("films")}><span className="mi">▦</span>All films</button>
              <div className="msep" />
              <button onClick={fileChange}><span className="mi">◉</span>Edit in The Set</button>
              <button onClick={() => { setProjOpen(false); setView("more"); setMoreTab("releases"); }}><span className="mi">≡</span>Releases</button>
              <button onClick={() => { setProjOpen(false); setView("more"); setMoreTab("settings"); }}><span className="mi">⚙</span>Film settings</button>
              <div className="msep" />
              <button onClick={() => nav("settings")}><span className="mi">✦</span>Account</button>
            </div>
          )}
        </div>

        <div className="edtabs" role="tablist" aria-label="Workspace view">
          <button role="tab" aria-selected={view === "preview"} className={view === "preview" ? "on" : ""} onClick={() => setView("preview")}>◉ Preview</button>
          <button role="tab" aria-selected={view === "code"} className={view === "code" ? "on" : ""} onClick={() => setView("code")}>{"</>"} Code</button>
          <button role="tab" aria-selected={view === "more"} className={view === "more" ? "on" : ""} onClick={() => setView("more")}>≡ More</button>
        </div>

        <div style={{ position: "relative" }} ref={relRef}>
          <button className="edpagesel" onClick={() => setRelOpen(!relOpen)} aria-haspopup="menu" aria-expanded={relOpen}>
            {relSel === "live" ? `Live · release ${site?.liveRelease ?? "·"}` : `Release #${relSel}`} <span style={{ fontSize: 9 }}>▾</span>
          </button>
          {relOpen && (
            <div className="bkmenu" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, maxHeight: 300, overflowY: "auto" }} role="menu">
              <button onClick={() => { setRelSel("live"); setRelOpen(false); }}><span className="mi">{relSel === "live" ? "✓" : "●"}</span>Live · release {site?.liveRelease ?? "·"}</button>
              <div className="msep" />
              {[...releases].reverse().map((r) => (
                <button key={r.n} onClick={() => { setRelSel(r.n); setRelOpen(false); }}>
                  <span className="mi">{relSel === r.n ? "✓" : "#"}</span>Release #{r.n} · {fmt(r.createdAt)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grow" />
        <button className={`edicon ${device === "desktop" ? "on" : ""}`} title="Desktop" aria-label="Desktop preview" onClick={() => setDevice("desktop")}>▭</button>
        <button className={`edicon ${device === "mobile" ? "on" : ""}`} title="Mobile" aria-label="Mobile preview" onClick={() => setDevice("mobile")}>▯</button>
        <button className="edicon" title="Refresh preview" aria-label="Refresh preview" onClick={() => setRefreshKey((k) => k + 1)}>⟳</button>
        <button className="bkbtn ghost" style={{ padding: "6px 14px" }} onClick={copyLink}>{copied ? "Copied ✓" : "Share"}</button>
        {site?.stagedRelease
          ? <button className="bkbtn primary" style={{ padding: "6px 16px" }} disabled={busy} onClick={goLiveStaged}>Publish #{site.stagedRelease}</button>
          : <button className="bkbtn primary" style={{ padding: "6px 16px" }} onClick={fileChange}>New release</button>}
      </div>

      {view === "preview" && (
        <div className="edsplit">
          <div className="edcfg">
            <div className="edfeed">
              {err && <div className="fentry" style={{ borderColor: "rgba(230,57,70,.5)" }}><p style={{ color: "var(--bk-red)" }}>{err}</p></div>}
              {!data && !err && <div className="fentry"><p>Loading the production record…</p></div>}
              {site && (
                <div className="fentry">
                  <div className="fwhen"><span className={`dot ${site.status === "live" ? "green" : site.status === "taken_down" ? "red" : ""}`} />{site.slug}.cinefolio.site · {String(site.status || "").replace("_", " ").toUpperCase()}</div>
                  <b>{site.title}</b>
                  <p>{releases.length} release{releases.length === 1 ? "" : "s"} in the vault{typeof (stats?.views ?? stats?.total) === "number" ? ` · seen ${stats.views ?? stats.total} times` : ""}. Every premiere is an atomic pointer flip; rolling back flips it back in seconds.</p>
                  <div className="facts">
                    {site.status === "live" && <a className="flink" href={liveUrl} target="_blank" rel="noopener noreferrer">Watch live ↗</a>}
                    {site.stagedRelease && <a className="flink" href={site.stagedUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--bk-gold)" }}>Staged #{site.stagedRelease} ↗</a>}
                    <button className="flink" onClick={() => { setView("more"); setMoreTab("analytics"); }}>Analytics</button>
                    <button className="flink" onClick={() => { setView("more"); setMoreTab("releases"); }}>Releases</button>
                  </div>
                </div>
              )}
              {feed.map((f, i) => (
                <div key={i} className="fentry">
                  <div className="fwhen"><span className={`dot ${f.dot}`} />{f.kicker}</div>
                  <b>{f.title}</b>
                  <p>{f.body}</p>
                </div>
              ))}
            </div>
            <div className="edhint">
              <span>Change orders reopen this film in The Set with your note attached.</span>
            </div>
            <div className="edcomposer">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); fileChange(); } }}
                placeholder="Direct a change: what should the next release do differently?"
                rows={2}
                aria-label="Change order"
              />
              <div className="bkcomprow">
                <button className="bkplus" title="Open The Set" aria-label="Open The Set" onClick={fileChange}>+</button>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--bk-faint)" }}>Files into The Set</span>
                <button className="bksend" onClick={fileChange} aria-label="File the change order">↑</button>
              </div>
            </div>
          </div>
          <div className="edcanvaswrap">
            <div className={`edcanvas ${device === "mobile" ? "mob" : ""}`} style={device === "mobile" ? { background: "var(--bk-bg)" } : undefined}>
              {relSel === "live" && liveUrl && site?.status === "live" && (
                <iframe key={refreshKey} title="Live preview" src={liveUrl} sandbox="allow-scripts allow-same-origin" />
              )}
              {relSel === "live" && site && site.status !== "live" && (
                <div className="emptystate">
                  <div>
                    <div className="mono" style={{ marginBottom: 10 }}>THE MARQUEE IS DARK</div>
                    This film is not screening right now.{site?.liveRelease ? " Relight it from More · Releases." : " Premiere a release from The Set."}
                  </div>
                </div>
              )}
              {relSel !== "live" && (srcBusy
                ? <div className="emptystate"><div className="mono">PULLING RELEASE #{relSel} FROM THE VAULT…</div></div>
                : source
                  ? <iframe key={`${relSel}-${refreshKey}`} title={`Release ${relSel}`} sandbox="allow-scripts" srcDoc={source} />
                  : <div className="emptystate"><div className="mono">THIS RELEASE KEPT ITS SOURCE PRIVATE</div></div>)}
            </div>
          </div>
        </div>
      )}

      {view === "code" && (
        <div className="codewrap">
          <div className="codetree">
            <div className="treelbl">{site?.slug || "film"} · {relSel === "live" ? `release ${site?.liveRelease ?? ""}` : `release ${relSel}`}</div>
            <button className="on">▤ index.html</button>
            <div className="treelbl" style={{ marginTop: 12 }}>Case-study pages ship in the release bundle and activate at premiere.</div>
          </div>
          <div className="codepane">
            <div className="codetabs">
              <span>index.html</span>
              <span className="ro">Read only</span>
              <button className="bkbtn ghost" style={{ padding: "4px 12px", fontSize: 12 }} onClick={download} disabled={!source}>Download</button>
            </div>
            <div className="codebody">
              {srcBusy && <pre>Loading source…</pre>}
              {!srcBusy && source && (
                <pre>{source.split("\n").slice(0, 800).map((l, i) => `${String(i + 1).padStart(4, " ")}  ${l}`).join("\n")}</pre>
              )}
              {!srcBusy && !source && <pre>No source available for this release.</pre>}
            </div>
          </div>
        </div>
      )}

      {view === "more" && (
        <div className="morewrap">
          <div className="moremenu">
            <button className={moreTab === "analytics" ? "on" : ""} onClick={() => setMoreTab("analytics")}>◔ Analytics</button>
            <button className={moreTab === "releases" ? "on" : ""} onClick={() => setMoreTab("releases")}>≡ Releases</button>
            <button className={moreTab === "settings" ? "on" : ""} onClick={() => setMoreTab("settings")}>⚙ Film settings</button>
          </div>
          <div className="morebody">
            {moreTab === "analytics" && (
              <div className="morecard">
                <div className="mchead">Web traffic<span className="right"><span className="bkchip plain">ALL TIME</span></span></div>
                <div className="kpirow">
                  <div className="kpi on"><span>Views</span><b>{typeof (stats?.views ?? stats?.total) === "number" ? (stats.views ?? stats.total) : "—"}</b></div>
                  <div className="kpi"><span>Visitors</span><b>—</b></div>
                  <div className="kpi"><span>Views per visit</span><b>—</b></div>
                  <div className="kpi"><span>Visit duration</span><b>—</b></div>
                  <div className="kpi"><span>Bounce rate</span><b>—</b></div>
                </div>
                {stats === null
                  ? <div className="nodata">Per-film analytics wire up with the stats route. Until then the live view counter on All films is the source of truth.</div>
                  : <div className="chartempty" aria-hidden="true"><i style={{ left: 0 }}>launch</i><i style={{ right: 0 }}>today</i></div>}
              </div>
            )}
            {moreTab === "releases" && (
              <div className="morecard">
                <div className="mchead">Releases<span className="right"><span className="bkchip plain">{releases.length} IN THE VAULT</span></span></div>
                <div className="reltl">
                  {[...releases].reverse().map((r) => (
                    <div key={r.n} className="relrow">
                      <span className="rn">#{r.n}</span>
                      <span className="rmeta">{fmt(r.createdAt)}</span>
                      <span className="rbadges">
                        {site?.liveRelease === r.n && <span className="bkchip plain green">LIVE</span>}
                        {site?.stagedRelease === r.n && <span className="bkchip plain gold">STAGED</span>}
                      </span>
                      {site?.liveRelease !== r.n && (site?.status === "live" || site?.stagedRelease === r.n) && (
                        <button className="bkbtn ghost" style={{ padding: "5px 13px", fontSize: 12 }} disabled={busy} onClick={() => rollback(r.n)}>
                          {site?.stagedRelease === r.n ? "Go live" : "Screen this cut"}
                        </button>
                      )}
                    </div>
                  ))}
                  {releases.length === 0 && <div className="nodata">No releases yet. Premiere one from The Set.</div>}
                </div>
              </div>
            )}
            {moreTab === "settings" && (
              <div className="morecard">
                <div className="mchead">Film settings</div>
                <div className="reltl">
                  <div className="relrow">
                    <span className="rmeta"><b style={{ color: "var(--bk-ink)" }}>Address</b><br />{site?.slug}.cinefolio.site</span>
                    <button className="bkbtn ghost" style={{ padding: "5px 13px", fontSize: 12 }} onClick={copyLink}>{copied ? "Copied ✓" : "Copy link"}</button>
                  </div>
                  <div className="relrow">
                    <span className="rmeta"><b style={{ color: "var(--bk-ink)" }}>Source export</b><br />The current release as a single HTML file.</span>
                    <button className="bkbtn ghost" style={{ padding: "5px 13px", fontSize: 12 }} onClick={() => { setView("code"); }}>Open code view</button>
                  </div>
                  {site?.status !== "taken_down" && (
                    <div className="relrow">
                      <span className="rmeta"><b style={{ color: "var(--bk-red)" }}>Take down</b><br />The site goes dark; every release stays in the vault.</span>
                      <button className="bkbtn ghost" style={{ padding: "5px 13px", fontSize: 12, borderColor: "rgba(230,57,70,.5)", color: "var(--bk-red)" }} onClick={() => setConfirmDown(true)}>Take down</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDown} danger kicker="OFF THE MARQUEE" title={`Take down ${site?.slug}?`}
        body="The site goes dark, but every release stays safe in the vault. Relight it any time."
        confirmLabel="Take it down" busy={busy}
        onConfirm={() => { setConfirmDown(false); setBusy(true); api.takedown(siteId).then(load).catch((e) => setErr(friendly(e.message))).finally(() => setBusy(false)); }}
        onClose={() => setConfirmDown(false)}
      />
    </div>
  );
}
