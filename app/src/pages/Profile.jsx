// Profile v1: THE DOSSIER. The client's portfolio source of truth. Every film
// the studio casts is drawn from here, so this page is the single record: an
// identity, a story, the work history, skills, credentials, schooling, and the
// links that prove it. A smart-fill reads a resume once so nobody types from
// scratch, but manual edits are sacred: the merge only ever fills blanks.
// Persistence is belt-and-braces: studio sync when it is wired, localStorage
// always, and never a dead end.
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { SplitTitle, Skeleton, friendly } from "../ui.jsx";
import { parseResumeToProfile, EMPTY_PROFILE, mergeProfile } from "../templates/profileParse.js";

const LS_KEY = "cf.portfolioProfile";
const LANG_LEVELS = ["Native", "Fluent", "Professional", "Basic"];

const loadLocal = () => {
  try {
    const d = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    return d ? mergeProfile(d, EMPTY_PROFILE) : null;
  } catch { return null; }
};

// completeness: fraction of the nine dossier sections that carry any content
function completeness(p) {
  const has = [
    !!(p.identity.name && p.identity.headline),
    !!p.identity.email,
    !!p.story,
    p.experience.length > 0,
    p.skills.length > 0,
    p.certifications.length > 0,
    p.education.length > 0,
    p.languages.length > 0,
    !!(p.links.github || p.links.linkedin || p.links.website),
  ];
  return Math.round((has.filter(Boolean).length / has.length) * 100);
}

export default function Profile() {
  const { nav } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [paste, setPaste] = useState("");
  const [fillNote, setFillNote] = useState("");
  const [saveState, setSaveState] = useState(""); // "studio" | "local" | ""
  const [skillDraft, setSkillDraft] = useState("");
  const firstSave = useRef(true);

  // ---------- load: studio first, localStorage as the safety net ----------
  useEffect(() => {
    let alive = true;
    const settle = (p) => { if (alive) { setProfile(mergeProfile(p, EMPTY_PROFILE)); setLoaded(true); } };
    (async () => {
      try {
        const r = api.getProfile ? await api.getProfile() : null;
        const p = r?.profile || r;
        if (p && typeof p === "object") return settle(p);
        throw new Error("empty");
      } catch {
        settle(loadLocal() || EMPTY_PROFILE);
      }
    })();
    return () => { alive = false; };
  }, []);

  // ---------- debounced autosave: local mirror always, studio when wired ----------
  useEffect(() => {
    if (!profile || !loaded) return;
    if (firstSave.current) { firstSave.current = false; return; }
    const t = setTimeout(async () => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(profile)); } catch { /* storage full */ }
      try {
        if (!api.putProfile) throw new Error("not wired");
        await api.putProfile(profile);
        setSaveState("studio");
      } catch {
        setSaveState("local");
      }
    }, 800);
    return () => clearTimeout(t);
  }, [profile, loaded]);

  const pct = useMemo(() => (profile ? completeness(profile) : 0), [profile]);

  // ---------- field setters ----------
  const set = (patch) => setProfile((p) => ({ ...p, ...patch }));
  const setId = (patch) => setProfile((p) => ({ ...p, identity: { ...p.identity, ...patch } }));
  const setLink = (patch) => setProfile((p) => ({ ...p, links: { ...p.links, ...patch } }));

  const applyParsed = (text) => {
    const parsed = parseResumeToProfile(text);
    setProfile((p) => mergeProfile(p, parsed));
    setFillNote(
      `Filled ${parsed.experience.length} experience ${parsed.experience.length === 1 ? "entry" : "entries"}, ` +
      `${parsed.skills.length} skills, ${parsed.certifications.length} certifications. Blanks only; your edits stayed.`
    );
  };

  // ---------- resume smart-fill (PDF text extraction copied from Studio) ----------
  const onResume = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    setErr(""); setFillNote("");
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
      setPdfBusy(true);
      try {
        const pdfjs = window.pdfjsLib;
        if (!pdfjs) throw new Error("PDF reader still loading. Try again in a second.");
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
        applyParsed(text.replace(/[ \t]+\n/g, "\n").slice(0, 20000));
      } catch (e2) { setErr(friendly(e2.message)); }
      finally { setPdfBusy(false); }
    } else {
      const rd = new FileReader();
      rd.onload = () => applyParsed(String(rd.result).slice(0, 20000));
      rd.readAsText(f);
    }
  };

  // ---------- photo upload (presigned PUT copied from Studio uploadImage) ----------
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
      } catch { resolve(dataUrl); }
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
  const onPhoto = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const url = await uploadImage(f);
    if (url) setId({ photo: url });
  };

  // ---------- experience list editor (add / remove / reorder like projops) ----------
  const setExp = (i, patch) => set({ experience: profile.experience.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const addExp = () => set({ experience: [...profile.experience, { role: "", company: "", start: "", end: "", highlights: [] }] });
  const rmExp = (i) => set({ experience: profile.experience.filter((_, k) => k !== i) });
  const moveExp = (i, d) => {
    const a = [...profile.experience]; const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]]; set({ experience: a });
  };

  // ---------- generic row list helpers (certifications / education / languages) ----------
  const rowSet = (key, i, patch) => set({ [key]: profile[key].map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const rowAdd = (key, blank) => set({ [key]: [...profile[key], blank] });
  const rowRm = (key, i) => set({ [key]: profile[key].filter((_, k) => k !== i) });

  // ---------- skills chips ----------
  const addSkill = () => {
    const v = skillDraft.trim();
    if (!v) return;
    if (!profile.skills.some((s) => s.toLowerCase() === v.toLowerCase())) set({ skills: [...profile.skills, v] });
    setSkillDraft("");
  };
  const rmSkill = (i) => set({ skills: profile.skills.filter((_, k) => k !== i) });

  if (!profile) {
    return (
      <>
        <div className="pagehead" data-scene="SCENE 05 · THE DOSSIER">
          <SplitTitle text="My" serif="profile" />
          <p className="sub">This profile is the single source every film is cast from.</p>
        </div>
        {err ? <div className="err">{err}</div> : <Skeleton h={320} style={{ maxWidth: 620 }} />}
      </>
    );
  }

  return (
    <>
      <div className="pagehead" data-scene="SCENE 05 · THE DOSSIER">
        <SplitTitle text="My" serif="profile" />
        <p className="sub">This profile is the single source every film is cast from.</p>
      </div>

      {/* ---------- completeness meter ---------- */}
      <div style={{ maxWidth: 720, marginBottom: 18 }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: ".14em", marginBottom: 6 }}>DOSSIER COMPLETENESS · {pct}%</div>
        <div style={{ height: 6, borderRadius: 6, background: "var(--faint, rgba(0,0,0,.08))", overflow: "hidden" }} aria-hidden="true">
          <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #C8102E, #E63946, #D9A441)", transition: "width .4s ease" }} />
        </div>
        <div className="mono" style={{ fontSize: 9.5, letterSpacing: ".05em", textTransform: "none", marginTop: 6, color: "var(--dim)" }}>
          {saveState === "studio" ? "Saved to the studio ✓" : saveState === "local" ? "Saved on this device; studio sync pending" : "Autosaves as you edit"}
        </div>
      </div>

      {err && <div className="err" style={{ maxWidth: 720, marginBottom: 16 }}>{err}</div>}

      <div className="acctcol" style={{ maxWidth: 720 }}>

        {/* ---------- smart-fill ---------- */}
        <section className="asec" aria-label="Resume smart fill">
          <div className="scene-hd">SMART FILL</div>
          <div className="panel">
            <p className="dlgtext">Drop a resume and the Dossier reads it: history, skills, credentials, links. It only fills blanks, so anything you have already typed stays exactly as it is.</p>
            <label className="uploadrow" htmlFor="resumeUp" style={{ marginTop: 10 }}>
              {pdfBusy ? <span className="spin" /> : <span className="upic">◉</span>}
              <span>{pdfBusy ? "READING THE RESUME…" : "DROP A RESUME · PDF OR TXT"}</span>
              <input id="resumeUp" type="file" accept=".pdf,.txt,text/plain,application/pdf" onChange={onResume} hidden />
            </label>
            <label className="mono" htmlFor="resumePaste" style={{ display: "block", marginTop: 12 }}>Or paste the resume text</label>
            <textarea id="resumePaste" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste the CV here, then Smart-fill. The reader finds sections, years, links and skills on its own." style={{ minHeight: 88, marginTop: 6 }} />
            <div className="btnrow" style={{ marginTop: 10 }}>
              <button type="button" className="btn primary" disabled={!paste.trim()} onClick={() => applyParsed(paste)}>Smart-fill from paste</button>
            </div>
            {fillNote && <div className="okmsg" style={{ marginTop: 10 }}>{fillNote}</div>}
          </div>
        </section>

        {/* ---------- identity ---------- */}
        <section className="asec" aria-label="Identity">
          <div className="scene-hd">IDENTITY</div>
          <div className="panel">
            <label className="uploadrow" htmlFor="pfPhoto">
              {profile.identity.photo ? <img className="upthumb" src={profile.identity.photo} alt="Your headshot" /> : <span className="upic">✦</span>}
              <span>{profile.identity.photo ? "HEADSHOT LOADED ✓ · REPLACE" : "ADD A HEADSHOT · OPTIONAL"}</span>
              <input id="pfPhoto" type="file" accept="image/*" onChange={onPhoto} hidden />
            </label>
            <label className="mono" htmlFor="pfName" style={{ marginTop: 10, display: "block" }}>Name</label>
            <input id="pfName" value={profile.identity.name} onChange={(e) => setId({ name: e.target.value })} placeholder="Nadia Benali" />
            <label className="mono" htmlFor="pfHead" style={{ display: "block" }}>Headline</label>
            <input id="pfHead" value={profile.identity.headline} onChange={(e) => setId({ headline: e.target.value })} placeholder="Senior Platform Engineer, AWS certified" />
            <label className="mono" htmlFor="pfLoc" style={{ display: "block" }}>Location</label>
            <input id="pfLoc" value={profile.identity.location} onChange={(e) => setId({ location: e.target.value })} placeholder="Berlin, Germany" />
            <label className="mono" htmlFor="pfEmail" style={{ display: "block" }}>Contact email</label>
            <input id="pfEmail" type="email" value={profile.identity.email} onChange={(e) => setId({ email: e.target.value })} placeholder="you@example.com" />
          </div>
        </section>

        {/* ---------- story ---------- */}
        <section className="asec" aria-label="Story">
          <div className="scene-hd">STORY</div>
          <div className="panel">
            <label className="mono" htmlFor="pfStory" style={{ display: "block" }}>The paragraph a visitor should remember</label>
            <textarea id="pfStory" value={profile.story} onChange={(e) => set({ story: e.target.value })} placeholder="Who you are, what you build, and why it matters. One strong paragraph." style={{ minHeight: 96, marginTop: 6 }} />
          </div>
        </section>

        {/* ---------- experience ---------- */}
        <section className="asec" aria-label="Experience">
          <div className="scene-hd">EXPERIENCE</div>
          <div className="panel">
            {profile.experience.length === 0 && <p className="dlgtext">No roles yet. Add one, or smart-fill from a resume above.</p>}
            {profile.experience.map((x, i) => (
              <div key={i} className="orderrow" style={{ display: "block", padding: "12px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span className="mono ordmeta">ROLE {i + 1}</span>
                  <span className="projops">
                    <button type="button" onClick={() => moveExp(i, -1)} aria-label={`Move role ${i + 1} up`} title="Up">↑</button>
                    <button type="button" onClick={() => moveExp(i, 1)} aria-label={`Move role ${i + 1} down`} title="Down">↓</button>
                    <button type="button" onClick={() => rmExp(i)} aria-label={`Remove role ${i + 1}`} title="Remove">✕</button>
                  </span>
                </div>
                <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                  <input value={x.role} onChange={(e) => setExp(i, { role: e.target.value })} placeholder="Role" aria-label={`Role ${i + 1} title`} />
                  <input value={x.company} onChange={(e) => setExp(i, { company: e.target.value })} placeholder="Company" aria-label={`Role ${i + 1} company`} />
                </div>
                <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                  <input value={x.start} onChange={(e) => setExp(i, { start: e.target.value })} placeholder="Start, e.g. 2021" aria-label={`Role ${i + 1} start`} />
                  <input value={x.end} onChange={(e) => setExp(i, { end: e.target.value })} placeholder="End, e.g. Present" aria-label={`Role ${i + 1} end`} />
                </div>
                <label className="mono" htmlFor={`exphl${i}`} style={{ display: "block", marginTop: 8 }}>Highlights, one per line</label>
                <textarea id={`exphl${i}`} value={(x.highlights || []).join("\n")} onChange={(e) => setExp(i, { highlights: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} placeholder={"cut deploy time from 40m to 6m\nled migration of 120 services to Kubernetes"} style={{ minHeight: 64, marginTop: 6 }} />
              </div>
            ))}
            <div className="btnrow" style={{ marginTop: 10 }}>
              <button type="button" className="btn ghost" onClick={addExp}>+ Add a role</button>
            </div>
          </div>
        </section>

        {/* ---------- projects note ---------- */}
        <section className="asec" aria-label="Projects">
          <div className="scene-hd">PROJECTS</div>
          <div className="panel">
            <p className="dlgtext">Projects live in The Set as guided case studies, so the story travels with each film. Edit them where they render.</p>
            <div className="btnrow" style={{ marginTop: 12 }}>
              <button type="button" className="btn ghost" onClick={() => nav("studio")}>Open The Set →</button>
            </div>
          </div>
        </section>

        {/* ---------- skills ---------- */}
        <section className="asec" aria-label="Skills">
          <div className="scene-hd">SKILLS</div>
          <div className="panel">
            <div className="chips" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {profile.skills.map((s, i) => (
                <button key={s + i} type="button" className="btn ghost" style={{ padding: "5px 10px", fontSize: 11 }} onClick={() => rmSkill(i)} aria-label={`Remove skill ${s}`} title="Click to remove">
                  {s} ✕
                </button>
              ))}
              {profile.skills.length === 0 && <span className="mono ordmeta">No skills yet</span>}
            </div>
            <label className="mono" htmlFor="pfSkill" style={{ display: "block" }}>Add a skill, then Enter</label>
            <div className="grid" style={{ gridTemplateColumns: "1fr auto", gap: 8, marginTop: 6 }}>
              <input id="pfSkill" value={skillDraft} onChange={(e) => setSkillDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }} placeholder="e.g. Kubernetes" />
              <button type="button" className="btn ghost" onClick={addSkill}>Add</button>
            </div>
          </div>
        </section>

        {/* ---------- certifications ---------- */}
        <section className="asec" aria-label="Certifications">
          <div className="scene-hd">CERTIFICATIONS</div>
          <div className="panel">
            {profile.certifications.length === 0 && <p className="dlgtext">No certifications yet.</p>}
            {profile.certifications.map((c, i) => (
              <div key={i} className="grid" style={{ gridTemplateColumns: "1fr 1fr 80px 1fr auto", gap: 6, marginBottom: 8, alignItems: "center" }}>
                <input value={c.name} onChange={(e) => rowSet("certifications", i, { name: e.target.value })} placeholder="Certificate" aria-label={`Certification ${i + 1} name`} />
                <input value={c.issuer} onChange={(e) => rowSet("certifications", i, { issuer: e.target.value })} placeholder="Issuer" aria-label={`Certification ${i + 1} issuer`} />
                <input value={c.year} onChange={(e) => rowSet("certifications", i, { year: e.target.value })} placeholder="Year" aria-label={`Certification ${i + 1} year`} />
                <input value={c.url} onChange={(e) => rowSet("certifications", i, { url: e.target.value })} placeholder="Verify URL" aria-label={`Certification ${i + 1} url`} />
                <button type="button" className="btn ghost" style={{ padding: "6px 10px" }} onClick={() => rowRm("certifications", i)} aria-label={`Remove certification ${i + 1}`}>✕</button>
              </div>
            ))}
            <div className="btnrow" style={{ marginTop: 6 }}>
              <button type="button" className="btn ghost" onClick={() => rowAdd("certifications", { name: "", issuer: "", year: "", url: "" })}>+ Add a certification</button>
            </div>
          </div>
        </section>

        {/* ---------- education ---------- */}
        <section className="asec" aria-label="Education">
          <div className="scene-hd">EDUCATION</div>
          <div className="panel">
            {profile.education.length === 0 && <p className="dlgtext">No education yet.</p>}
            {profile.education.map((ed, i) => (
              <div key={i} className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr auto", gap: 6, marginBottom: 8, alignItems: "center" }}>
                <input value={ed.degree} onChange={(e) => rowSet("education", i, { degree: e.target.value })} placeholder="Degree" aria-label={`Education ${i + 1} degree`} />
                <input value={ed.school} onChange={(e) => rowSet("education", i, { school: e.target.value })} placeholder="School" aria-label={`Education ${i + 1} school`} />
                <input value={ed.years} onChange={(e) => rowSet("education", i, { years: e.target.value })} placeholder="Years" aria-label={`Education ${i + 1} years`} />
                <button type="button" className="btn ghost" style={{ padding: "6px 10px" }} onClick={() => rowRm("education", i)} aria-label={`Remove education ${i + 1}`}>✕</button>
              </div>
            ))}
            <div className="btnrow" style={{ marginTop: 6 }}>
              <button type="button" className="btn ghost" onClick={() => rowAdd("education", { degree: "", school: "", years: "" })}>+ Add education</button>
            </div>
          </div>
        </section>

        {/* ---------- languages ---------- */}
        <section className="asec" aria-label="Languages">
          <div className="scene-hd">LANGUAGES</div>
          <div className="panel">
            {profile.languages.length === 0 && <p className="dlgtext">No languages yet.</p>}
            {profile.languages.map((lg, i) => (
              <div key={i} className="grid" style={{ gridTemplateColumns: "1fr 1fr auto", gap: 6, marginBottom: 8, alignItems: "center" }}>
                <input value={lg.name} onChange={(e) => rowSet("languages", i, { name: e.target.value })} placeholder="Language" aria-label={`Language ${i + 1} name`} />
                <select value={LANG_LEVELS.includes(lg.level) ? lg.level : ""} onChange={(e) => rowSet("languages", i, { level: e.target.value })} aria-label={`Language ${i + 1} level`}>
                  <option value="">Level…</option>
                  {LANG_LEVELS.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
                </select>
                <button type="button" className="btn ghost" style={{ padding: "6px 10px" }} onClick={() => rowRm("languages", i)} aria-label={`Remove language ${i + 1}`}>✕</button>
              </div>
            ))}
            <div className="btnrow" style={{ marginTop: 6 }}>
              <button type="button" className="btn ghost" onClick={() => rowAdd("languages", { name: "", level: "" })}>+ Add a language</button>
            </div>
          </div>
        </section>

        {/* ---------- links ---------- */}
        <section className="asec" aria-label="Links">
          <div className="scene-hd">LINKS</div>
          <div className="panel">
            <label className="mono" htmlFor="pfGh" style={{ display: "block" }}>GitHub</label>
            <input id="pfGh" value={profile.links.github} onChange={(e) => setLink({ github: e.target.value })} placeholder="github.com/you" />
            <label className="mono" htmlFor="pfLi" style={{ display: "block" }}>LinkedIn</label>
            <input id="pfLi" value={profile.links.linkedin} onChange={(e) => setLink({ linkedin: e.target.value })} placeholder="linkedin.com/in/you" />
            <label className="mono" htmlFor="pfWeb" style={{ display: "block" }}>Website</label>
            <input id="pfWeb" value={profile.links.website} onChange={(e) => setLink({ website: e.target.value })} placeholder="yourname.dev" />
          </div>
        </section>

      </div>
    </>
  );
}
