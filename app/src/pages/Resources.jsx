// Resources: the style gallery. Every look the engine can film, rendered
// live with a fictional cast (never the founder's data), and a detail modal
// with one honest CTA: use this template in The Set.
import { useMemo, useState } from "react";
import { useAuth } from "../App.jsx";
import { TEMPLATES, compile, parseProfile } from "../templates/engine.js";

const DEMO = parseProfile(
  [
    "Jordan Vega",
    "Product Designer, systems and story",
    "jordan@studioexample.com",
    "",
    "Experience",
    "Lead Product Designer, Northlight, 2022 - Present",
    "Design systems, motion language and conversion work across the suite.",
    "Product Designer, Fjord & Co, 2019 - 2022",
    "Shipped the mobile banking redesign used by two million people.",
    "",
    "Skills",
    "figma, ui, ux, product design, branding, react, analytics",
  ].join("\n"),
  { name: "Jordan Vega", headline: "Product Designer, systems and story" }
);
DEMO.projects = [
  { name: "Northlight Design System", summary: "One language across nine products", role: "Lead", timeline: "2023", tools: "Figma, React" },
  { name: "Fjord Mobile", summary: "A banking app people describe as calm", role: "Designer", timeline: "2021", tools: "Figma" },
];

export default function Resources() {
  const { nav } = useAuth();
  const [open, setOpen] = useState(null); // template id | null
  const [pal, setPal] = useState(null);

  const posters = useMemo(() => TEMPLATES.map((t) => {
    try { return { ...t, html: compile(t.id, t.palettes[0].id, DEMO, {}) }; }
    catch { return { ...t, html: "" }; }
  }), []);

  const sel = posters.find((t) => t.id === open);
  const selPal = pal || sel?.palettes[0]?.id;
  const selHtml = useMemo(() => {
    if (!sel) return "";
    try { return compile(sel.id, selPal, DEMO, {}); } catch { return sel.html; }
  }, [sel, selPal]);

  const use = (id, p) => {
    try { sessionStorage.setItem("cf.brief", JSON.stringify({ text: "", tpl: id, pal: p || null })); } catch { /* noop */ }
    nav("studio");
  };

  return (
    <div className="bkpad bkres">
      <h1>Resources</h1>
      <p className="sub">Start from a look to film your next portfolio. Every poster below is the real engine rendering a fictional cast.</p>
      <div className="bkrescards">
        {posters.map((t) => (
          <button key={t.id} className="bkrescard" onClick={() => { setOpen(t.id); setPal(null); }}>
            <span className="bkthumb">
              {t.html ? <iframe title={t.name} sandbox="allow-scripts" scrolling="no" srcDoc={t.html} loading="lazy" tabIndex={-1} aria-hidden="true" /> : <span className="ghost">{t.name.toUpperCase()}</span>}
            </span>
            <b>{t.name}</b>
            <p>{t.blurb}</p>
          </button>
        ))}
      </div>

      {sel && (
        <div className="bkmodal" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div className="bkmodalbox" role="dialog" aria-modal="true" aria-label={sel.name}>
            <div className="bkmodalhead">
              <b>{sel.name}</b><span className="by">by CineFolio Studios</span>
              <button className="bkbtn lite use" onClick={() => use(sel.id, selPal)}>Use this look</button>
              <button className="edicon" aria-label="Close" onClick={() => setOpen(null)}>✕</button>
            </div>
            <div className="bkmodalstage">
              <iframe title={`${sel.name} preview`} sandbox="allow-scripts" srcDoc={selHtml} />
            </div>
            <div className="bkmodalfoot">
              <span className="mono" style={{ fontSize: 9 }}>FILM STOCK</span>
              {sel.palettes.map((p) => (
                <button key={p.id} className={`bkchip ${selPal === p.id ? "gold" : ""}`} onClick={() => setPal(p.id)}>{p.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
