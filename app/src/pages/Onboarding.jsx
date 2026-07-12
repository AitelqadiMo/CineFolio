// The First Screening — the studio's intake, shot as eight scenes. A new
// account walks the red carpet once: drop the script (resume), confirm the
// lead, give the logline, trim the acts, and walk out one of two doors — The
// Set (film it yourself, free forever) or the AI Director (the studio films
// you). Everything lands in ONE dossier (PUT /profile): The Set reads it, the
// AI director reads it (dispatch carries it verbatim), so both engines tell
// the same story. Skippable at every scene, resumable (localStorage draft),
// and it never traps anyone: every exit leads somewhere useful.
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { useEntitlement, setEnt, refreshEnt } from "../entitlement.js";
import { parseProfile } from "../templates/engine.js";
import { readResume, compressAndUpload, packBrief, RESUME_TYPES } from "../media.js";

const DRAFT_KEY = "cf.firstScreening";
const SCENES = ["The Script", "The Lead", "The Logline", "The Acts", "The Craft", "The Proof", "The Credits", "The Premiere"];

const blank = () => ({
  name: "", headline: "", email: "", phone: "",
  links: { github: "", linkedin: "", website: "" },
  summary: "", skills: [], experience: [], education: [], projects: [], languages: [],
  photo: null,
  story: { logline: "", targetRole: "" },
  hobbies: [],
  certs: [],
});

const loadDraft = () => {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; }
};

// fill blanks only: manual edits are sacred, the parse never clobbers them
const mergeParsed = (draft, p) => {
  const take = (cur, next) => (cur && (typeof cur !== "object" || Object.keys(cur).length)) ? cur : (next ?? cur);
  return {
    ...draft,
    name: draft.name || p.name || "",
    headline: draft.headline || p.headline || "",
    email: draft.email || p.email || "",
    phone: draft.phone || p.phone || "",
    summary: draft.summary || p.summary || "",
    links: {
      github: draft.links.github || p.links?.github || "",
      linkedin: draft.links.linkedin || p.links?.linkedin || "",
      website: draft.links.website || p.links?.website || "",
    },
    skills: draft.skills.length ? draft.skills : (p.skills || []),
    experience: draft.experience.length ? draft.experience : (p.experience || []),
    education: draft.education.length ? draft.education : (p.education || []),
    projects: draft.projects.length ? draft.projects : (p.projects || []),
    languages: take(draft.languages.length ? draft.languages : null, p.languages) || [],
  };
};

export default function Onboarding() {
  const { user, nav } = useAuth();
  const ent = useEntitlement();
  const [scene, setScene] = useState(0);
  const [draft, setDraft] = useState(() => loadDraft()?.draft || { ...blank(), email: user?.email || "" });
  const [cvRaw, setCvRaw] = useState(() => loadDraft()?.cvRaw || "");
  const [cvName, setCvName] = useState(() => loadDraft()?.cvName || "");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const photoRef = useRef(null);

  useEffect(() => { refreshEnt(); }, []);
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, cvRaw: cvRaw.slice(0, 20000), cvName })); } catch { /* storage full */ }
  }, [draft, cvRaw, cvName]);

  const patch = (p) => setDraft((d) => ({ ...d, ...p }));
  const next = () => { setErr(""); setScene((s) => Math.min(SCENES.length - 1, s + 1)); };
  const back = () => { setErr(""); setScene((s) => Math.max(0, s - 1)); };
  const onEnter = (e) => { if (e.key === "Enter" && !e.shiftKey && e.target.tagName !== "TEXTAREA") { e.preventDefault(); next(); } };

  // ---------- persistence: the dossier is the deliverable ----------
  const dossierOf = () => {
    const d = { ...draft };
    d.skills = d.skills.filter(Boolean);
    d.hobbies = d.hobbies.filter(Boolean);
    d.certs = d.certs.filter(Boolean);
    return d;
  };
  const saveDossier = async () => {
    const profile = dossierOf();
    try { localStorage.setItem("cf.portfolioProfile", JSON.stringify(profile)); } catch { /* noop */ } // Profile.jsx's own safety net
    try { await api.putProfile(profile); } catch { /* offline: localStorage carries it; Profile syncs later */ }
    return profile;
  };

  // ---------- scene 1: the script ----------
  const onScript = async (file) => {
    if (!file) return;
    setBusy("reading"); setErr("");
    try {
      const text = await readResume(file);
      if ((text || "").trim().length < 40) { setErr("That file read almost empty — try a text-based PDF or paste the resume instead."); setBusy(""); return; }
      setCvRaw(text); setCvName(file.name);
      setDraft((d) => mergeParsed(d, parseProfile(text, { email: d.email || user?.email || "" })));
      setBusy("");
      next();
    } catch {
      setErr("Could not read that file — PDF or TXT works, or paste the text.");
      setBusy("");
    }
  };
  const onPasteScript = (text) => {
    if ((text || "").trim().length < 40) { setErr("A little more script, please — a few lines at least."); return; }
    setCvRaw(text); setCvName("pasted resume");
    setDraft((d) => mergeParsed(d, parseProfile(text, { email: d.email || user?.email || "" })));
    next();
  };

  // ---------- scene 2: headshot ----------
  const onPhoto = async (file) => {
    if (!file) return;
    setBusy("photo");
    const url = await compressAndUpload(file);
    if (url) patch({ photo: url });
    setBusy("");
  };

  // ---------- scene 8: the two doors ----------
  const exitToSet = async () => {
    setBusy("set");
    await saveDossier();
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
    packBrief({ text: draft.story.logline || "", tpl: null, pal: null, cvRaw, cvName, photo: draft.photo || "", covers: [] });
    nav("studio");
  };
  const exitToDirector = async () => {
    setErr("");
    if (cvRaw.trim().length < 80) { setErr("The director needs the script — go back to Scene 1 and drop your resume, or take The Set door."); return; }
    setBusy("director");
    await saveDossier();
    try {
      const r = await api.order({
        email: draft.email || user.email, name: draft.name, role: "engineer",
        cvText: cvRaw,
        template: null, palette: null,
        customIdea: draft.story.logline || null,
        photo: draft.photo && !String(draft.photo).startsWith("data:") ? draft.photo : null,
        covers: [], links: draft.links.website || null,
      });
      setEnt(r.entitlement);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
      try { localStorage.setItem("cf.activeOrder", JSON.stringify({ orderId: r.orderId, name: draft.name })); } catch { /* noop */ }
      nav(`order/${r.orderId}`);
    } catch (e) {
      if (e.status === 402) {
        if (e.body?.entitlement) setEnt(e.body.entitlement);
        setErr("Your free film is already spent — take The Set door (free forever), or unlock the Director's Cut from Home.");
      } else setErr(e?.message || "The studio hit a snag — try again, or take The Set door.");
      setBusy("");
    }
  };
  const skip = async () => {
    if (draft.name || draft.skills.length || cvRaw) await saveDossier();
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
    nav("");
  };

  // ---------- tiny list editors ----------
  const chipsEditor = (list, setList, placeholder) => (
    <div className="fs-chips">
      {list.map((s, i) => (
        <button key={`${s}-${i}`} type="button" className="fs-chip" title="Remove" onClick={() => setList(list.filter((_, j) => j !== i))}>{s} ×</button>
      ))}
      <input
        className="fs-chipinput" placeholder={placeholder}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === ",") && e.target.value.trim()) {
            e.preventDefault();
            setList([...list, e.target.value.trim()].slice(0, 20));
            e.target.value = "";
          }
        }}
      />
    </div>
  );

  const freeLeft = ent?.freeCutsLeft ?? 1;
  const paid = ent?.paidCredits ?? 0;
  const canDirect = freeLeft > 0 || paid > 0;

  const scenes = [
    /* 0 — the script */
    <div key="s0">
      <p className="fs-lead">Every film starts with a script. Drop your resume — the studio reads it once and fills the rest of this walk for you.</p>
      <input ref={fileRef} type="file" hidden accept={[...RESUME_TYPES, ".pdf", ".txt"].join(",")} onChange={(e) => onScript(e.target.files?.[0])} />
      <div
        className="fs-drop" role="button" tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter") fileRef.current?.click(); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); onScript(e.dataTransfer.files?.[0]); }}
      >
        {busy === "reading" ? "Reading the script…" : cvName ? `✓ ${cvName} — drop again to replace` : "Drop the resume here · PDF or TXT · or click to choose"}
      </div>
      <details className="fs-alt">
        <summary>Paste the text instead</summary>
        <textarea rows={6} placeholder="Paste your resume…" onBlur={(e) => e.target.value.trim() && onPasteScript(e.target.value)} />
      </details>
      <button type="button" className="fs-ghost" onClick={next}>Start from a blank page →</button>
    </div>,

    /* 1 — the lead */
    <div key="s1" onKeyDown={onEnter}>
      <p className="fs-lead">The lead of this film. Two lines on the poster.</p>
      <label className="fs-label">Name<input value={draft.name} onChange={(e) => patch({ name: e.target.value.slice(0, 80) })} placeholder="Your name" autoFocus /></label>
      <label className="fs-label">Headline<input value={draft.headline} onChange={(e) => patch({ headline: e.target.value.slice(0, 90) })} placeholder="Platform engineer · systems and story" /></label>
      <div className="fs-photorow">
        <input ref={photoRef} type="file" hidden accept="image/*" onChange={(e) => onPhoto(e.target.files?.[0])} />
        {draft.photo ? <img className="fs-headshot" src={draft.photo} alt="Headshot" /> : <div className="fs-headshot fs-empty" aria-hidden="true">◈</div>}
        <button type="button" className="fs-ghost" onClick={() => photoRef.current?.click()} disabled={busy === "photo"}>
          {busy === "photo" ? "Developing…" : draft.photo ? "Swap the headshot" : "Add a headshot (the AI films with it)"}
        </button>
      </div>
    </div>,

    /* 2 — the logline */
    <div key="s2">
      <p className="fs-lead">Every film worth watching has a logline. What makes your story worth sharing — in one honest sentence?</p>
      <textarea
        className="fs-big" rows={3} autoFocus
        value={draft.story.logline}
        onChange={(e) => patch({ story: { ...draft.story, logline: e.target.value.slice(0, 300) } })}
        placeholder="Ten years turning fragile systems into boring, reliable ones — and telling the story so people care."
      />
      <label className="fs-label">The role you're chasing next
        <input value={draft.story.targetRole} onChange={(e) => patch({ story: { ...draft.story, targetRole: e.target.value.slice(0, 80) } })} placeholder="Staff platform engineer" />
      </label>
    </div>,

    /* 3 — the acts */
    <div key="s3">
      <p className="fs-lead">The acts of the career. Confirm and trim — the studio already drafted them from the script.</p>
      {draft.experience.length === 0 && <p className="fs-dim">Nothing parsed yet — add the roles that matter (two or three carry a film).</p>}
      {draft.experience.map((x, i) => (
        <div className="fs-card" key={i}>
          <div className="fs-cardrow">
            <input value={x.title || ""} onChange={(e) => { const xs = [...draft.experience]; xs[i] = { ...x, title: e.target.value.slice(0, 90) }; patch({ experience: xs }); }} placeholder="Role" />
            <input value={x.org || ""} onChange={(e) => { const xs = [...draft.experience]; xs[i] = { ...x, org: e.target.value.slice(0, 60) }; patch({ experience: xs }); }} placeholder="Company" />
            <input value={x.period || ""} onChange={(e) => { const xs = [...draft.experience]; xs[i] = { ...x, period: e.target.value.slice(0, 30) }; patch({ experience: xs }); }} placeholder="2021 — now" />
            <button type="button" className="fs-x" title="Cut this act" onClick={() => patch({ experience: draft.experience.filter((_, j) => j !== i) })}>×</button>
          </div>
        </div>
      ))}
      {draft.experience.length < 6 && (
        <button type="button" className="fs-ghost" onClick={() => patch({ experience: [...draft.experience, { period: "", title: "", org: "", points: [] }] })}>+ Add an act</button>
      )}
    </div>,

    /* 4 — the craft */
    <div key="s4">
      <p className="fs-lead">The craft. Keep the skills that deserve screen time; cut the rest.</p>
      {chipsEditor(draft.skills, (skills) => patch({ skills }), "Type a skill, press Enter")}
      <p className="fs-lead" style={{ marginTop: 26 }}>Languages you work in (human ones).</p>
      {chipsEditor(draft.languages, (languages) => patch({ languages }), "English, French…")}
    </div>,

    /* 5 — the proof */
    <div key="s5">
      <p className="fs-lead">The proof. Projects, papers, and the credentials with your name on them.</p>
      {draft.projects.map((p, i) => (
        <div className="fs-card" key={i}>
          <div className="fs-cardrow">
            <input value={p.name || ""} onChange={(e) => { const ps = [...draft.projects]; ps[i] = { ...p, name: e.target.value.slice(0, 60) }; patch({ projects: ps }); }} placeholder="Project" />
            <input value={p.desc || ""} style={{ flex: 2 }} onChange={(e) => { const ps = [...draft.projects]; ps[i] = { ...p, desc: e.target.value.slice(0, 180) }; patch({ projects: ps }); }} placeholder="What it did, why it mattered" />
            <button type="button" className="fs-x" onClick={() => patch({ projects: draft.projects.filter((_, j) => j !== i) })}>×</button>
          </div>
        </div>
      ))}
      {draft.projects.length < 4 && <button type="button" className="fs-ghost" onClick={() => patch({ projects: [...draft.projects, { name: "", desc: "" }] })}>+ Add proof</button>}
      <p className="fs-lead" style={{ marginTop: 26 }}>Certificates & awards</p>
      {chipsEditor(draft.certs, (certs) => patch({ certs }), "AWS SA Pro, CKA… press Enter")}
      <p className="fs-lead" style={{ marginTop: 26 }}>Education</p>
      {chipsEditor(draft.education, (education) => patch({ education }), "MSc, University… press Enter")}
    </div>,

    /* 6 — the credits */
    <div key="s6" onKeyDown={onEnter}>
      <p className="fs-lead">The credits. Where the audience finds you after the film.</p>
      <label className="fs-label">GitHub<input value={draft.links.github} onChange={(e) => patch({ links: { ...draft.links, github: e.target.value.slice(0, 120) } })} placeholder="github.com/you" /></label>
      <label className="fs-label">LinkedIn<input value={draft.links.linkedin} onChange={(e) => patch({ links: { ...draft.links, linkedin: e.target.value.slice(0, 120) } })} placeholder="linkedin.com/in/you" /></label>
      <label className="fs-label">Website<input value={draft.links.website} onChange={(e) => patch({ links: { ...draft.links, website: e.target.value.slice(0, 120) } })} placeholder="you.dev" /></label>
      <label className="fs-label">Email<input value={draft.email} onChange={(e) => patch({ email: e.target.value.slice(0, 120) })} placeholder="you@domain.com" /></label>
      <p className="fs-lead" style={{ marginTop: 26 }}>The human frame — what do you do when nobody's hiring you?</p>
      {chipsEditor(draft.hobbies, (hobbies) => patch({ hobbies }), "Analog photography, trail running… press Enter")}
    </div>,

    /* 7 — the premiere fork */
    <div key="s7">
      <p className="fs-lead">The dossier is in the vault. Two doors out of the lot — both premiere at <b>yourname.cinefolio.dev</b>.</p>
      <div className="fs-doors">
        <button type="button" className="fs-door" onClick={exitToSet} disabled={!!busy}>
          <span className="fs-doork">DOOR ONE</span>
          <b>The Set</b>
          <i>Film it yourself. Every template family, renders as you type. Free forever.</i>
          <span className="fs-doorcta">{busy === "set" ? "Opening…" : "Walk in →"}</span>
        </button>
        <button type="button" className={`fs-door star ${canDirect ? "" : "dim"}`} onClick={exitToDirector} disabled={!!busy}>
          <span className="fs-doork">DOOR TWO</span>
          <b>The AI Director</b>
          <i>{freeLeft > 0 ? "The studio films you — your first film is on us." : paid > 0 ? `The studio films you — ${paid} paid credit${paid === 1 ? "" : "s"} banked.` : "Your free film is spent — unlock the Director's Cut from Home ($99 · 3 productions)."}</i>
          <span className="fs-doorcta">{busy === "director" ? "Cameras rolling…" : canDirect ? "Roll camera →" : "See The Set instead"}</span>
        </button>
      </div>
    </div>,
  ];

  return (
    <div className="fs-stage" data-scene={scene}>
      <div className="fs-topbar">
        <span className="fs-brand">CineFolio<i>•</i>Studios</span>
        <span className="fs-count" aria-label={`Scene ${scene + 1} of ${SCENES.length}`}>{SCENES.length - scene}</span>
        <button type="button" className="fs-skip" onClick={skip}>I'll just explore →</button>
      </div>
      <div className="fs-scene">
        <div className="fs-kicker">SCENE {String(scene + 1).padStart(2, "0")} — {SCENES[scene].toUpperCase()}</div>
        <h1 className="fs-title">{SCENES[scene]}<em>.</em></h1>
        {scenes[scene]}
        {err && <div className="fs-err" role="alert">{err}</div>}
      </div>
      <div className="fs-nav">
        {scene > 0 && <button type="button" className="fs-ghost" onClick={back}>← Back</button>}
        <div className="fs-dots" aria-hidden="true">{SCENES.map((_, i) => <span key={i} className={i === scene ? "on" : i < scene ? "done" : ""} />)}</div>
        {scene < SCENES.length - 1 && <button type="button" className="btn primary" onClick={next}>Next scene →</button>}
      </div>
    </div>
  );
}
