// Home: the greeting over the jersey aurora. The composer is not a chatbot,
// it is the studio's intake window: drop a resume, a headshot and project
// shots, add a note, hit Roll. Everything lands in The Set prefilled. The
// gallery below carries the vault.
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { TEMPLATES, compile, parseProfile } from "../templates/engine.js";
import { useIntakeAssets, useDropzone, usePopover, packBrief } from "../media.js";
import { ledger } from "../orders.js";
import AssetChips from "../shell/Intake.jsx";

const DEMO = parseProfile("", { name: "Jordan Vega", headline: "Product Designer, systems and story" });

export default function Home() {
  const { user, nav } = useAuth();
  const [brief, setBrief] = useState("");
  const [style, setStyle] = useState(null); // template id or null = studio's choice
  const [tab, setTab] = useState("films");  // films | recent | templates
  const [sites, setSites] = useState(null);
  const stylePop = usePopover();
  const fileRef = useRef(null);
  const intake = useIntakeAssets();
  const { over, dropProps } = useDropzone(intake.addFiles);

  const [firstRun, setFirstRun] = useState({ dossier: false, draft: false });
  const [ent, setEnt] = useState(null);       // { freeCutsLeft, freeCutsLimit, paidCredits } from /me
  const [lane, setLane] = useState("ai");     // "ai" (express, needs resume) | "set" (manual)
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [buy, setBuy] = useState(null);       // LS checkout url, offered when every cut is spent

  useEffect(() => {
    api.sites().then((r) => setSites(r.sites || [])).catch(() => setSites([]));
    api.getProfile().then((r) => setFirstRun((f) => ({ ...f, dossier: !!r.profile }))).catch(() => { /* optional */ });
    api.me().then((r) => {
      if (typeof r?.user?.freeCutsLeft === "number") {
        setEnt({ freeCutsLeft: r.user.freeCutsLeft, freeCutsLimit: r.user.freeCutsLimit || 3, paidCredits: r.user.paidCredits || 0 });
        if (r.user.freeCutsLeft === 0 && !(r.user.paidCredits > 0)) setLane("set");
      }
    }).catch(() => { /* chip stays quiet */ });
    try { setFirstRun((f) => ({ ...f, draft: !!localStorage.getItem("cf.studioDraft") })); } catch { /* noop */ }
  }, []);

  const rollToSet = () => {
    packBrief({
      text: brief.trim(),
      tpl: style,
      pal: null,
      cvRaw: intake.resume?.text || "",
      cvName: intake.resume?.name || "",
      photo: intake.photo?.url || "",
      covers: intake.covers.map((c) => ({ name: c.name, url: c.url })),
    });
    nav("studio");
  };

  // the express lane: resume + photo in the box -> the order goes straight to
  // the AI director and the client waits in the Premiere Lounge with a
  // skeleton until the cut lands in the preview
  const rollToDirector = async () => {
    const cv = intake.resume?.text || "";
    if (cv.trim().length < 80) { setErr("The director needs your resume: drop a PDF or TXT first, or switch to The Set to type it in."); return; }
    setSending(true); setErr("");
    try {
      const name = (cv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] || "").slice(0, 60);
      const r = await api.order({
        email: user.email, name, role: "engineer",
        cvText: cv,
        template: style, palette: null,
        customIdea: brief.trim() || null,
        photo: intake.photo?.url && !String(intake.photo.url).startsWith("data:") ? intake.photo.url : null,
        covers: intake.covers.filter((c) => !String(c.url).startsWith("data:")).map((c) => ({ name: c.name, url: c.url })),
        links: null,
      });
      if (typeof r.freeCutsLeft === "number") setEnt((e0) => ({ freeCutsLeft: r.freeCutsLeft, freeCutsLimit: e0?.freeCutsLimit || 3, paidCredits: r.paid ? Math.max(0, (e0?.paidCredits || 1) - 1) : e0?.paidCredits || 0 }));
      ledger.record({ orderId: r.orderId, name, price: r.price || 0, ai: true, production: !!r.production, status: r.production ? "queued" : "preview_only" });
      try { localStorage.setItem("cf.activeOrder", JSON.stringify({ orderId: r.orderId, name })); } catch { /* noop */ }
      nav(`order/${r.orderId}`);
    } catch (e) {
      if (e.status === 402) {
        setEnt((e0) => ({ ...(e0 || {}), freeCutsLeft: 0, freeCutsLimit: e0?.freeCutsLimit || 3, paidCredits: 0 }));
        setLane("set");
        setErr("Your free AI films are spent. Unlock the Director's Cut below, or keep filming free on The Set.");
        api.billingCheckout().then((c) => setBuy(c.url))
          .catch(() => setErr("Your free AI films are spent. The Set is open for manual filming; the paid register opens soon."));
      }
      else setErr(friendlyMsg(e));
    } finally { setSending(false); }
  };
  const friendlyMsg = (e) => e?.message || "The studio hit a snag. Try again in a moment.";

  // after the buyer returns from Lemon Squeezy: one click re-syncs the credit
  // (the webhook lands it server-side; this just refreshes /me)
  const recheckCredit = () => api.me().then((r) => {
    const pc = r?.user?.paidCredits || 0;
    setEnt({ freeCutsLeft: r?.user?.freeCutsLeft ?? 0, freeCutsLimit: r?.user?.freeCutsLimit || 3, paidCredits: pc });
    if (pc > 0) { setBuy(null); setErr(""); setLane("ai"); }
  }).catch(() => { /* the credit lands with the webhook; try again in a moment */ });

  const roll = () => { if (lane === "ai") rollToDirector(); else rollToSet(); };

  const onPaste = (e) => {
    const files = e.clipboardData?.files;
    if (files?.length) { e.preventDefault(); intake.addFiles(files); }
  };

  const who = user.email.split("@")[0];
  const recent = useMemo(() => [...(sites || [])]
    .sort((a, b) => String(b.updatedAt || b.publishedAt || "").localeCompare(String(a.updatedAt || a.publishedAt || "")))
    .slice(0, 6), [sites]);
  const shown = tab === "recent" ? recent : (sites || []).slice(0, 6);

  const templatePosters = useMemo(() => (tab === "templates"
    ? TEMPLATES.map((t) => { try { return { ...t, html: compile(t.id, t.palettes[0].id, DEMO, {}) }; } catch { return { ...t, html: "" }; } })
    : []), [tab]);

  const edited = (s) => {
    const d = s.updatedAt || s.publishedAt;
    return d ? `Edited ${new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : `Release ${s.liveRelease ?? 0}/${s.releases ?? 0}`;
  };

  return (
    <div>
      <div className="bkhero">
        <h1 className="bkgreet">What story are we filming today, <em>{who}</em>?</h1>

        <div className={`bkcomposer ${over ? "over" : ""}`} {...dropProps}>
          <input
            ref={fileRef} type="file" multiple hidden
            accept=".pdf,.txt,text/plain,application/pdf,image/*"
            onChange={(e) => { intake.addFiles(e.target.files); e.target.value = ""; }}
            aria-hidden="true" tabIndex={-1}
          />
          {!intake.hasAssets && (
            <button className="bkdrop hero" type="button" onClick={() => fileRef.current?.click()}>
              <span className="glyph" aria-hidden="true">◉</span>
              <span>{over ? <b>Drop to attach</b> : <><b>Drop your resume, headshot and project shots</b> or click to browse</>}</span>
            </button>
          )}
          <AssetChips intake={intake} />
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); roll(); } }}
            placeholder={intake.hasAssets ? "Add a note on the role you're chasing, if you like." : "Or start with a note: who this film is about, the role it should land."}
            rows={2}
            aria-label="Film brief"
          />
          {intake.busy && <div className="bkprogress" aria-hidden="true"><div className="fill" /></div>}
          {(intake.error || err) && <div className="bkerr" role="alert">{intake.error || err}</div>}
          {buy && (
            <div className="bkbuy">
              <a className="btn" href={buy} target="_blank" rel="noopener noreferrer">Unlock the Director&apos;s Cut — $99 · 3 productions</a>
              <button type="button" className="btn ghost" onClick={recheckCredit}>I&apos;ve paid — check my credits</button>
            </div>
          )}
          <span className="visually-hidden" aria-live="polite">{intake.busy ? "Reading your files…" : sending ? "Sending to the director…" : ""}</span>
          <div className="bkcomprow" style={{ position: "relative" }}>
            <button className="bkplus" title="Attach resume, headshot or project shots" aria-label="Attach resume, headshot or project shots" onClick={() => fileRef.current?.click()}>+</button>
            <div className="bklane" role="radiogroup" aria-label="Who films it">
              <button role="radio" aria-checked={lane === "ai"} className={lane === "ai" ? "on" : ""} disabled={ent?.freeCutsLeft === 0 && !(ent?.paidCredits > 0)}
                title={ent?.freeCutsLeft === 0 && !(ent?.paidCredits > 0) ? "Free cuts spent — unlock a paid cut" : "The AI director films it; you wait in the lounge"} onClick={() => setLane("ai")}>
                ◈ AI Director{ent ? ` · ${ent.freeCutsLeft > 0 ? `${ent.freeCutsLeft} free` : ent.paidCredits > 0 ? `${ent.paidCredits} paid` : "0 left"}` : ""}
              </button>
              <button role="radio" aria-checked={lane === "set"} className={lane === "set" ? "on" : ""} title="Film it yourself; renders as you type" onClick={() => setLane("set")}>
                ◉ The Set
              </button>
            </div>
            <div ref={stylePop.ref} style={{ marginLeft: "auto", position: "relative" }}>
              <button className="bkstyle" onClick={stylePop.toggle} aria-haspopup="menu" aria-expanded={stylePop.open}>
                {style ? (TEMPLATES.find((t) => t.id === style)?.name || "Look") : "Look"} <span style={{ fontSize: 9 }} aria-hidden="true">▾</span>
              </button>
              {stylePop.open && (
                <div className="bkmenu" style={{ position: "absolute", right: 0, bottom: "calc(100% + 8px)", minWidth: 210 }} role="menu">
                  <button role="menuitem" onClick={() => { setStyle(null); stylePop.close(true); }}><span className="mi" aria-hidden="true">✦</span>Studio&apos;s choice</button>
                  <div className="msep" />
                  {TEMPLATES.map((t) => (
                    <button key={t.id} role="menuitem" onClick={() => { setStyle(t.id); stylePop.close(true); }}>
                      <span className="mi" aria-hidden="true">{style === t.id ? "✓" : "◈"}</span>{t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="bksend" onClick={roll} disabled={intake.busy || sending} aria-label={lane === "ai" ? "Send to the AI director (uses one cut)" : "Open The Set with everything attached"}>{sending ? "…" : "↑"}</button>
          </div>
        </div>
        <p className="bkhelper">
          {lane === "ai"
            ? "Drop the resume and a photo, hit send: the AI director films a scroll-story portfolio while you watch from the lounge. Uses one of your cuts."
            : "Resume as PDF or TXT, images up to 10MB. We read everything in your browser; nothing is filed until you hit send."}
        </p>
      </div>

      <div className="bkgallery">
        <div className="bktabs" role="tablist" aria-label="Vault">
          <button className="tsearch" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}>◌ Search</button>
          <button role="tab" aria-selected={tab === "films"} className={`tab ${tab === "films" ? "on" : ""}`} onClick={() => setTab("films")}>My films</button>
          <button role="tab" aria-selected={tab === "recent"} className={`tab ${tab === "recent" ? "on" : ""}`} onClick={() => setTab("recent")}>Recently viewed</button>
          <button role="tab" aria-selected={tab === "templates"} className={`tab ${tab === "templates" ? "on" : ""}`} onClick={() => setTab("templates")}>Studio templates</button>
          <button className="browseall" onClick={() => nav(tab === "templates" ? "resources" : "films")}>Browse all →</button>
        </div>

        {tab !== "templates" && (
          <>
            {sites === null && (
              <div className="bkcards" aria-hidden="true">
                <div className="bkskel" /><div className="bkskel" /><div className="bkskel" />
              </div>
            )}
            {sites?.length === 0 && (() => {
              const done = 1 + (firstRun.dossier ? 1 : 0) + (firstRun.draft ? 1 : 0);
              return (
                <div style={{ padding: "10px 4px 6px" }}>
                  <div className="mono" style={{ fontSize: 9.5 }}>
                    {done} OF 4 DONE · ACCOUNT CREATED ✓{firstRun.dossier ? " · DOSSIER FILLED ✓" : ""}{firstRun.draft ? " · TAKE DIRECTED ✓" : ""}
                  </div>
                  <div className="bkgauge" aria-hidden="true"><div className="fill" style={{ width: `${(done / 4) * 100}%` }} /></div>
                  <div className="bksteps">
                    <button className={`bkstep ${firstRun.dossier ? "done" : ""}`} onClick={() => nav("profile")}>
                      <span className="no" aria-hidden="true">{firstRun.dossier ? "✓" : "1"}</span>
                      <span><b>Fill your dossier</b><i>Upload a resume once; every film casts from it.</i></span>
                    </button>
                    <button className={`bkstep ${firstRun.draft ? "done" : ""}`} onClick={() => nav("studio")}>
                      <span className="no" aria-hidden="true">{firstRun.draft ? "✓" : "2"}</span>
                      <span><b>Direct your free take</b><i>Drop assets above, or open The Set; it renders as you type.</i></span>
                    </button>
                    <button className="bkstep" onClick={() => nav("studio")}>
                      <span className="no" aria-hidden="true">3</span>
                      <span><b>Premiere it</b><i>One click, live on yourname.cinefolio.dev.</i></span>
                    </button>
                  </div>
                </div>
              );
            })()}
            <div className="bkcards">
              {shown.map((s) => (
                <button key={s.siteId} className="bkfilmbtn" onClick={() => nav(`film/${s.siteId}`)}>
                  <span className="bkthumb" aria-hidden="true">
                    {s.status === "live" && s.previewUrl
                      ? <iframe title={`poster-${s.slug}`} src={s.previewUrl} sandbox="allow-scripts" loading="lazy" scrolling="no" tabIndex={-1} referrerPolicy="no-referrer" />
                      : <span className="ghost">{(s.title || s.slug || "FILM").toUpperCase()}</span>}
                    {s.status === "live" && <span className="pubbadge">Published</span>}
                    {s.stagedRelease && s.status !== "live" && <span className="pubbadge staged">Staged</span>}
                    {s.status === "taken_down" && <span className="pubbadge down">Taken down</span>}
                  </span>
                  <span className="bkfilmmeta">
                    <span className="fava" aria-hidden="true" />
                    <span style={{ minWidth: 0 }}>
                      <b>{s.title || s.slug}</b>
                      <i>{edited(s)}</i>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {tab === "templates" && (
          <div className="bkcards">
            {templatePosters.map((t) => (
              <button key={t.id} className="bkfilmbtn" onClick={() => { packBrief({ text: "", tpl: t.id }); nav("studio"); }}>
                <span className="bkthumb" aria-hidden="true">
                  {t.html ? <iframe title={t.name} sandbox="allow-scripts" scrolling="no" srcDoc={t.html} loading="lazy" tabIndex={-1} /> : <span className="ghost">{t.name.toUpperCase()}</span>}
                </span>
                <span className="bkfilmmeta">
                  <span className="fava" aria-hidden="true" />
                  <span style={{ minWidth: 0 }}><b>{t.name}</b><i>{t.blurb}</i></span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
