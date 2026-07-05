// Studio v4 — THE SET. A production floor, not a form:
// slate bar with live timecode + take counter, casting acts on the left,
// LIVE template posters compiled from the client's own data, film-stock
// palette chips, and a studio monitor that re-renders on every direction.
// The engine is deterministic — every frame on this set is real output.
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { confetti, friendly } from "../ui.jsx";
import { parseProfile, compile, TEMPLATES, DEFAULT_SECTIONS } from "../templates/engine.js";

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
  const [projects, setProjects] = useState([]);
  const [testimonials, setTestimonials] = useState([]);
  const [services, setServices] = useState([]);
  const [sections, setSections] = useState({ ...DEFAULT_SECTIONS });
  const [openProj, setOpenProj] = useState(null);
  const [railTab, setRailTab] = useState("content"); // content | design | publish
  const [mobileMode, setMobileMode] = useState("edit"); // edit | preview (small screens)
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

  const applyDraft = (d) => {
    if (!d) return;
    if (d.cvRaw) setCvRaw(d.cvRaw);
    if (d.q) setQ(d.q);
    if (d.projects) setProjects(d.projects);
    if (d.testimonials) setTestimonials(d.testimonials);
    if (d.services) setServices(d.services);
    if (d.sections) setSections({ ...DEFAULT_SECTIONS, ...d.sections });
    if (d.tpl) setTpl(d.tpl);
    if (d.pal) setPal(d.pal);
  };

  // draft autosave — local instantly, server-synced (newer copy wins on load)
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem("cf.studioDraft") || "null");
      if (d) {
        if (d.cvRaw) setCvRaw(d.cvRaw);
        if (d.q) setQ(d.q);
        if (d.projects) setProjects(d.projects);
        if (d.testimonials) setTestimonials(d.testimonials);
        if (d.services) setServices(d.services);
        if (d.sections) setSections({ ...DEFAULT_SECTIONS, ...d.sections });
        if (d.tpl) setTpl(d.tpl);
        if (d.pal) setPal(d.pal);
      }
    } catch { /* fresh start */ }
    // then ask the server for a newer copy (cross-device continuity)
    api.getDraft().then((r) => {
      if (!r.draft) return;
      const local = JSON.parse(localStorage.getItem("cf.studioDraft") || "null");
      if (!local?.savedAt || (r.updatedAt && r.updatedAt > local.savedAt)) applyDraft(r.draft);
    }).catch(() => { /* offline is fine */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const draft = { cvRaw, q, projects, testimonials, services, sections, tpl, pal };
    const t = setTimeout(() => {
      try { localStorage.setItem("cf.studioDraft", JSON.stringify({ ...draft, savedAt: new Date().toISOString() })); } catch { /* full */ }
    }, 500);
    // server copy: strip bulky inline images (CDN URLs stay), 300KB item budget
    const t2 = setTimeout(() => {
      const slim = JSON.parse(JSON.stringify(draft));
      if (String(slim.q?.photo || "").startsWith("data:")) delete slim.q.photo;
      (slim.projects || []).forEach((p2) => { if (String(p2.cover || "").startsWith("data:")) delete p2.cover; });
      api.putDraft(slim).catch(() => { /* silent — local copy is safe */ });
    }, 2500);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [cvRaw, q, projects, testimonials, services, sections, tpl, pal]);

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

  const fullProfile = useMemo(() => ({
    ...profile,
    ...(projects.length ? { projects } : {}),
    testimonials, services,
  }), [profile, projects, testimonials, services]);

  const html = useMemo(() => {
    try { return compile(tpl, pal, fullProfile, { sections }); } catch (e) { console.error(e); return "<!DOCTYPE html><html><body style='font-family:monospace;padding:40px'>compile error — adjust the brief</body></html>"; }
  }, [tpl, pal, fullProfile, sections]);

  // live posters: each template rendered with the CLIENT'S data
  const posters = useMemo(() => TEMPLATES.map((t) => {
    try { return { id: t.id, html: compile(t.id, t.id === tpl ? pal : t.palettes[0].id, fullProfile, { sections }) }; }
    catch { return { id: t.id, html: "" }; }
  }), [fullProfile, tpl, pal, sections]);

  useEffect(() => { setTake((n) => n + 1); }, [html]); // every recompile is a new take
  const ready = cvText.trim().length > 60 || q.name;

  // ---------- media: compress client-side, upload via presigned PUT ----------
  const uploadImage = (file) => new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL("image/jpeg", 0.82);
      try {
        const p = await api.media("image/jpeg");
        const blob = await (await fetch(dataUrl)).blob();
        if (blob.size > p.maxBytes) throw new Error("too large");
        const up = await fetch(p.uploadUrl, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: blob });
        if (!up.ok) throw new Error("upload failed");
        resolve(p.publicUrl);
      } catch { resolve(dataUrl); } // preview + publish still work, embedded inline
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });

  const proj = (i, patch) => setProjects(projects.map((p2, k) => (k === i ? { ...p2, ...patch } : p2)));
  const moveProj = (i, d) => {
    const a = [...projects]; const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]]; setProjects(a);
  };

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
  const onPhoto = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const url = await uploadImage(f);
    if (url) setPhoto(url);
  };

  // ---------- premiere (live) or stage (draft release, preview link, no flip) ----------
  const [stageMode, setStageMode] = useState(false);
  const premiere = async () => {
    setErr(""); setPub({ ...pub, busy: true });
    try {
      const slug = pub.slug || (profile.name || "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const site = await api.createSite({ slug, title: profile.name });
      const r = await api.publish(site.site.siteId, { html, ...(stageMode ? { stage: true } : {}) });
      setPub({ slug, busy: false, done: { ...r, slug: site.site.slug, url: r.url || r.previewUrl } });
      if (!stageMode) setTimeout(() => confetti(premiereRef.current || undefined), 60);
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
      if (r.production) {
        try { localStorage.setItem("cf.activeOrder", JSON.stringify({ orderId: r.orderId, name: profile.name })); } catch { /* noop */ }
      }
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

      <div className="mobiletoggle">
        <button className={mobileMode === "edit" ? "on" : ""} onClick={() => setMobileMode("edit")}>EDIT</button>
        <button className={mobileMode === "preview" ? "on" : ""} onClick={() => setMobileMode("preview")}>PREVIEW</button>
      </div>
      <div className={`workspace mm-${mobileMode}`}>
        {/* ---------------- casting rail ---------------- */}
        <aside className="rail">
          <div className="railtabs">
            <button className={railTab === "content" ? "on" : ""} onClick={() => setRailTab("content")}>Content</button>
            <button className={railTab === "design" ? "on" : ""} onClick={() => setRailTab("design")}>Design</button>
            <button className={railTab === "publish" ? "on" : ""} onClick={() => setRailTab("publish")}>Publish</button>
          </div>
          <div className={`railpanel ${railTab === "content" ? "" : "hid"}`}>
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
            <div className="acthead"><span className="actno">III</span><div><b>The Work</b><span className="actsub">guided case studies, the story not just screenshots</span></div></div>
            {projects.length === 0 && (
            <div className="projempty" onClick={() => { setProjects([{}]); setOpenProj(0); }}>
              <div className="mono" style={{ fontSize: 9, color: "var(--gold)" }}>NO SCENES YET</div>
              <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 4 }}>Your best work deserves a case study. Add the first project — we'll guide the story.</div>
            </div>
          )}
          {projects.map((pr, i) => (
              <div key={i} className={`projcard ${openProj === i ? "open" : ""}`}>
                <div className="projrow" onClick={() => setOpenProj(openProj === i ? null : i)}>
                  <b>{pr.name || `Project ${i + 1}`}</b>
                  <span className="projops" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => moveProj(i, -1)} title="Up">↑</button>
                    <button onClick={() => moveProj(i, 1)} title="Down">↓</button>
                    <button onClick={() => { setProjects(projects.filter((_, k) => k !== i)); setOpenProj(null); }} title="Remove">✕</button>
                  </span>
                </div>
                {openProj === i && (
                  <div className="projbody">
                    <label className="uploadrow" htmlFor={`cov${i}`} style={{ marginTop: 2 }}>
                      {pr.cover ? <img className="upthumb" src={pr.cover} alt="" style={{ borderRadius: 4 }} /> : <span className="upic">▦</span>}
                      <span>{pr.cover ? "COVER LOADED ✓ — REPLACE" : "COVER IMAGE"}</span>
                      <input id={`cov${i}`} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files[0]; if (!f) return; const u = await uploadImage(f); if (u) proj(i, { cover: u }); }} />
                    </label>
                    <input value={pr.name || ""} onChange={(e) => proj(i, { name: e.target.value })} placeholder="Project title" />
                    <input value={pr.summary || ""} onChange={(e) => proj(i, { summary: e.target.value })} placeholder="One-line summary, what a recruiter remembers" />
                    <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      <input value={pr.role || ""} onChange={(e) => proj(i, { role: e.target.value })} placeholder="Role" />
                      <input value={pr.timeline || ""} onChange={(e) => proj(i, { timeline: e.target.value })} placeholder="Timeline" />
                      <input value={pr.tools || ""} onChange={(e) => proj(i, { tools: e.target.value })} placeholder="Tools" />
                    </div>
                    <textarea value={pr.problem || ""} onChange={(e) => proj(i, { problem: e.target.value })} placeholder="The problem: what was broken, risky, or missing before you started?" style={{ minHeight: 48 }} />
                    <textarea value={pr.process || ""} onChange={(e) => proj(i, { process: e.target.value })} placeholder="The process: how you approached it, what you tried, what you decided." style={{ minHeight: 48 }} />
                    <textarea value={pr.results || ""} onChange={(e) => proj(i, { results: e.target.value })} placeholder="The results: numbers first — faster, cheaper, safer, adopted by…" style={{ minHeight: 48 }} />
                  </div>
                )}
              </div>
            ))}
            <button className="btn ghost" style={{ width: "100%", justifyContent: "center", marginTop: 4 }} onClick={() => { setProjects([...projects, {}]); setOpenProj(projects.length); }}>+ Add a project</button>
            <div className="mono railh" style={{ marginTop: 14 }}>SCENES ON / OFF</div>
            <div className="togglerow">
              {Object.keys(sections).map((k) => (
                <button key={k} className={`stock ${sections[k] ? "on" : ""}`} onClick={() => setSections({ ...sections, [k]: !sections[k] })}>{k}</button>
              ))}
            </div>
            {sections.testimonials && (
              <div style={{ marginTop: 10 }}>
                {testimonials.map((t, i) => (
                  <div key={i} className="grid" style={{ gridTemplateColumns: "1fr 1fr auto", gap: 6, marginBottom: 6 }}>
                    <input value={t.quote} onChange={(e) => setTestimonials(testimonials.map((x, k) => (k === i ? { ...x, quote: e.target.value } : x)))} placeholder="Quote" />
                    <input value={t.who} onChange={(e) => setTestimonials(testimonials.map((x, k) => (k === i ? { ...x, who: e.target.value } : x)))} placeholder="Who said it" />
                    <button className="btn ghost" style={{ padding: "6px 10px" }} onClick={() => setTestimonials(testimonials.filter((_, k) => k !== i))}>✕</button>
                  </div>
                ))}
                <button className="btn ghost" style={{ fontSize: 9, padding: "7px 12px" }} onClick={() => setTestimonials([...testimonials, { quote: "", who: "" }])}>+ testimonial</button>
              </div>
            )}
            {sections.services && (
              <div style={{ marginTop: 10 }}>
                {services.map((sv, i) => (
                  <div key={i} className="grid" style={{ gridTemplateColumns: "1fr 1fr auto", gap: 6, marginBottom: 6 }}>
                    <input value={sv.name} onChange={(e) => setServices(services.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} placeholder="Service" />
                    <input value={sv.desc} onChange={(e) => setServices(services.map((x, k) => (k === i ? { ...x, desc: e.target.value } : x)))} placeholder="What it includes" />
                    <button className="btn ghost" style={{ padding: "6px 10px" }} onClick={() => setServices(services.filter((_, k) => k !== i))}>✕</button>
                  </div>
                ))}
                <button className="btn ghost" style={{ fontSize: 9, padding: "7px 12px" }} onClick={() => setServices([...services, { name: "", desc: "" }])}>+ service</button>
              </div>
            )}
          </div>

          <div className="railsec act">
            <div className="acthead"><span className="actno">IV</span><div><b>The Look</b><span className="actsub">three worlds, rendered with your data — live</span></div></div>
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
            <div className="acthead"><span className="actno">V</span><div><b>Premiere</b><span className="actsub">one click, on our infrastructure</span></div></div>
            <input value={pub.slug} onChange={(e) => setPub({ ...pub, slug: e.target.value })} placeholder={slug} />
            <label className="mono" style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 0", cursor: "pointer", fontSize: 9.5 }}>
              <input type="checkbox" checked={stageMode} onChange={(e) => setStageMode(e.target.checked)} style={{ width: "auto" }} />
              STAGE AS DRAFT — PREVIEW LINK ONLY, GO LIVE FROM MY FILMS
            </label>
            <div className="btnrow" style={{ marginTop: 10 }}>
              <button className="btn marquee" disabled={!ready || pub.busy || !!pub.done} onClick={premiere}>
                {pub.busy ? <span className="spin" /> : "◈ "}{pub.done ? (stageMode ? "STAGED" : "PREMIERED") : stageMode ? "STAGE THIS CUT" : "PREMIERE THIS SITE"}
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
                <div className="mq">{pub.done.staged ? <>In the can — <em>staged cut #{pub.done.release}</em></> : <>Now screening — <em>release #{pub.done.release}</em></>}</div>
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <a className="btn ghost" href={pub.done.url} target="_blank" rel="noopener noreferrer">Open live URL</a>
                  <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(pub.done.url)}>Copy link</button>
                  <a className="btn ghost" onClick={() => nav("dashboard")} style={{ cursor: "pointer" }}>My Films</a>
                </div>
              </div>
            )}
          </div>
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
