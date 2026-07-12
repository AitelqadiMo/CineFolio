// Studio v5: THE SET. A production floor, not a form: casting acts on the
// left, LIVE template posters compiled from the client's own data, film-stock
// palette chips, and a studio monitor that re-renders on every direction.
// The engine is deterministic: every frame on this set is real output.
// The paid Director's Cut is a priced creative-direction card, never a
// template drop-down; set dressing is one slate, not a theater.
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { confetti, friendly, ConfirmDialog, Dialog } from "../ui.jsx";
import { ledger } from "../orders.js";
import { parseProfile, compile, compileBundle, TEMPLATES, DEFAULT_SECTIONS } from "../templates/engine.js";
import { readResume, compressAndUpload, takeBrief, usePopover } from "../media.js";
import { toast } from "../shell/Toast.jsx";

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
  const [confirmCut, setConfirmCut] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // { siteId, slug, title } re-premiere target from My Films
  const [locker, setLocker] = useState([]);   // unassigned assets: { name, url }
  const [arrived, setArrived] = useState(null); // what rode in from a composer handoff
  const [previewKey, setPreviewKey] = useState(0);
  const [ent, setEnt] = useState(null);       // { freeCutsLeft, freeCutsLimit, paidCredits } from /me
  const [buy, setBuy] = useState(null);       // LS checkout url, offered when every cut is spent
  const [films, setFilms] = useState([]);     // the selector: which film is on the bench
  const projPop = usePopover();

  useEffect(() => {
    api.sites().then((r) => setFilms(r.sites || [])).catch(() => { /* selector stays lean */ });
  }, []);
  const premiereRef = useRef(null);
  const polls = useRef(0);

  // stale look ids from an old draft can no longer blank the screen: unknown
  // template falls to the house default, unknown stock falls to the family's first
  const safeLook = (tplId, palId) => {
    const fam = TEMPLATES.find((t) => t.id === tplId) || TEMPLATES[0];
    const stock = fam.palettes.some((p2) => p2.id === palId) ? palId : fam.palettes[0].id;
    return { tpl: fam.id, pal: stock };
  };

  const applyDraft = (d) => {
    if (!d) return;
    if (d.cvRaw) setCvRaw(d.cvRaw);
    if (d.q) setQ(d.q);
    if (d.projects) setProjects(d.projects);
    if (d.testimonials) setTestimonials(d.testimonials);
    if (d.services) setServices(d.services);
    if (d.sections) setSections({ ...DEFAULT_SECTIONS, ...d.sections });
    if (d.tpl) { const lk = safeLook(d.tpl, d.pal); setTpl(lk.tpl); setPal(lk.pal); }
    if (d.locker) setLocker(d.locker);
    if (d.photo) setPhoto(d.photo);
  };

  // draft autosave: local instantly, server-synced (newer copy wins on load)
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
        if (d.tpl) { const lk = safeLook(d.tpl, d.pal); setTpl(lk.tpl); setPal(lk.pal); }
        if (d.locker) setLocker(d.locker);
        if (d.photo) setPhoto(d.photo);
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
    const draft = { cvRaw, q, projects, testimonials, services, sections, tpl, pal, locker, photo: String(photo || "").startsWith("data:") ? "" : photo };
    const t = setTimeout(() => {
      try { localStorage.setItem("cf.studioDraft", JSON.stringify({ ...draft, savedAt: new Date().toISOString() })); } catch { /* full */ }
    }, 500);
    // server copy: strip bulky inline images (CDN URLs stay), 300KB item budget
    const t2 = setTimeout(() => {
      const slim = JSON.parse(JSON.stringify(draft));
      if (String(slim.q?.photo || "").startsWith("data:")) delete slim.q.photo;
      (slim.projects || []).forEach((p2) => { if (String(p2.cover || "").startsWith("data:")) delete p2.cover; });
      slim.locker = (slim.locker || []).filter((a) => !String(a.url || "").startsWith("data:"));
      api.putDraft(slim).catch(() => { /* silent, local copy is safe */ });
    }, 2500);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [cvRaw, q, projects, testimonials, services, sections, tpl, pal, locker, photo]);

  // the account's AI cut entitlement: three free, then the paid path
  useEffect(() => {
    api.me().then((r) => {
      if (typeof r?.user?.freeCutsLeft === "number") setEnt({ freeCutsLeft: r.user.freeCutsLeft, freeCutsLimit: r.user.freeCutsLimit || 3, paidCredits: r.user.paidCredits || 0 });
    }).catch(() => { /* chip stays quiet */ });
  }, []);

  // the dossier (My Profile) is the casting source of truth: prefill once, never clobber
  const [dossier, setDossier] = useState(null);
  useEffect(() => {
    api.getProfile().then((r) => {
      if (!r.profile) return;
      setDossier(r.profile);
      const idn = r.profile.identity || {};
      setQ((q0) => ({
        ...q0,
        name: q0.name || idn.name || "",
        headline: q0.headline || idn.headline || "",
        email: q0.email || idn.email || "",
        website: q0.website || r.profile.links?.website || "",
        focus: q0.focus || r.profile.story || "",
      }));
      setProjects((p0) => (p0.length ? p0 : (r.profile.projects || []).slice(0, 8)));
      if (idn.photo) setPhoto((ph) => ph || idn.photo);
    }).catch(() => { /* the dossier is optional; the set works without it */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // arriving from My Films with a film to edit: premieres target it as a new release
  useEffect(() => {
    try {
      const t = JSON.parse(sessionStorage.getItem("cf.editSite") || "null");
      if (t?.siteId) { setEditTarget(t); sessionStorage.removeItem("cf.editSite"); }
    } catch { /* noop */ }
  }, []);

  // arriving from a composer with a brief: note, look, resume, headshot, covers
  useEffect(() => {
    const b = takeBrief();
    if (!b) return;
    if (b.text) setQ((q0) => ({ ...q0, focus: q0.focus || b.text }));
    if (b.tpl && TEMPLATES.some((t) => t.id === b.tpl)) {
      setTpl(b.tpl);
      const fam = TEMPLATES.find((t) => t.id === b.tpl);
      setPal(b.pal && fam.palettes.some((p2) => p2.id === b.pal) ? b.pal : fam.palettes[0].id);
    }
    if (b.cvRaw) setCvRaw(b.cvRaw);
    if (b.photo) setPhoto(b.photo);
    const covers = Array.isArray(b.covers) ? b.covers.filter((c) => c && c.url) : [];
    if (covers.length) {
      setProjects((p0) => {
        const a = [...p0];
        const extra = [];
        covers.forEach((c, i) => {
          const k = a.findIndex((p2) => !p2.cover);
          if (k >= 0) a[k] = { ...a[k], cover: c.url };
          else if (a.length < 8) a.push({ name: (c.name || "").replace(/\.[a-z0-9]+$/i, "") || `Project ${a.length + 1}`, cover: c.url });
          else extra.push({ name: c.name || `Asset ${i + 1}`, url: c.url });
        });
        if (extra.length) setLocker((l) => [...l, ...extra]);
        return a;
      });
    }
    if (b.cvRaw || b.photo || covers.length) {
      setArrived({ resume: !!b.cvRaw, cvName: b.cvName || "", photo: !!b.photo, covers: covers.length });
    }
  }, []);

  // debounce the heavy text; small fields stay live
  useEffect(() => { const t = setTimeout(() => setCvText(cvRaw), 220); return () => clearTimeout(t); }, [cvRaw]);

  // upload once, keep forever: the first real resume (and headshot) seeds the
  // dossier so every future film casts from it. Only blanks are filled; a
  // dossier the client already curated is never overwritten.
  const dossierSaved = useRef(false);
  useEffect(() => {
    if (dossierSaved.current || cvText.trim().length < 200) return;
    if (dossier && (dossier.identity?.name || dossier.story)) {
      // dossier exists: only backfill a missing headshot
      if (photo && !String(photo).startsWith("data:") && !dossier.identity?.photo) {
        dossierSaved.current = true;
        const next = { ...dossier, identity: { ...(dossier.identity || {}), photo } };
        api.putProfile(next).then(() => setDossier(next)).catch(() => { dossierSaved.current = false; });
      }
      return;
    }
    dossierSaved.current = true;
    const t = setTimeout(() => {
      const p2 = profile;
      const next = {
        identity: {
          name: p2.name || q.name || "",
          headline: p2.headline || q.headline || "",
          email: p2.email || q.email || "",
          ...(photo && !String(photo).startsWith("data:") ? { photo } : {}),
        },
        links: { ...(q.website ? { website: q.website } : {}), ...(p2.links || {}) },
        story: q.focus || p2.summary || "",
        ...(p2.skills?.length ? { skills: p2.skills } : {}),
        ...(p2.experience?.length ? { experience: p2.experience } : {}),
        ...(projects.length ? { projects: projects.slice(0, 8) } : {}),
      };
      api.putProfile(next).then(() => {
        setDossier(next);
        toast("Dossier filled from your resume. Every future film casts from it.");
      }).catch(() => { dossierSaved.current = false; });
    }, 2000);
    return () => { clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cvText, photo, dossier]);

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
    ...(dossier?.certifications?.length ? { certifications: dossier.certifications } : {}),
    ...(dossier?.education?.length ? { education: dossier.education } : {}),
    ...(dossier?.languages?.length ? { languages: dossier.languages } : {}),
    ...(dossier?.experience?.length ? { experience: dossier.experience } : {}),
    ...(projects.length ? { projects } : {}),
    testimonials, services,
  }), [profile, projects, testimonials, services, dossier]);

  const html = useMemo(() => {
    try { return compile(tpl, pal, fullProfile, { sections }); }
    catch (e) {
      console.error("compile failed, falling back to the house look", e);
      try { return compile(TEMPLATES[0].id, TEMPLATES[0].palettes[0].id, fullProfile, { sections: { ...DEFAULT_SECTIONS } }); }
      catch (e2) {
        console.error("fallback compile failed", e2);
        return "<!DOCTYPE html><html><body style=\"margin:0;min-height:100vh;display:grid;place-items:center;background:#0E1C3F;color:#F4EFE6;font-family:monospace;text-align:center;padding:40px\"><div><div style=\"color:#D9A441;letter-spacing:.3em;font-size:10px;margin-bottom:14px\">THE PROJECTOR JAMMED</div>Adjust the brief on the left and the screen relights.</div></body></html>";
      }
    }
  }, [tpl, pal, fullProfile, sections]);

  // live posters: each template rendered with the CLIENT'S data
  // live posters: compile only what is on screen (the selected look in the
  // rail; every look only while the browse gallery is open)
  const posters = useMemo(() => TEMPLATES.map((t) => {
    if (!lookOpen && t.id !== tpl) return { id: t.id, html: "" };
    try { return { id: t.id, html: compile(t.id, t.id === tpl ? pal : t.palettes[0].id, fullProfile, { sections }) }; }
    catch { return { id: t.id, html: "" }; }
  }), [fullProfile, tpl, pal, sections, lookOpen]);

  const ready = cvText.trim().length > 60 || q.name;

  // ---------- media: shared studio machinery (media.js) ----------
  const uploadImage = (file) => compressAndUpload(file);

  const proj = (i, patch) => setProjects(projects.map((p2, k) => (k === i ? { ...p2, ...patch } : p2)));
  const moveProj = (i, d) => {
    const a = [...projects]; const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]]; setProjects(a);
  };

  // ---------- uploads ----------
  const onResume = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    setErr(""); setPdfBusy(true);
    try { setCvRaw(await readResume(f)); }
    catch (e2) { setErr(friendly(e2.message)); }
    finally { setPdfBusy(false); }
  };
  const onPhoto = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const url = await uploadImage(f);
    if (url) setPhoto(url);
  };

  // ---------- the locker: every asset the client handed the studio ----------
  const lockerAdd = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      const url = await uploadImage(f);
      if (url) setLocker((l) => [...l, { name: f.name, url }]);
    }
  };
  const lockerToHeadshot = (i) => {
    const item = locker[i];
    if (!item) return;
    setLocker((l) => {
      const rest = l.filter((_, k) => k !== i);
      return photo ? [...rest, { name: "previous headshot", url: photo }] : rest;
    });
    setPhoto(item.url);
  };
  const lockerToCover = (i) => {
    const item = locker[i];
    if (!item) return;
    setProjects((p0) => {
      const a = [...p0];
      const k = a.findIndex((p2) => !p2.cover);
      if (k >= 0) a[k] = { ...a[k], cover: item.url };
      else a.push({ name: (item.name || "").replace(/\.[a-z0-9]+$/i, "") || `Project ${a.length + 1}`, cover: item.url });
      return a;
    });
    setLocker((l) => l.filter((_, k) => k !== i));
  };
  const headshotToLocker = () => {
    if (!photo) return;
    setLocker((l) => [...l, { name: "headshot", url: photo }]);
    setPhoto(null);
  };
  const coverToLocker = (i) => {
    const p2 = projects[i];
    if (!p2?.cover) return;
    setLocker((l) => [...l, { name: p2.name ? `${p2.name} cover` : "cover", url: p2.cover }]);
    proj(i, { cover: undefined });
  };

  // ---------- premiere (live) or stage (draft release, preview link, no flip) ----------
  const [stageMode, setStageMode] = useState(false);
  const premiere = async () => {
    setErr(""); setPub({ ...pub, busy: true });
    try {
      const slug = pub.slug || (profile.name || "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      // editing an existing film publishes the next release on it; otherwise a new site premieres
      const site = editTarget
        ? { site: { siteId: editTarget.siteId, slug: editTarget.slug } }
        : await api.createSite({ slug, title: profile.name });
      // a premiere ships the whole web app: index plus case-study pages
      const bundle = compileBundle(tpl, pal, fullProfile, { sections });
      const r = await api.publish(site.site.siteId, { files: bundle.files, ...(stageMode ? { stage: true } : {}) });
      setPub({ slug: site.site.slug, busy: false, done: { ...r, slug: site.site.slug, url: r.url || r.previewUrl } });
      if (!stageMode) setTimeout(() => confetti(premiereRef.current || undefined), 60);
    } catch (e2) { setErr(friendly(e2.message)); setPub({ ...pub, busy: false }); }
  };

  const directorsCut = async () => {
    setErr("");
    try {
      const coverUrls = [
        ...projects.filter((p2) => p2.cover && !String(p2.cover).startsWith("data:")).map((p2) => ({ name: p2.name || "cover", url: p2.cover })),
        ...locker.filter((a) => a.url && !String(a.url).startsWith("data:")).map((a) => ({ name: a.name || "asset", url: a.url })),
      ].slice(0, 8);
      // an image that never reached the studio cloud is a data: URL: warn out
      // loud instead of silently filming without the client's own material
      const droppedPhoto = photo && String(photo).startsWith("data:");
      const droppedCovers = [...projects.filter((p2) => String(p2.cover || "").startsWith("data:")), ...locker.filter((a) => String(a.url || "").startsWith("data:"))].length;
      if (droppedPhoto || droppedCovers) {
        toast(`${droppedPhoto ? "Your headshot" : "Some images"} never reached the studio cloud (upload blocked), so the director can't use ${droppedPhoto && droppedCovers ? "them" : droppedPhoto ? "it" : "them"}. Re-add ${droppedPhoto ? "the photo" : "them"} in The Locker before ordering for a cut with your own pictures.`, { ttl: 9000 });
      }
      const r = await api.order({
        email: profile.email || q.email, name: profile.name, role: "engineer",
        cvText: cvText || `${profile.name}, ${profile.headline}`,
        template: tpl, palette: pal, customIdea,
        photo: photo && !String(photo).startsWith("data:") ? photo : null,
        covers: coverUrls,
        links: q.website || null,
      });
      setOrder(r); setOrderStatus(r.production ? "queued" : "preview_only");
      if (typeof r.freeCutsLeft === "number") setEnt((e0) => ({ freeCutsLeft: r.freeCutsLeft, freeCutsLimit: e0?.freeCutsLimit || 3, paidCredits: r.paid ? Math.max(0, (e0?.paidCredits || 1) - 1) : e0?.paidCredits || 0 }));
      ledger.record({ orderId: r.orderId, name: profile.name, price: r.paid ? 149 : 0, ai: true, production: !!r.production, status: r.production ? "queued" : "preview_only" });
      if (r.production) {
        try { localStorage.setItem("cf.activeOrder", JSON.stringify({ orderId: r.orderId, name: profile.name })); } catch { /* noop */ }
      }
    } catch (e2) {
      if (e2.status === 402) {
        setEnt((e0) => ({ ...(e0 || {}), freeCutsLeft: 0, freeCutsLimit: e0?.freeCutsLimit || 3, paidCredits: 0 }));
        setErr("Your three free AI cuts are spent. The next Director's Cut is $149 — the register is right below.");
        api.billingCheckout().then((c) => setBuy(c.url))
          .catch(() => setErr("Your three free AI cuts are spent. The next Director's Cut is $149; the register opens soon."));
      } else if (e2.status === 401) {
        setErr("Sign in again to order an AI cut.");
      } else setErr(friendly(e2.message));
    }
  };

  useEffect(() => {
    if (!order?.production || !["queued", "filming"].includes(orderStatus)) return;
    polls.current = 0;
    const t = setInterval(async () => {
      polls.current += 1;
      try {
        const s = await api.orderStatus(order.orderId);
        if (["ready", "dispatch_failed", "human_review"].includes(s.status)) { clearInterval(t); setOrderStatus(s.status); ledger.setStatus(order.orderId, s.status); }
        else if (s.status === "filming") { setOrderStatus("filming"); ledger.setStatus(order.orderId, "filming"); }
        else if (polls.current >= POLL_MAX) { clearInterval(t); setOrderStatus("timeout"); ledger.setStatus(order.orderId, "timeout"); }
      } catch { /* transient */ }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [order, orderStatus]);

  const slug = pub.slug || (profile.name || "your-name").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  return (
    <div className="edshell" ref={premiereRef}>
      <div className="edbar">
        <div style={{ position: "relative" }} ref={projPop.ref}>
          <button className="edproj" onClick={projPop.toggle} aria-haspopup="menu" aria-expanded={projPop.open}>
            <span className="lens" aria-hidden="true" />
            <span>{editTarget ? `The Set · ${editTarget.title || editTarget.slug}` : "The Set · new film"}</span>
            <span className="chev" aria-hidden="true">▾</span>
          </button>
          {projPop.open && (
            <div className="bkmenu" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, maxHeight: 380, overflowY: "auto", minWidth: 270 }} role="menu">
              <button role="menuitem" onClick={() => { projPop.close(true); setEditTarget(null); }}>
                <span className="mi" aria-hidden="true">{editTarget ? "◌" : "✓"}</span>New film
              </button>
              {films.length > 0 && <div className="navlbl" style={{ padding: "10px 12px 4px" }}>Edit a film</div>}
              {films.map((f) => (
                <button key={f.siteId} role="menuitem" onClick={() => {
                  projPop.close(true);
                  if (f.orderId) { nav(`film/${f.siteId}`); return; } // AI films are directed by message, in the workspace
                  setEditTarget({ siteId: f.siteId, slug: f.slug, title: f.title });
                }} title={f.orderId ? "AI generated: attach files or message the director in the workspace" : "Manual: edits premiere as the next release"}>
                  <span className="mi" aria-hidden="true">{editTarget?.siteId === f.siteId ? "✓" : f.orderId ? "◈" : "▦"}</span>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.title || f.slug}</span>
                  {f.orderId && <span className="bkchip plain gold" style={{ marginLeft: "auto", flex: "0 0 auto" }}>AI</span>}
                </button>
              ))}
              <div className="msep" />
              <button role="menuitem" onClick={() => nav("")}><span className="mi" aria-hidden="true">←</span>Go to Dashboard</button>
              <button role="menuitem" onClick={() => nav("films")}><span className="mi" aria-hidden="true">▦</span>All films</button>
              <button role="menuitem" onClick={() => nav("profile")}><span className="mi" aria-hidden="true">▣</span>My dossier</button>
            </div>
          )}
        </div>
        <span className="edpagesel" style={{ cursor: "default" }} title="Where this film premieres">{(pub.slug.trim() || slug)}.cinefolio.dev</span>
        <div className="grow" />
        <span className="bkchip plain">{(profile.skills || []).length} SKILLS CAST</span>
        {ent && <span className={`bkchip plain ${ent.freeCutsLeft ? "gold" : ""}`}>◈ {ent.freeCutsLeft} FREE AI CUT{ent.freeCutsLeft === 1 ? "" : "S"} LEFT</span>}
        <button className={`edicon ${view === "desktop" ? "on" : ""}`} title="Desktop" aria-label="Desktop preview" onClick={() => setView("desktop")}>▭</button>
        <button className={`edicon ${view === "mobile" ? "on" : ""}`} title="Mobile" aria-label="Mobile preview" onClick={() => setView("mobile")}>▯</button>
        <button className="edicon" title="Re-render preview" aria-label="Re-render preview" onClick={() => setPreviewKey((k) => k + 1)}>⟳</button>
        <button className="bkbtn primary" style={{ padding: "6px 16px" }} onClick={() => setRailTab("publish")}>Premiere</button>
      </div>
      <div className="setbody">
      <h1 className="visually-hidden">The Set</h1>
      {/* ---------------- the slate ---------------- */}
      <div className="slate">
        <div className="slateleft">
          <span className="clap" aria-hidden="true"><i /><i /><i /><i /></span>
          <span className="mono slbl">CINEFOLIO STUDIOS · THE SET</span>
        </div>
        <div className="slatemid mono">
          <span>YOUR SITE RENDERS <b>AS YOU TYPE</b></span>
        </div>
        <div className="mono slamp">SET · <b style={{ color: "var(--green-lit)" }}>LIT</b></div>
      </div>

      <div className="mobiletoggle">
        <button className={mobileMode === "edit" ? "on" : ""} onClick={() => setMobileMode("edit")}>EDIT</button>
        <button className={mobileMode === "preview" ? "on" : ""} onClick={() => setMobileMode("preview")}>PREVIEW</button>
      </div>
      <div className={`workspace mm-${mobileMode}`}>
        {/* ---------------- casting rail ---------------- */}
        <aside className="rail">
          <div className="railtabs" role="tablist" aria-label="The Set">
            <button role="tab" aria-selected={railTab === "content"} className={railTab === "content" ? "on" : ""} onClick={() => setRailTab("content")}>Content</button>
            <button role="tab" aria-selected={railTab === "design"} className={railTab === "design" ? "on" : ""} onClick={() => setRailTab("design")}>Design</button>
            <button role="tab" aria-selected={railTab === "publish"} className={railTab === "publish" ? "on" : ""} onClick={() => setRailTab("publish")}>Publish</button>
          </div>
          <div className={`railpanel ${railTab === "content" ? "" : "hid"}`}>
          {arrived && (
            <div className="bkarrive" role="status">
              <span aria-hidden="true">◈</span>
              <span>
                Brought in from your dashboard:
                {arrived.resume ? " resume" : ""}{arrived.photo ? `${arrived.resume ? "," : ""} headshot` : ""}
                {arrived.covers ? `${arrived.resume || arrived.photo ? " and" : ""} ${arrived.covers} cover${arrived.covers === 1 ? "" : "s"}` : ""}
              </span>
              <button aria-label="Dismiss" onClick={() => setArrived(null)}>✕</button>
            </div>
          )}
          <div className="railsec act">
            <div className="acthead"><span className="actno">I</span><div><b>The Cast</b><span className="actsub">who this film is about</span></div></div>
            <label
              className="uploadrow" htmlFor="cvUp"
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault();
                const f = e.dataTransfer?.files?.[0];
                if (!f) return;
                setErr(""); setPdfBusy(true);
                try { setCvRaw(await readResume(f)); }
                catch (e2) { setErr(friendly(e2.message)); }
                finally { setPdfBusy(false); }
              }}
            >
              {pdfBusy ? <span className="spin" /> : <span className="upic">◉</span>}
              <span>{cvRaw ? "RESUME LOADED ✓ · REPLACE" : "DROP THE RESUME · PDF OR TXT"}</span>
              <input id="cvUp" type="file" accept=".pdf,.txt,text/plain,application/pdf" onChange={onResume} hidden />
            </label>
            <label className="uploadrow" htmlFor="phUp">
              {photo ? <img className="upthumb" src={photo} alt="" /> : <span className="upic">✦</span>}
              <span>{photo ? "HEADSHOT LOADED ✓ · REPLACE" : "ADD A HEADSHOT · OPTIONAL"}</span>
              <input id="phUp" type="file" accept="image/*" onChange={onPhoto} hidden />
            </label>
            <textarea value={cvRaw} onChange={(e) => setCvRaw(e.target.value)} placeholder="…or paste the CV. The engine reads sections, years, links and skills on its own." style={{ minHeight: 84, marginTop: 8 }} />
            {dossier && <div className="mono" style={{ marginTop: 8, fontSize: 9, color: "var(--gold)" }}>CAST FROM YOUR PROFILE ✓ · KEEP IT CURRENT IN MY PROFILE</div>}
          </div>

          <div className="railsec act">
            <div className="acthead"><span className="actno">II</span><div><b>Direction</b><span className="actsub">the questions that matter</span></div></div>
            <input value={q.name} onChange={(e) => setQ({ ...q, name: e.target.value })} placeholder="Name on the marquee" />
            <input value={q.headline} onChange={(e) => setQ({ ...q, headline: e.target.value })} placeholder="Headline, e.g. Platform Engineer, AWS certified" />
            <input value={q.email} onChange={(e) => setQ({ ...q, email: e.target.value })} placeholder="Contact email" />
            <input value={q.website} onChange={(e) => setQ({ ...q, website: e.target.value })} placeholder="Website / domain (optional)" />
            <textarea value={q.focus} onChange={(e) => setQ({ ...q, focus: e.target.value })} placeholder="One paragraph a visitor should remember." style={{ minHeight: 58 }} />
          </div>

          <div className="railsec act">
            <div className="acthead"><span className="actno">III</span><div><b>The Work</b><span className="actsub">guided case studies, the story not just screenshots</span></div></div>
            {projects.length === 0 && (
            <div className="projempty" onClick={() => { setProjects([{}]); setOpenProj(0); }}>
              <div className="mono" style={{ fontSize: 9, color: "var(--gold)" }}>NO SCENES YET</div>
              <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 4 }}>Your best work deserves a case study. Add the first project and we'll guide the story.</div>
            </div>
          )}
          {projects.map((pr, i) => (
              <div key={i} className={`projcard ${openProj === i ? "open" : ""}`}>
                <div className="projrow" role="button" tabIndex={0} aria-expanded={openProj === i} onClick={() => setOpenProj(openProj === i ? null : i)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenProj(openProj === i ? null : i); } }}>
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
                      <span>{pr.cover ? "COVER LOADED ✓ · REPLACE" : "COVER IMAGE"}</span>
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
                    <textarea value={pr.results || ""} onChange={(e) => proj(i, { results: e.target.value })} placeholder="The results: numbers first. Faster, cheaper, safer, adopted by…" style={{ minHeight: 48 }} />
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

          {/* ---------------- the locker: every asset on a light table ---------------- */}
          <div className="railsec act">
            <div className="acthead"><span className="actno">IV</span><div><b>The Locker</b><span className="actsub">every asset you&apos;ve handed the studio</span></div></div>
            <div className="locker">
              {photo && (
                <div className="lockeritem" tabIndex={0}>
                  <img src={photo} alt="Headshot" />
                  <span className="lockrole">Headshot</span>
                  <span className="lockops">
                    <button title="Move to the locker" aria-label="Move headshot to the locker" onClick={headshotToLocker}>▦</button>
                  </span>
                </div>
              )}
              {projects.map((p2, i) => (p2.cover ? (
                <div className="lockeritem" key={`cov-${i}`} tabIndex={0}>
                  <img src={p2.cover} alt={`Cover on ${p2.name || `Project ${i + 1}`}`} />
                  <span className="lockrole">{(p2.name || `Project ${i + 1}`).slice(0, 14)}</span>
                  <span className="lockops">
                    <button title="Detach from this project" aria-label={`Detach cover from ${p2.name || `project ${i + 1}`}`} onClick={() => coverToLocker(i)}>▦</button>
                  </span>
                </div>
              ) : null))}
              {locker.map((a, i) => (
                <div className="lockeritem" key={`lk-${i}`} tabIndex={0}>
                  <img src={a.url} alt={a.name || "Asset"} />
                  <span className="lockrole">Not in a scene</span>
                  <span className="lockops">
                    <button title="Set as headshot" aria-label={`Set ${a.name || "asset"} as headshot`} onClick={() => lockerToHeadshot(i)}>✦</button>
                    <button title="Set as project cover" aria-label={`Set ${a.name || "asset"} as a project cover`} onClick={() => lockerToCover(i)}>▦</button>
                    <button className="danger" title="Remove" aria-label={`Remove ${a.name || "asset"}`} onClick={() => {
                      const gone = locker[i];
                      setLocker((l) => l.filter((_, k) => k !== i));
                      toast("Removed from the locker.", { onUndo: () => setLocker((l) => [...l, gone]) });
                    }}>✕</button>
                  </span>
                </div>
              ))}
              <label className="lockeradd" htmlFor="lockerUp" title="Add images to the locker">
                +
                <input id="lockerUp" type="file" accept="image/*" multiple hidden onChange={lockerAdd} aria-label="Add images to the locker" />
              </label>
            </div>
            {cvRaw && (
              <div className="lockerresume">
                <span className="glyph" aria-hidden="true">▤</span>
                <span className="meta"><b>Resume in the can</b> · {cvRaw.trim().length.toLocaleString()} characters read{arrived?.cvName ? ` · ${arrived.cvName}` : ""}</span>
                <button onClick={() => {
                  const gone = cvRaw;
                  setCvRaw("");
                  toast("Resume cleared from the set.", { onUndo: () => setCvRaw(gone) });
                }}>Clear</button>
              </div>
            )}
            {!photo && !locker.length && !projects.some((p2) => p2.cover) && (
              <div className="mono" style={{ marginTop: 8, fontSize: 9, textTransform: "none", letterSpacing: ".05em" }}>
                Nothing in the locker yet. Drop a headshot or your project shots.
              </div>
            )}
          </div>
          </div>

          <div className={`railpanel ${railTab === "design" ? "" : "hid"}`}>
          <div className="railsec act">
            <div className="acthead"><span className="actno">V</span><div><b>The Look</b><span className="actsub">five worlds, fifteen film stocks, rendered live with your data</span></div></div>
            <div className="posterrow">
              {TEMPLATES.map((t, i) => (
                <button key={t.id} className={`posterpick ${tpl === t.id ? "on" : ""}`} onClick={() => { setTpl(t.id); setPal(t.palettes[0].id); }} title={t.blurb}>
                  <span className="posterframe">
                    {ready && tpl === t.id && posters[i].html
                      ? <iframe title={t.name} tabIndex={-1} sandbox="allow-scripts" scrolling="no" srcDoc={posters[i].html} loading="lazy" />
                      : <span className="posterghost mono">{t.name.split(" ").pop().toUpperCase()}</span>}
                  </span>
                  <span className="posterlbl mono">{t.name}</span>
                </button>
              ))}
            </div>
            <div className="btnrow" style={{ marginTop: 10 }}>
              <button type="button" className="btn ghost ordbtn" onClick={() => setLookOpen(true)}>Browse all looks</button>
            </div>
            <div className="stockrow">
              <span className="mono" style={{ fontSize: 8.5 }}>FILM STOCK</span>
              {(TEMPLATES.find((t) => t.id === tpl) || TEMPLATES[0]).palettes.map((p2) => (
                <button key={p2.id} className={`stock ${pal === p2.id ? "on" : ""}`} onClick={() => setPal(p2.id)}>
                  <i style={{ background: `linear-gradient(135deg, ${p2.vars[2] || p2.vars[1]}, ${p2.vars[3] || p2.vars[2]})` }} />{p2.label}
                </button>
              ))}
            </div>
          </div>
          </div>

          <div className={`railpanel ${railTab === "publish" ? "" : "hid"}`}>
          <div className="railsec act gold">
            <div className="acthead"><span className="actno">VI</span><div><b>{editTarget ? "Premiere the next release" : "Premiere the free take"}</b><span className="actsub">{editTarget ? "this cut lands on your existing film" : "included: one click, live on our infrastructure"}</span></div></div>
            {editTarget ? (
              <div className="mono" style={{ margin: "2px 0 6px", fontSize: 9.5, color: "var(--gold)" }}>
                NEW RELEASE ON {editTarget.slug.toUpperCase()}.CINEFOLIO.SITE ·{" "}
                <button type="button" onClick={() => setEditTarget(null)} style={{ background: "none", border: 0, color: "var(--red-lit)", cursor: "pointer", font: "inherit", letterSpacing: "inherit", textTransform: "inherit" }}>DETACH</button>
              </div>
            ) : (
              <input value={pub.slug} onChange={(e) => setPub({ ...pub, slug: e.target.value })} placeholder={slug} />
            )}
            {!editTarget && !pub.done && (
              <div className="mono" style={{ marginTop: 6, textTransform: "none", letterSpacing: ".05em", fontSize: 10, color: "var(--gold)" }}>
                → {(pub.slug.trim() || slug)}.cinefolio.dev, live seconds after the click
              </div>
            )}
            <label className="mono" style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 0", cursor: "pointer", fontSize: 9.5 }}>
              <input type="checkbox" checked={stageMode} onChange={(e) => setStageMode(e.target.checked)} style={{ width: "auto" }} />
              STAGE AS DRAFT · PREVIEW LINK ONLY, GO LIVE FROM MY FILMS
            </label>
            <div className="btnrow" style={{ marginTop: 10 }}>
              <button className="btn marquee" disabled={!ready || pub.busy || !!pub.done} onClick={premiere}>
                {pub.busy ? <span className="spin" /> : "◈ "}{pub.done ? (stageMode ? "STAGED" : "PREMIERED") : stageMode ? "STAGE THIS CUT" : "PREMIERE THIS SITE"}
              </button>
            </div>
            {err && <div className="err">{err}</div>}
            {buy && (
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a className="btn" href={buy} target="_blank" rel="noopener noreferrer">Unlock the Director&apos;s Cut — $149</a>
                <button type="button" className="btn ghost" onClick={() => api.me().then((r) => {
                  const pc = r?.user?.paidCredits || 0;
                  setEnt({ freeCutsLeft: r?.user?.freeCutsLeft ?? 0, freeCutsLimit: r?.user?.freeCutsLimit || 3, paidCredits: pc });
                  if (pc > 0) { setBuy(null); setErr(""); }
                }).catch(() => { /* the credit lands with the webhook; try again in a moment */ })}>I&apos;ve paid — check my credit</button>
              </div>
            )}
            {pub.done && (
              <div className="premiere" style={{ marginTop: 12 }}>
                <div className="mq">{pub.done.staged ? <>In the can: <em>staged cut #{pub.done.release}</em></> : <>Now screening: <em>release #{pub.done.release}</em></>}</div>
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <a className="btn ghost" href={pub.done.url} target="_blank" rel="noopener noreferrer">Open live URL</a>
                  <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(pub.done.url)}>Copy link</button>
                  <button type="button" className="btn ghost" onClick={() => nav("dashboard")}>My Films</button>
                </div>
              </div>
            )}
          </div>

          <div className="railsec act paidcard">
            <div className="acthead"><span className="actno">VII</span><div><b>The Director's Cut</b><span className="actsub">{ent && ent.freeCutsLeft > 0 ? `filmed by our AI studio · ${ent.freeCutsLeft} of ${ent.freeCutsLimit} free cuts left` : "the studio films it for you · $149, one time"}</span></div></div>
            <ul className="paidlist">
              <li>Every account holds three free AI cuts, on the studio</li>
              <li>Bespoke art direction with cinematic motion, built from your resume and photos</li>
              <li>Your likeness only from the photos you hand us, never generated</li>
              <li>Download-resume built into the delivered portfolio</li>
              <li>Premieres within 24 hours as a new release · one revision included</li>
            </ul>
            <div className="mono" style={{ margin: "0 0 10px", fontSize: 9, letterSpacing: ".12em" }}>AGENCY EQUIVALENT: $2,000+ AND WEEKS · THE STUDIO: 3 FREE, THEN $149, WITHIN 24 HOURS</div>
            <textarea value={customIdea} onChange={(e) => setCustomIdea(e.target.value)} placeholder="Creative direction for the studio: lighting, mood, references, sites you admire…" style={{ minHeight: 64, marginTop: 4 }} />
            <div className="btnrow" style={{ marginTop: 10 }}>
              <button className="btn primary" disabled={!ready || !!order} onClick={() => setConfirmCut(true)}>
                {order ? "DIRECTOR'S CUT ORDERED ✓"
                  : ent === null ? "ORDER THE DIRECTOR'S CUT"
                  : ent.freeCutsLeft > 0 ? `USE A FREE AI CUT · ${ent.freeCutsLeft} OF ${ent.freeCutsLimit} LEFT`
                  : "ORDER THE DIRECTOR'S CUT · $149"}
              </button>
            </div>
            {order && (
              <div className="mono" style={{ marginTop: 10, textTransform: "none", letterSpacing: ".05em", fontSize: 10.5 }}>
                {orderStatus === "filming" ? "🎥 Cameras rolling. The pipeline is filming your cut." :
                 orderStatus === "ready" ? "🎬 Director's cut delivered. Check My Films." :
                 orderStatus === "timeout" ? "Still filming. The moment your cut lands it premieres in My Films and by email." :
                 orderStatus === "preview_only" ? "Your brief is saved. Production orders open in this environment soon; nothing is charged." :
                 ["dispatch_failed", "human_review"].includes(orderStatus) ? "A studio human is finishing this cut by hand. It will arrive by email." :
                 `Order ${order.orderId.slice(0, 8)} is in the queue. Track it any time in Account · Orders.`}
              </div>
            )}
          </div>
        </div>
        </aside>

        {/* ---------------- the canvas: same anatomy as the film workspace ---------------- */}
        <section className="stage">
          <div className={`edcanvas ${view === "mobile" ? "mob" : ""}`}>
            {!ready && (
              <div className="canvashint mono" role="status">THE SCREEN IS LIVE · DROP A RESUME OR START TYPING AND IT RENDERS AS YOU GO</div>
            )}
            <iframe key={`${view}-${previewKey}`} title="Live preview, renders as you type" sandbox="allow-scripts" srcDoc={html} />
          </div>
        </section>
      </div>

      </div>

      <Dialog open={lookOpen} title="Browse the looks" kicker="FIVE FAMILIES · FIFTEEN FILM STOCKS" onClose={() => setLookOpen(false)} width={980}>
        <div className="lookgrid">
          {TEMPLATES.map((t, i) => (
            <div key={t.id} className={`lookcard ${tpl === t.id ? "on" : ""}`}>
              <span className="posterframe lookframe">
                {ready && posters[i].html
                  ? <iframe title={`look-${t.name}`} tabIndex={-1} sandbox="allow-scripts" scrolling="no" srcDoc={posters[i].html} loading="lazy" />
                  : <span className="posterghost mono">{t.name.toUpperCase()}</span>}
              </span>
              <b className="lookname">{t.name}</b>
              <p className="lookblurb">{t.blurb}</p>
              <div className="stockrow" style={{ marginTop: 8 }}>
                {t.palettes.map((p2) => (
                  <button key={p2.id} type="button" className={`stock ${tpl === t.id && pal === p2.id ? "on" : ""}`}
                    onClick={() => { setTpl(t.id); setPal(p2.id); }}>
                    <i style={{ background: `linear-gradient(135deg, ${p2.vars[2] || p2.vars[1]}, ${p2.vars[3] || p2.vars[2]})` }} />{p2.label}
                  </button>
                ))}
              </div>
              <div className="btnrow" style={{ marginTop: 10 }}>
                <button type="button" className={`btn ${tpl === t.id ? "primary" : "ghost"} ordbtn`}
                  onClick={() => { if (tpl !== t.id) { setTpl(t.id); setPal(t.palettes[0].id); } setLookOpen(false); }}>
                  {tpl === t.id ? "Keep this look ✓" : "Use this look"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmCut}
        kicker={ent && ent.freeCutsLeft > 0 ? `FREE AI CUT · ${ent.freeCutsLeft} OF ${ent.freeCutsLimit} LEFT` : "THE DIRECTOR'S CUT · $149 ONE TIME"}
        title="Order your Director's Cut"
        body={`The studio films a bespoke cut for ${profile.name || "you"}: cinematic motion built from your resume${photo ? " and your photos" : ""}, a download-ready resume inside the portfolio, premiere within 24 hours as a new release, one revision included. Delivery lands in My Films and at ${profile.email || q.email || "your email"}.${ent && ent.freeCutsLeft > 0 ? " This one is on the studio." : ""}`}
        confirmLabel="Place the order"
        onConfirm={() => { setConfirmCut(false); directorsCut(); }}
        onClose={() => setConfirmCut(false)}
      />
    </div>
  );
}
