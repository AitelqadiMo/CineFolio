// Studio v3 — the workspace. Left: casting rail (resume PDF/txt/photo, smart
// questions, template + palette picker). Right: an integrated browser showing
// the site compiled INSTANTLY by the deterministic engine — no LLM in the loop.
// Premiere publishes the compiled HTML as an immutable release; the AI film
// pipeline ("Director's cut") is the optional premium act on top.
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { confetti, friendly } from "../ui.jsx";
import { parseProfile, compile, TEMPLATES } from "../templates/engine.js";

const POLL_MS = 8000, POLL_MAX = 220;

export default function Studio() {
  const { nav } = useAuth();
  // intake
  const [cvText, setCvText] = useState("");
  const [photo, setPhoto] = useState(null);
  const [q, setQ] = useState({ name: "", email: "", headline: "", website: "", focus: "" });
  const [tpl, setTpl] = useState("monolith");
  const [pal, setPal] = useState("jersey");
  const [customIdea, setCustomIdea] = useState("");
  const [view, setView] = useState("desktop");
  const [pdfBusy, setPdfBusy] = useState(false);
  // premiere + director's cut
  const [pub, setPub] = useState({ slug: "", busy: false, done: null });
  const [order, setOrder] = useState(null);
  const [orderStatus, setOrderStatus] = useState(null);
  const [err, setErr] = useState("");
  const premiereRef = useRef(null);
  const polls = useRef(0);

  // ---------- the engine: live compile on every keystroke ----------
  const profile = useMemo(() => parseProfile(cvText, {
    name: q.name || undefined, email: q.email || undefined,
    headline: q.headline || undefined, photo: photo || undefined,
    ...(q.website ? { links: { ...parseProfile(cvText).links, website: q.website } } : {}),
    ...(q.focus ? { summary: q.focus } : {}),
  }), [cvText, q, photo]);
  const html = useMemo(() => compile(tpl, pal, profile), [tpl, pal, profile]);
  const ready = cvText.trim().length > 60 || q.name;

  // ---------- uploads ----------
  const onResume = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    setErr("");
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
      setPdfBusy(true);
      try {
        const pdfjs = window.pdfjsLib;
        if (!pdfjs) throw new Error("PDF reader still loading — try again in a second.");
        pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
        const buf = await f.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        let text = "";
        for (let i = 1; i <= Math.min(doc.numPages, 6); i++) {
          const page = await doc.getPage(i);
          const tc = await page.getTextContent();
          let last = null;
          for (const it of tc.items) {
            if (last !== null && Math.abs(it.transform[5] - last) > 4) text += "\n";
            text += it.str + " ";
            last = it.transform[5];
          }
          text += "\n";
        }
        setCvText(text.replace(/[ \t]+\n/g, "\n").slice(0, 20000));
      } catch (e2) { setErr(friendly(e2.message)); }
      finally { setPdfBusy(false); }
    } else {
      const rd = new FileReader();
      rd.onload = () => setCvText(String(rd.result).slice(0, 20000));
      rd.readAsText(f);
    }
  };
  const onPhoto = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => setPhoto(rd.result);
    rd.readAsDataURL(f);
  };

  // ---------- premiere (deterministic engine output) ----------
  const premiere = async () => {
    setErr(""); setPub({ ...pub, busy: true });
    try {
      const slug = pub.slug || (profile.name || "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const site = await api.createSite({ slug, title: profile.name });
      const r = await api.publish(site.site.siteId, { html });
      setPub({ slug, busy: false, done: { ...r, slug: site.site.slug } });
      setTimeout(() => confetti(premiereRef.current || undefined), 60);
    } catch (e2) { setErr(friendly(e2.message)); setPub({ ...pub, busy: false }); }
  };

  // ---------- director's cut (AI film pipeline on top) ----------
  const directorsCut = async () => {
    setErr("");
    try {
      const r = await api.generate({
        email: profile.email || q.email, name: profile.name, role: "engineer",
        cvText: cvText || `${profile.name} — ${profile.headline}`,
        template: tpl, palette: pal, customIdea,
      });
      setOrder(r); setOrderStatus(r.production ? "queued" : "preview_only");
    } catch (e2) { setErr(friendly(e2.message)); }
  };

  useEffect(() => {
    if (!order?.production || !["queued", "filming"].includes(orderStatus)) return;
    polls.current = 0;
    const t = setInterval(async () => {
      polls.current += 1;
      try {
        const s = await api.orderStatus(order.orderId);
        if (["ready", "dispatch_failed", "human_review"].includes(s.status)) { clearInterval(t); setOrderStatus(s.status); }
        else if (s.status === "filming") setOrderStatus("filming");
        else if (polls.current >= POLL_MAX) { clearInterval(t); setOrderStatus("timeout"); }
      } catch { /* transient */ }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [order, orderStatus]);

  const template = TEMPLATES.find((t) => t.id === tpl);

  return (
    <div className="workspace" ref={premiereRef}>
      {/* ---------------- casting rail ---------------- */}
      <aside className="rail">
        <div className="railsec">
          <div className="mono railh">01 · CAST</div>
          <label className="uploadrow" htmlFor="cvUp">
            {pdfBusy ? <span className="spin" /> : <span className="upic">📄</span>}
            <span>{cvText ? "Resume loaded ✓ — replace" : "Upload resume (PDF or .txt)"}</span>
            <input id="cvUp" type="file" accept=".pdf,.txt,text/plain,application/pdf" onChange={onResume} hidden />
          </label>
          <label className="uploadrow" htmlFor="phUp">
            {photo ? <img className="upthumb" src={photo} alt="" /> : <span className="upic">🎞️</span>}
            <span>{photo ? "Headshot loaded ✓ — replace" : "Add a headshot (optional)"}</span>
            <input id="phUp" type="file" accept="image/*" onChange={onPhoto} hidden />
          </label>
          <textarea value={cvText} onChange={(e) => setCvText(e.target.value)} placeholder="…or paste your CV text here. The engine reads sections, years, links and skills automatically." style={{ minHeight: 90, marginTop: 10 }} />
        </div>

        <div className="railsec">
          <div className="mono railh">02 · THE QUESTIONS THAT MATTER</div>
          <input value={q.name} onChange={(e) => setQ({ ...q, name: e.target.value })} placeholder="Name (as it should appear)" />
          <input value={q.headline} onChange={(e) => setQ({ ...q, headline: e.target.value })} placeholder="Headline — e.g. Platform Engineer, AWS certified" />
          <input value={q.email} onChange={(e) => setQ({ ...q, email: e.target.value })} placeholder="Contact email" />
          <input value={q.website} onChange={(e) => setQ({ ...q, website: e.target.value })} placeholder="Website / domain (optional)" />
          <textarea value={q.focus} onChange={(e) => setQ({ ...q, focus: e.target.value })} placeholder="One paragraph about you — what should a visitor remember?" style={{ minHeight: 64 }} />
        </div>

        <div className="railsec">
          <div className="mono railh">03 · THE LOOK</div>
          {TEMPLATES.map((t) => (
            <div key={t.id} className={`tplcard ${tpl === t.id ? "on" : ""}`} onClick={() => { setTpl(t.id); setPal(t.palettes[0].id); }}>
              <div>
                <b>{t.name}</b>
                <div className="tplblurb">{t.blurb}</div>
              </div>
              {tpl === t.id && (
                <div className="pals" onClick={(e) => e.stopPropagation()}>
                  {t.palettes.map((p2) => (
                    <button key={p2.id} title={p2.label} className={`paldot ${pal === p2.id ? "on" : ""}`}
                      style={{ background: `linear-gradient(135deg, ${p2.vars[2] || p2.vars[1]}, ${p2.vars[3] || p2.vars[2]})` }}
                      onClick={() => setPal(p2.id)} />
                  ))}
                </div>
              )}
            </div>
          ))}
          <textarea value={customIdea} onChange={(e) => setCustomIdea(e.target.value)} placeholder="Custom idea for the Director's Cut — lighting, mood, references… (goes to the AI film pipeline)" style={{ minHeight: 58, marginTop: 8 }} />
          <div className="mono" style={{ marginTop: 10, textTransform: "none", letterSpacing: ".05em" }}>
            Inspiration: a real premiere → <a href="https://www.aitelqadi.dev" target="_blank" rel="noopener noreferrer">aitelqadi.dev</a>
          </div>
        </div>

        <div className="railsec">
          <div className="mono railh">04 · PREMIERE</div>
          <input value={pub.slug} onChange={(e) => setPub({ ...pub, slug: e.target.value })} placeholder={(profile.name || "your-name").toLowerCase().replace(/[^a-z0-9]+/g, "-")} />
          <div className="btnrow" style={{ marginTop: 12 }}>
            <button className="btn primary" disabled={!ready || pub.busy || !!pub.done} onClick={premiere}>
              {pub.busy ? <span className="spin" /> : null}{pub.done ? "Premiered" : "Premiere this site"}
            </button>
            <button className="btn ghost" disabled={!ready || !!order} onClick={directorsCut} title="AI film scenes + bespoke build by the studio pipeline">
              {order ? "Director's cut ordered" : "+ Director's cut"}
            </button>
          </div>
          {order && (
            <div className="mono" style={{ marginTop: 10, textTransform: "none", letterSpacing: ".05em" }}>
              {orderStatus === "filming" ? "🎥 Cameras rolling — the pipeline is filming your cut." :
               orderStatus === "ready" ? "🎬 Director's cut delivered — check your email / My Films." :
               ["dispatch_failed", "human_review", "timeout"].includes(orderStatus) ? "The studio is at capacity — your cut will arrive by email." :
               `Order ${order.orderId.slice(0, 8)} queued in the pipeline.`}
            </div>
          )}
          {err && <div className="err">{err}</div>}
          {pub.done && (
            <div className="premiere" style={{ marginTop: 12 }}>
              <div className="mq">Now screening — <em>release #{pub.done.release}</em></div>
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a className="btn ghost" href={pub.done.url} target="_blank" rel="noopener noreferrer">Open live URL</a>
                <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(pub.done.url)}>Copy link</button>
                <a className="btn ghost" onClick={() => nav("dashboard")} style={{ cursor: "pointer" }}>My Films</a>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ---------------- the integrated browser ---------------- */}
      <section className="stage">
        <div className="browser">
          <div className="browserbar">
            <span className="bdot" style={{ background: "#ff5f57" }} /><span className="bdot" style={{ background: "#febc2e" }} /><span className="bdot" style={{ background: "#28c840" }} />
            <div className="burl mono">{(pub.slug || (profile.name || "your-name").toLowerCase().replace(/[^a-z0-9]+/g, "-"))}.cinefolio.site</div>
            <div className="bviews">
              <button className={view === "desktop" ? "on" : ""} onClick={() => setView("desktop")} title="Desktop">▭</button>
              <button className={view === "mobile" ? "on" : ""} onClick={() => setView("mobile")} title="Mobile">▯</button>
            </div>
          </div>
          <div className="stageframe">
            {ready ? (
              <iframe title="preview" sandbox="allow-scripts" srcDoc={html} style={view === "mobile" ? { width: 390, margin: "0 auto", display: "block", borderInline: "1px solid var(--faint)" } : undefined} />
            ) : (
              <div className="stageempty">
                <div className="mono">THE SCREENING ROOM</div>
                <p>Upload a resume or start typing on the left.<br />The site renders here <b>instantly</b> — no waiting, no AI roulette.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
