// Studio v4 — THE SET. A production floor, not a form:
// slate bar with live timecode + take counter, casting acts on the left,
// LIVE template posters compiled from the client's own data, film-stock
// palette chips, and a studio monitor that re-renders on every direction.
// The engine is deterministic — every frame on this set is real output.
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { confetti, friendly } from "../ui.jsx";
import { parseProfile, compile, TEMPLATES } from "../templates/engine.js";

const POLL_MS = 8000, POLL_MAX = 220;

export default function Studio() {
  const { nav } = useAuth();
  // intake
  const [cvRaw, setCvRaw] = useState("");
  const [cvText, setCvText] = useState(""); // debounced
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
  // set dressing
  const [take, setTake] = useState(1);
  const [tc, setTc] = useState("00:00:00");
  const premiereRef = useRef(null);
  const polls = useRef(0);

  // debounce the heavy text; small fields stay live
  useEffect(() => { const t = setTimeout(() => setCvText(cvRaw), 220); return () => clearTimeout(t); }, [cvRaw]);

  // studio clock + take counter
  useEffect(() => {
    const t0 = Date.now();
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      setTc(`${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // ---------- the engine (defensive: a compile error can never drop the set) ----------
  const profile = useMemo(() => {
    try {
      return parseProfile(cvText, {
        name: q.name || undefined, email: q.email || undefined,
        headline: q.headline || undefined, photo: photo || undefined,
        ...(q.website ? { links: { ...parseProfile(cvText).links, website: q.website } } : {}),
        ...(q.focus ? { summary: q.focus } : {}),
      });
    } catch { return parseProfile("", { name: q.name || "Your Name" }); }
  }, [cvText, q, photo]);

  const html = useMemo(() => {
    try { return compile(tpl, pal, profile); } catch (e) { console.error(e); return "<!DOCTYPE html><html><body style='font-family:monospace;padding:40px'>compile error — adjust the brief</body></html>"; }
  }, [tpl, pal, profile]);

  // live posters: each template rendered with the CLIENT'S data
  const posters = useMemo(() => TEMPLATES.map((t) => {
    try { return { id: t.id, html: compile(t.id, t.id === tpl ? pal : t.palettes[0].id, profile) }; }
    catch { return { id: t.id, html: "" }; }
  }), [profile, tpl, pal]);

  useEffect(() => { setTake((n) => n + 1); }, [html]); // every recompile is a new take
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
          const tcn = await page.getTextContent();
          let last = null;
          for (const it of tcn.items) {
            if (last !== null && Math.abs(it.transform[5] - last) > 4) text += "\n";
            text += it.str + " ";
            last = it.transform[5];
          }
          text += "\n";
        }
        setCvRaw(text.replace(/[ \t]+\n/g, "\n").slice(0, 20000));
      } catch (e2) { setErr(friendly(e2.message)); }
      finally { setPdfBusy(false); }
    } else {
      const rd = new FileReader();
      rd.onload = () => setCvRaw(String(rd.result).slice(0, 20000));
      rd.readAsText(f);
    }
  };
  const onPhoto = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => setPhoto(rd.result);
    rd.readAsDataURL(f);
  };

  // ---------- premiere ----------
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

  const slug = pub.slug || (profile.name || "your-name").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  return (
    <div ref={premiereRef}>
      {/* ---------------- the slate ---------------- */}
      <div className="slate">
        <div className="slateleft">
          <span className="clap" aria-hidden="true"><i /><i /><i /><i /></span>
          <span className="mono slbl">CINEFOLIO PRODUCTION Nº {String(take).padStart(3, "0")}</span>
        </div>
        <div className="slatemid mono">
          <span>SCENE <b>STUDIO</b></span>
          <span>TAKE <b>{take}</b></span>
          <span className="tcode"><i className="recdot" /> {tc}</span>
        </div>
        <div className="mono slamp">SET · <b style={{ color: "#58e0a5" }}>LIT</b></div>
      </div>

      <div className="workspace">
        {/* ---------------- casting rail ---------------- */}
        <aside className="rail">
          <div className="railsec act">
            <div className="acthead"><span className="actno">I</span><div><b>The Cast</b><span className="actsub">who this film is about</span></div></div>
            <label className="uploadrow" htmlFor="cvUp">
              {pdfBusy ? <span className="spin" /> : <span className="upic">◉</span>}
              <span>{cvRaw ? "RESUME LOADED ✓ — REPLACE" : "DROP THE RESUME · PDF OR TXT"}</span>
              <input id="cvUp" type="file" accept=".pdf,.txt,text/plain,application/pdf" onChange={onResume} hidden />
            </label>
            <label className="uploadrow" htmlFor="phUp">
              {photo ? <img className="upthumb" src={photo} alt="" /> : <span className="upic">✦</span>}
              <span>{photo ? "HEADSHOT LOADED ✓ — REPLACE" : "ADD A HEADSHOT · OPTIONAL"}</span>
              <input id="phUp" type="file" accept="image/*" onChange={onPhoto} hidden />
            </label>
            <textarea value={cvRaw} onChange={(e) => setCvRaw(e.target.value)} placeholder="…or paste the CV. The engine reads sections, years, links and skills on its own." style={{ minHeight: 84, marginTop: 8 }} />
          </div>

          <div className="railsec act">
            <div className="acthead"><span className="actno">II</span><div><b>Direction</b><span className="actsub">the questions that matter</span></div></div>
            <input value={q.name} onChange={(e) => setQ({ ...q, name: e.target.value })} placeholder="Name on the marquee" />
            <input value={q.headline} onChange={(e) => setQ({ ...q, headline: e.target.value })} placeholder="Headline — e.g. Platform Engineer, AWS certified" />
            <input value={q.email} onChange={(e) => setQ({ ...q, email: e.target.value })} placeholder="Contact email" />
            <input value={q.website} onChange={(e) => setQ({ ...q, website: e.target.value })} placeholder="Website / domain (optional)" />
            <textarea value={q.focus} onChange={(e) => setQ({ ...q, focus: e.target.value })} placeholder="One paragraph a visitor should remember." style={{ minHeight: 58 }} />
          </div>

          <div className="railsec act">
            <div className="acthead"><span className="actno">III</span><div><b>The Look</b><span className="actsub">three worlds, rendered with your data — live</span></div></div>
            <div className="posterrow">
              {TEMPLATES.map((t, i) => (
                <button key={t.id} className={`posterpick ${tpl === t.id ? "on" : ""}`} onClick={() => { setTpl(t.id); setPal(t.palettes[0].id); }} title={t.blurb}>
                  <span className="posterframe">
                    {ready && posters[i].html
                      ? <iframe title={t.name} tabIndex={-1} sandbox="allow-scripts" scrolling="no" srcDoc={posters[i].html} loading="lazy" />
                      : <span className="posterghost mono">{t.name.split(" ").pop().toUpperCase()}</span>}
                  </span>
                  <span className="posterlbl mono">{t.name}</span>
                </button>
              ))}
            </div>
            <div className="stockrow">
              <span className="mono" style={{ fontSize: 8.5 }}>FILM STOCK</span>
              {(TEMPLATES.find((t) => t.id === tpl) || TEMPLATES[0]).palettes.map((p2) => (
                <button key={p2.id} className={`stock ${pal === p2.id ? "on" : ""}`} onClick={() => setPal(p2.id)}>
                  <i style={{ background: `linear-gradient(135deg, ${p2.vars[2] || p2.vars[1]}, ${p2.vars[3] || p2.vars[2]})` }} />{p2.label}
                </button>
              ))}
            </div>
            <textarea value={customIdea} onChange={(e) => setCustomIdea(e.target.value)} placeholder="Custom vision for the Director's Cut — lighting, mood, references… (the AI film pipeline reads this)" style={{ minHeight: 54, marginTop: 10 }} />
            <div className="mono" style={{ marginTop: 8, textTransform: "none", letterSpacing: ".05em", fontSize: 10 }}>
              Reference screening: <a href="https://www.aitelqadi.dev" target="_blank" rel="noopener noreferrer">aitelqadi.dev ↗</a>
            </div>
          </div>

          <div className="railsec act gold">
            <div className="acthead"><span className="actno">IV</span><div><b>Premiere</b><span className="actsub">one click, on our infrastructure</span></div></div>
            <input value={pub.slug} onChange={(e) => setPub({ ...pub, slug: e.target.value })} placeholder={slug} />
            <div className="btnrow" style={{ marginTop: 10 }}>
              <button className="btn marquee" disabled={!ready || pub.busy || !!pub.done} onClick={premiere}>
                {pub.busy ? <span className="spin" /> : "◈ "}{pub.done ? "PREMIERED" : "PREMIERE THIS SITE"}
              </button>
              <button className="btn ghost" disabled={!ready || !!order} onClick={directorsCut} title="Identity AI film scenes + bespoke build by the studio pipeline">
                {order ? "DIRECTOR'S CUT ORDERED" : "+ DIRECTOR'S CUT"}
              </button>
            </div>
            {order && (
              <div className="mono" style={{ marginTop: 10, textTransform: "none", letterSpacing: ".05em", fontSize: 10.5 }}>
                {orderStatus === "filming" ? "🎥 Cameras rolling — the pipeline is filming your cut." :
                 orderStatus === "ready" ? "🎬 Director's cut delivered — check My Films." :
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

        {/* ---------------- the monitor ---------------- */}
        <section className="stage">
          <div className="browser monitor">
            <div className="browserbar">
              <span className="bdot" style={{ background: "#ff5f57" }} /><span className="bdot" style={{ background: "#febc2e" }} /><span className="bdot" style={{ background: "#28c840" }} />
              <div className="burl mono">{slug}.cinefolio.site</div>
              <div className="bviews">
                <button className={view === "desktop" ? "on" : ""} onClick={() => setView("desktop")} title="Desktop">▭</button>
                <button className={view === "mobile" ? "on" : ""} onClick={() => setView("mobile")} title="Mobile">▯</button>
              </div>
            </div>
            <div className="stageframe">
              {ready ? (
                <iframe key={view} title="preview" sandbox="allow-scripts" srcDoc={html} style={view === "mobile" ? { width: 390, margin: "0 auto", display: "block", borderInline: "1px solid var(--faint)" } : undefined} />
              ) : (
                <div className="stageempty">
                  <div className="lensbig" />
                  <div className="mono" style={{ marginTop: 18 }}>THE SCREENING ROOM · DARK</div>
                  <p>Drop a resume on the left and the lights come up.<br />Your site renders here <b>as you type</b> — no waiting, no AI roulette.</p>
                </div>
              )}
            </div>
            <div className="monfoot mono">
              <span><i className="recdot" /> REC · TAKE {take}</span>
              <span>ENGINE · DETERMINISTIC · 0 LLM CALLS</span>
              <span>{view.toUpperCase()} · {(profile.skills || []).length} SKILLS CAST</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
