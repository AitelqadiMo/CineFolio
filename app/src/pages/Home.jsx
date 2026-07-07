// Home: the greeting over the jersey aurora. One composer, one gallery.
// The composer is honest: it files a film brief and opens The Set with the
// brief loaded. No AI theater; the studio's real pipeline does the work.
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { TEMPLATES, compile, parseProfile } from "../templates/engine.js";

const DEMO = parseProfile("", { name: "Jordan Vega", headline: "Product Designer, systems and story" });

export default function Home() {
  const { user, nav } = useAuth();
  const [brief, setBrief] = useState("");
  const [styleOpen, setStyleOpen] = useState(false);
  const [style, setStyle] = useState(null); // template id or null = studio's choice
  const [tab, setTab] = useState("films");  // films | recent | templates
  const [sites, setSites] = useState(null);
  const styleRef = useRef(null);

  useEffect(() => {
    api.sites().then((r) => setSites(r.sites || [])).catch(() => setSites([]));
  }, []);

  useEffect(() => {
    const h = (e) => { if (styleRef.current && !styleRef.current.contains(e.target)) setStyleOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const start = () => {
    try {
      sessionStorage.setItem("cf.brief", JSON.stringify({ text: brief.trim(), tpl: style }));
    } catch { /* noop */ }
    nav("studio");
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
        <div className="bkcomposer">
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); start(); } }}
            placeholder="Describe the film: who it's about, the role it should land, the mood…"
            rows={2}
            aria-label="Film brief"
          />
          <div className="bkcomprow" style={{ position: "relative" }}>
            <button className="bkplus" title="Open The Set to attach a resume" aria-label="Open The Set" onClick={start}>+</button>
            <div ref={styleRef} style={{ marginLeft: "auto", position: "relative" }}>
              <button className="bkstyle" onClick={() => setStyleOpen(!styleOpen)} aria-haspopup="menu" aria-expanded={styleOpen}>
                {style ? (TEMPLATES.find((t) => t.id === style)?.name || "Look") : "Look"} <span style={{ fontSize: 9 }}>▾</span>
              </button>
              {styleOpen && (
                <div className="bkmenu" style={{ position: "absolute", right: 0, bottom: "calc(100% + 8px)", minWidth: 210 }} role="menu">
                  <button onClick={() => { setStyle(null); setStyleOpen(false); }}><span className="mi">✦</span>Studio&apos;s choice</button>
                  <div className="msep" />
                  {TEMPLATES.map((t) => (
                    <button key={t.id} onClick={() => { setStyle(t.id); setStyleOpen(false); }}>
                      <span className="mi">{style === t.id ? "✓" : "◈"}</span>{t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="bksend" onClick={start} disabled={false} aria-label="Start filming">↑</button>
          </div>
        </div>
      </div>

      <div className="bkgallery">
        <div className="bktabs">
          <button className="tsearch" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}>◌ Search</button>
          <button className={`tab ${tab === "films" ? "on" : ""}`} onClick={() => setTab("films")}>My films</button>
          <button className={`tab ${tab === "recent" ? "on" : ""}`} onClick={() => setTab("recent")}>Recently viewed</button>
          <button className={`tab ${tab === "templates" ? "on" : ""}`} onClick={() => setTab("templates")}>Studio templates</button>
          <button className="browseall" onClick={() => nav(tab === "templates" ? "resources" : "films")}>Browse all →</button>
        </div>

        {tab !== "templates" && (
          <>
            {sites === null && <div className="bkempty mono">LOADING THE VAULT…</div>}
            {sites?.length === 0 && (
              <div className="bkempty">
                <span className="mono">THE VAULT IS EMPTY</span>
                Your first film starts above: describe it, or open The Set.
              </div>
            )}
            <div className="bkcards">
              {shown.map((s) => (
                <button key={s.siteId} className="bkfilm" onClick={() => nav(`film/${s.siteId}`)}>
                  <span className="bkthumb">
                    {s.status === "live" && s.previewUrl
                      ? <iframe title={`poster-${s.slug}`} src={s.previewUrl} sandbox="allow-scripts" loading="lazy" scrolling="no" tabIndex={-1} aria-hidden="true" />
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
              <button key={t.id} className="bkfilm" onClick={() => { try { sessionStorage.setItem("cf.brief", JSON.stringify({ text: "", tpl: t.id })); } catch { /* noop */ } nav("studio"); }}>
                <span className="bkthumb">
                  {t.html ? <iframe title={t.name} sandbox="allow-scripts" scrolling="no" srcDoc={t.html} loading="lazy" tabIndex={-1} aria-hidden="true" /> : <span className="ghost">{t.name.toUpperCase()}</span>}
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
