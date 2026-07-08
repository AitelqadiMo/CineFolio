// The film workspace: reference anatomy, studio truth. A 48px chrome bar,
// the config panel on the left at the exact reference width, and the film
// screening on a light canvas filling the right half. The left panel is a
// production feed fed by real releases, orders and stats; the composer at
// its foot files a change order into The Set. Preview / Code / More views.
import { useEffect, useMemo, useRef, useState } from "react";
import { api, notWired } from "../api.js";
import { CONFIG } from "../config.js";
import { useAuth } from "../App.jsx";
import { friendly, ConfirmDialog, PromptDialog } from "../ui.jsx";
import { toast } from "../shell/Toast.jsx";
import { ledger } from "../orders.js";
import { useIntakeAssets, useDropzone, usePopover, packBrief } from "../media.js";
import AssetChips from "../shell/Intake.jsx";

const fmt = (d) => (d ? new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

// Sparkline: a real chart the moment the stats route returns a series, drawn
// in the jersey gradient. Accepts [{ date, count }] or plain numbers.
function Sparkline({ data }) {
  const pts = data.map((d) => (typeof d === "number" ? d : Number(d.count ?? d.views ?? 0)));
  if (!pts.length) return null;
  const W = 720, H = 220, PAD = 8;
  const max = Math.max(...pts, 1);
  const step = pts.length > 1 ? (W - PAD * 2) / (pts.length - 1) : 0;
  const y = (v) => H - PAD - (v / max) * (H - PAD * 2);
  const line = pts.map((v, i) => `${(PAD + i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${PAD},${H - PAD} ${line} ${(PAD + (pts.length - 1) * step).toFixed(1)},${H - PAD}`;
  const first = data[0]; const last = data[data.length - 1];
  const lbl = (d) => (typeof d === "object" && (d.date || d.d) ? String(d.date || d.d).slice(5) : "");
  return (
    <div className="sparkwrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Views over time, peaking at ${max}`}>
        <defs>
          <linearGradient id="spark" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#C8102E" /><stop offset="50%" stopColor="#D9A441" /><stop offset="100%" stopColor="#0E9E62" />
          </linearGradient>
          <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(217,164,65,.25)" /><stop offset="100%" stopColor="rgba(217,164,65,0)" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD} x2={W - PAD} y1={H * f} y2={H * f} stroke="rgba(244,239,230,.08)" strokeWidth="1" />
        ))}
        <polygon points={area} fill="url(#sparkfill)" />
        <polyline points={line} fill="none" stroke="url(#spark)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <text className="sparkaxis" x={PAD} y={H - 2}>{lbl(first)}</text>
        <text className="sparkaxis" x={W - PAD} y={H - 2} textAnchor="end">{lbl(last)}</text>
        <text className="sparkaxis" x={W - PAD} y={12} textAnchor="end">{max}</text>
      </svg>
    </div>
  );
}

export default function Editor({ siteId }) {
  const { nav } = useAuth();
  const [data, setData] = useState(null);        // { site, releases }
  const [err, setErr] = useState("");
  const [view, setView] = useState("preview");   // preview | code | more
  const [device, setDevice] = useState("desktop");
  const [relSel, setRelSel] = useState("live");  // "live" | release number
  const relPop = usePopover();
  const projPop = usePopover();
  const [source, setSource] = useState(null);    // HTML string for code/release view
  const [srcBusy, setSrcBusy] = useState(false);
  const [stats, setStats] = useState(null);
  const [moreTab, setMoreTab] = useState("analytics");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDown, setConfirmDown] = useState(false);
  const [revising, setRevising] = useState(false);
  const [messagesLeft, setMessagesLeft] = useState(null); // AI films: notes to the director left on the order
  const [copied, setCopied] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileRef = useRef(null);
  const intake = useIntakeAssets();
  const { over, dropProps } = useDropzone(intake.addFiles);

  const load = () => api.site(siteId)
    .then((r) => { setData(r); setErr(""); })
    .catch((e) => setErr(friendly(e.message)));
  useEffect(() => { load(); }, [siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.siteStats(siteId).then(setStats).catch((e) => { if (notWired(e)) setStats(null); });
  }, [siteId]);

  // AI films: how many messages to the director are left on the order
  useEffect(() => {
    const oid = data?.site?.orderId;
    if (!oid) { setMessagesLeft(null); return; }
    api.myOrders().then((r) => {
      const o = (r.orders || []).find((x) => x.orderId === oid);
      if (o && typeof o.messagesLeft === "number") setMessagesLeft(o.messagesLeft);
    }).catch(() => { /* meter stays quiet */ });
  }, [data]);

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

  // AI films: cut a BRAND-NEW release from the order. This is the recovery
  // path when an older release shipped pages without assets: publish re-reads
  // the manifest UNION the uploaded-asset rows and copies everything, then
  // reports exactly what shipped so a stale backend exposes itself instantly.
  const [integ, setInteg] = useState(null); // inspector report | "busy" | null
  const rebuildFromCut = () => {
    if (!site?.orderId) return;
    setBusy(true); setErr("");
    api.publish(siteId, { orderId: site.orderId })
      .then((r) => {
        if ((r.assets ?? 0) === 0) {
          setErr(`Release #${r.release} shipped ${r.pages ?? "?"} page(s) but 0 assets. The deployed API is running old publish code: run terraform apply in envs/dev, then rebuild again.`);
        } else {
          toast(`Release #${r.release} is live: ${r.pages} page${r.pages === 1 ? "" : "s"} and ${r.assets} asset${r.assets === 1 ? "" : "s"} shipped.`);
        }
        setRelSel("live");
        load();
      })
      .catch((e) => setErr(friendly(e.message)))
      .finally(() => setBusy(false));
  };
  const checkIntegrity = () => {
    setInteg("busy");
    api.inspect(siteId).then(setInteg).catch((e) => { setInteg(null); setErr(notWired(e) ? "The inspector route isn't deployed yet: run terraform apply." : friendly(e.message)); });
  };

  const goLiveStaged = () => {
    if (!site?.stagedRelease) return;
    setBusy(true);
    api.rollback(siteId, site.stagedRelease).then(load).catch((e) => setErr(friendly(e.message))).finally(() => setBusy(false));
  };
  const rollback = (n) => {
    setBusy(true);
    api.rollback(siteId, n).then(load).catch((e) => setErr(friendly(e.message))).finally(() => setBusy(false));
  };
  // manual films: the change order opens The Set with everything attached
  const fileChangeToSet = () => {
    try {
      sessionStorage.setItem("cf.editSite", JSON.stringify({ siteId, slug: site?.slug, title: site?.title }));
    } catch { /* noop */ }
    if (note.trim() || intake.hasAssets) {
      packBrief({
        text: note.trim(),
        tpl: null,
        cvRaw: intake.resume?.text || "",
        cvName: intake.resume?.name || "",
        photo: intake.photo?.url || "",
        covers: intake.covers.map((c) => ({ name: c.name, url: c.url })),
      });
    }
    nav("studio");
  };

  // AI films: the change order IS a message to the director. Attached assets
  // ride the note as URLs; the pipeline refilms the SAME order and the revised
  // cut premieres onto THIS film, never a new one.
  const isAI = !!site?.orderId;
  const [sending, setSending] = useState(false);
  const messageDirector = async () => {
    const assetLines = [
      intake.photo?.url ? `New headshot: ${intake.photo.url}` : null,
      ...intake.covers.map((c, i) => `New project shot ${i + 1}: ${c.url}`),
      intake.resume?.text ? `Updated resume text:\n${intake.resume.text.slice(0, 4000)}` : null,
    ].filter(Boolean);
    const notes = [note.trim(), ...assetLines].filter(Boolean).join("\n\n");
    if (notes.length < 3) { setErr("Tell the director what should change, or attach the new files."); return; }
    setSending(true); setErr("");
    try {
      const r = await api.requestRevision(site.orderId, { notes });
      if (typeof r.messagesLeft === "number") setMessagesLeft(r.messagesLeft);
      setNote(""); intake.clear();
      toast("Message sent. The director is refilming this portfolio; the revised cut premieres here.");
      load();
    } catch (e) {
      if (e.status === 409 && /no messages left/i.test(e.message || "")) { setMessagesLeft(0); setErr("No messages left on this order. Open The Set to direct a manual release instead."); }
      else if (notWired(e)) setErr("Messages aren't wired in this environment yet. Open The Set to direct a manual release.");
      else setErr(friendly(e.message));
    } finally { setSending(false); }
  };

  const fileChange = () => {
    if (isAI && (messagesLeft === null || messagesLeft > 0)) { messageDirector(); return; }
    fileChangeToSet();
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
        <div style={{ position: "relative" }} ref={projPop.ref}>
          <button className="edproj" onClick={projPop.toggle} aria-haspopup="menu" aria-expanded={projPop.open}>
            <span className="lens" aria-hidden="true" /><span>{site?.title || "…"}</span>
            {site?.orderId && <span className="bkchip plain gold" style={{ flex: "0 0 auto" }}>AI{typeof messagesLeft === "number" ? ` · ${messagesLeft} MSG` : ""}</span>}
            <span className="chev" aria-hidden="true">▾</span>
          </button>
          {projPop.open && (
            <div className="bkmenu" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0 }} role="menu">
              <button role="menuitem" onClick={() => nav("")}><span className="mi" aria-hidden="true">←</span>Go to Dashboard</button>
              <button role="menuitem" onClick={() => nav("films")}><span className="mi" aria-hidden="true">▦</span>All films</button>
              <div className="msep" />
              <button role="menuitem" onClick={fileChangeToSet}><span className="mi" aria-hidden="true">◉</span>Edit in The Set</button>
              <button role="menuitem" onClick={() => { projPop.close(true); setView("more"); setMoreTab("releases"); }}><span className="mi" aria-hidden="true">≡</span>Releases</button>
              <button role="menuitem" onClick={() => { projPop.close(true); setView("more"); setMoreTab("settings"); }}><span className="mi" aria-hidden="true">⚙</span>Film settings</button>
              <div className="msep" />
              <button role="menuitem" onClick={() => nav("settings")}><span className="mi" aria-hidden="true">✦</span>Account</button>
            </div>
          )}
        </div>

        <div className="edtabs" role="tablist" aria-label="Workspace view">
          <button role="tab" aria-selected={view === "preview"} className={view === "preview" ? "on" : ""} onClick={() => setView("preview")}>◉ Preview</button>
          <button role="tab" aria-selected={view === "code"} className={view === "code" ? "on" : ""} onClick={() => setView("code")}>{"</>"} Code</button>
          <button role="tab" aria-selected={view === "more"} className={view === "more" ? "on" : ""} onClick={() => setView("more")}>≡ More</button>
        </div>

        <div style={{ position: "relative" }} ref={relPop.ref}>
          <button className="edpagesel" onClick={relPop.toggle} aria-haspopup="menu" aria-expanded={relPop.open}>
            {relSel === "live" ? `Live · release ${site?.liveRelease ?? "·"}` : `Release #${relSel}`} <span style={{ fontSize: 9 }} aria-hidden="true">▾</span>
          </button>
          {relPop.open && (
            <div className="bkmenu" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, maxHeight: 300, overflowY: "auto" }} role="menu">
              <button role="menuitem" onClick={() => { setRelSel("live"); relPop.close(true); }}><span className="mi" aria-hidden="true">{relSel === "live" ? "✓" : "●"}</span>Live · release {site?.liveRelease ?? "·"}</button>
              <div className="msep" />
              {[...releases].reverse().map((r) => (
                <button key={r.n} role="menuitem" onClick={() => { setRelSel(r.n); relPop.close(true); }}>
                  <span className="mi" aria-hidden="true">{relSel === r.n ? "✓" : "#"}</span>Release #{r.n} · {fmt(r.createdAt)}
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
        {relSel !== "live" && relSel !== site?.liveRelease
          ? <button className="bkbtn primary" style={{ padding: "6px 16px" }} disabled={busy} onClick={() => { rollback(relSel); setRelSel("live"); }}>Publish #{relSel}</button>
          : site?.stagedRelease
            ? <button className="bkbtn primary" style={{ padding: "6px 16px" }} disabled={busy} onClick={goLiveStaged}>Publish #{site.stagedRelease}</button>
            : <button className="bkbtn primary" style={{ padding: "6px 16px" }} onClick={fileChangeToSet}>New release</button>}
      </div>

      {view === "preview" && (
        <div className="edsplit">
          <div className="edcfg">
            <div className="edfeed">
              {err && <div className="fentry" role="alert" style={{ borderColor: "rgba(230,57,70,.5)" }}><p style={{ color: "var(--bk-red)" }}>{err}</p></div>}
              {!data && !err && <div className="fentry"><p>Loading the production record…</p></div>}
              {site && (
                <div className="fentry">
                  <div className="fwhen"><span className={`dot ${site.status === "live" ? "green" : site.status === "taken_down" ? "red" : ""}`} />{site.slug}.cinefolio.site · {String(site.status || "").replace("_", " ").toUpperCase()}</div>
                  <b>{site.title}</b>
                  <p>{releases.length} release{releases.length === 1 ? "" : "s"} in the vault{typeof (stats?.views ?? stats?.total) === "number" ? ` · seen ${stats.views ?? stats.total} times` : ""}. Every premiere is an atomic pointer flip; rolling back flips it back in seconds.</p>
                  <div className="facts">
                    {site.status === "live" && <a className="flink" href={liveUrl} target="_blank" rel="noopener noreferrer">Watch live ↗</a>}
                    {site.orderId && <button className="flink" style={{ color: "var(--bk-gold)", borderColor: "rgba(217,164,65,.4)" }} onClick={() => setRevising(true)}>◈ AI revision</button>}
                    {site.orderId && <button className="flink" disabled={busy} onClick={rebuildFromCut} title="Cut a new release from the delivered AI files, assets included">⟳ Rebuild from AI cut</button>}
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
              {isAI
                ? <span>This film is directed by message: your note and files go straight to the AI director, and the revised cut lands on THIS film.{typeof messagesLeft === "number" ? ` · ${messagesLeft} of 3 message${messagesLeft === 1 ? "" : "s"} left` : ""}</span>
                : <span>Your note and files reopen this film in The Set.</span>}
            </div>
            <div className={`edcomposer ${over ? "over" : ""}`} {...dropProps}>
              <input
                ref={fileRef} type="file" multiple hidden
                accept=".pdf,.txt,text/plain,application/pdf,image/*"
                onChange={(e) => { intake.addFiles(e.target.files); e.target.value = ""; }}
                aria-hidden="true" tabIndex={-1}
              />
              {!intake.hasAssets && (
                <button className="bkdrop compact" type="button" onClick={() => fileRef.current?.click()}>
                  <span className="glyph" aria-hidden="true">◉</span>
                  <span>{over ? <b>Drop to attach</b> : <>Attach a new headshot, cover or an updated resume</>}</span>
                </button>
              )}
              <AssetChips intake={intake} />
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onPaste={(e) => { const f = e.clipboardData?.files; if (f?.length) { e.preventDefault(); intake.addFiles(f); } }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); fileChange(); } }}
                placeholder={isAI ? "Message the director: what should the next cut change?" : "Note the change for the next release."}
                rows={2}
                aria-label="Change order"
              />
              {intake.busy && <div className="bkprogress" aria-hidden="true"><div className="fill" /></div>}
              {intake.error && <div className="bkerr" role="alert">{intake.error}</div>}
              <span className="visually-hidden" aria-live="polite">{intake.busy ? "Reading your files…" : ""}</span>
              <div className="bkcomprow">
                <button className="bkplus" title="Attach a headshot, cover or resume" aria-label="Attach a headshot, cover or resume" onClick={() => fileRef.current?.click()}>+</button>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--bk-faint)" }}>{isAI ? (messagesLeft === 0 ? "No messages left · opens The Set" : "Sends to the AI director") : "Files the change order into The Set"}</span>
                <button className="bksend" onClick={fileChange} disabled={intake.busy || sending} aria-label={isAI ? "Message the director" : "File the change order"}>{sending ? "…" : "↑"}</button>
              </div>
            </div>
          </div>
          <div className="edcanvaswrap">
            <div className={`edcanvas ${device === "mobile" ? "mob" : ""}`} style={device === "mobile" ? { background: "var(--bk-bg)" } : undefined}>
              {relSel === "live" && liveUrl && site?.status === "live" && (
                <iframe key={refreshKey} title="Live preview" src={liveUrl} />
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
                {stats === null && <div className="nodata">Per-film analytics wire up with the stats route. Until then the live view counter on All films is the source of truth.</div>}
                {stats !== null && (Array.isArray(stats?.series || stats?.daily) && (stats.series || stats.daily).length
                  ? <Sparkline data={stats.series || stats.daily} />
                  : <div className="chartempty" aria-hidden="true"><i style={{ left: 0 }}>launch</i><i style={{ right: 0 }}>today</i></div>)}
              </div>
            )}
            {moreTab === "releases" && (
              <div className="morecard">
                <div className="mchead">Releases
                  <span className="right">
                    {site?.orderId && <button className="bkbtn ghost" style={{ padding: "4px 12px", fontSize: 12 }} disabled={busy} onClick={rebuildFromCut}>⟳ Rebuild from AI cut</button>}
                    <button className="bkbtn ghost" style={{ padding: "4px 12px", fontSize: 12 }} onClick={checkIntegrity}>{integ === "busy" ? "Checking…" : "Check integrity"}</button>
                    <span className="bkchip plain">{releases.length} IN THE VAULT</span>
                  </span>
                </div>
                {integ && integ !== "busy" && (
                  <div className="reltl" style={{ borderBottom: "1px solid var(--bk-line)" }} role="status">
                    {(integ.releases || []).map((r) => (
                      <div key={`i-${r.n}`} className="relrow" style={{ alignItems: "flex-start" }}>
                        <span className="rn">#{r.n}</span>
                        <span className="rmeta" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                          {r.listError
                            ? <span style={{ color: "var(--bk-gold)" }}>manifest {r.manifest.length} · {r.listError}</span>
                            : <>
                                manifest {r.manifest.length} · in S3 {r.inS3.length}
                                {r.missing.length > 0
                                  ? <span style={{ color: "var(--bk-red)" }}> · MISSING: {r.missing.join(", ")}</span>
                                  : <span style={{ color: "var(--bk-green)" }}> · complete ✓</span>}
                              </>}
                        </span>
                      </div>
                    ))}
                    {integ.orderAssets && (
                      <div className="relrow" style={{ alignItems: "flex-start" }}>
                        <span className="rn" aria-hidden="true">◈</span>
                        <span className="rmeta" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                          agent uploads: {integ.orderAssets.uploadedAssets.length ? integ.orderAssets.uploadedAssets.map((a) => a.path).join(", ") : "none recorded"}
                        </span>
                      </div>
                    )}
                  </div>
                )}
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

      <PromptDialog
        open={revising} kicker="THE INCLUDED REVISION" title="Direct the AI revision"
        body="This film was cut by the studio's AI. One revision is included: tell the director what should change and the pipeline refilms it."
        placeholder="Warmer light on the hero, bolder project pages…"
        submitLabel="Send to the studio"
        onSubmit={async (notes) => {
          setRevising(false);
          try {
            const r = await api.requestRevision(site.orderId, { notes });
            if (typeof r.messagesLeft === "number") setMessagesLeft(r.messagesLeft);
            toast("Revision filed. The studio is refilming; the new cut premieres as a release.");
            load();
          } catch (e) {
            if (notWired(e)) setErr("Revisions by note aren't wired in this environment yet. File a change order below instead.");
            else setErr(friendly(e.message));
          }
        }}
        onClose={() => setRevising(false)}
      />

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
