// resume.js: the round trip. A client uploads a resume, curates it into the
// Dossier, and gets a beautifully typeset resume back. No new dependency and no
// server: the browser already knows how to print to PDF, so a dedicated print
// document plus window.print() yields a real, selectable-text, accessible,
// link-carrying PDF at zero bundle cost. A canvas snapshot or a heavy PDF
// library would give us worse text, no live links, and a fatter bundle, so we
// deliberately do not reach for one.
//
// The Dossier is the source of truth (identity, story, experience, skills,
// certifications, education, languages, links). This module reads that exact
// shape (see profileParse.js EMPTY_PROFILE) and degrades gracefully: a person
// with only a name and one role still gets a clean one-page document, never a
// skeleton of empty headings.
//
// Two considered layouts, both in the CineFolio voice but tuned for a document a
// recruiter scans in six seconds: CLASSIC (single column, maximal line length
// for prose) and COMPACT (two column, the scannable sidebar of skills and facts
// beside the narrative). Same content, same data, different reading rhythm.

// Small, self-contained escaper. We intentionally do not import esc from
// engine.js: two other engineers are editing that file right now, so this module
// stays free-standing and cannot be broken by their in-flight changes.
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// The layouts we offer. Kept as data so the UI can render a chooser without
// knowing the internals, and so adding a third layout later is a one-line change.
export const RESUME_LAYOUTS = [
  { id: "classic", label: "Classic", blurb: "Single column. Roomy prose, one clean read top to bottom." },
  { id: "compact", label: "Compact", blurb: "Two column. Scannable sidebar of skills and facts beside the story." },
];

// ---------- dossier -> a normalized, print-ready view model ----------
// Everything downstream draws from this, so graceful degradation lives in one
// place: empty fields become empty strings, empty lists become empty arrays,
// and the renderers simply skip anything empty.
function viewModel(profile) {
  const p = profile || {};
  const id = p.identity || {};
  const links = p.links || {};

  const name = String(id.name || "").trim();
  const headline = String(id.headline || "").trim();
  const location = String(id.location || "").trim();
  const email = String(id.email || "").trim();
  const story = String(p.story || "").trim();

  // Experience: the Dossier stores {role, company, start, end, highlights[]}.
  // Keep only entries that carry a role or a company so a blank row a user added
  // but never filled does not print as an empty bullet-less block.
  const experience = (Array.isArray(p.experience) ? p.experience : [])
    .map((x) => ({
      role: String(x?.role || "").trim(),
      company: String(x?.company || "").trim(),
      // start/end join into a compact period; either side may be missing. The
      // middle dot matches the separator the rest of CineFolio uses (see the
      // engine's experience normalizer), keeping one typographic voice.
      period: [String(x?.start || "").trim(), String(x?.end || "").trim()].filter(Boolean).join(" · "),
      highlights: (Array.isArray(x?.highlights) ? x.highlights : [])
        .map((h) => String(h || "").trim())
        .filter(Boolean),
    }))
    .filter((x) => x.role || x.company);

  const skills = (Array.isArray(p.skills) ? p.skills : [])
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  const certifications = (Array.isArray(p.certifications) ? p.certifications : [])
    .map((c) => ({
      name: String(c?.name || "").trim(),
      issuer: String(c?.issuer || "").trim(),
      year: String(c?.year || "").trim(),
      url: String(c?.url || "").trim(),
    }))
    .filter((c) => c.name);

  const education = (Array.isArray(p.education) ? p.education : [])
    .map((e) => ({
      degree: String(e?.degree || "").trim(),
      school: String(e?.school || "").trim(),
      years: String(e?.years || "").trim(),
    }))
    .filter((e) => e.degree || e.school);

  const languages = (Array.isArray(p.languages) ? p.languages : [])
    .map((l) => ({ name: String(l?.name || "").trim(), level: String(l?.level || "").trim() }))
    .filter((l) => l.name);

  // Links carry both a human label and a real href. We keep the visible text
  // short (a handle) but the href absolute, so a printed page still shows where
  // it points and a screen PDF still clicks through.
  const linkList = [];
  const gh = links.github && String(links.github).trim();
  const li = links.linkedin && String(links.linkedin).trim();
  const web = links.website && String(links.website).trim();
  if (gh) linkList.push({ label: strip(gh), href: absURL(gh) });
  if (li) linkList.push({ label: strip(li), href: absURL(li) });
  if (web) linkList.push({ label: strip(web), href: absURL(web) });

  return { name, headline, location, email, story, experience, skills, certifications, education, languages, linkList, hasPhoto: !!id.photo, photo: id.photo || "" };
}

// Drop protocol and a trailing slash for a compact, human-readable label.
const strip = (u) => String(u).replace(/^https?:\/\//i, "").replace(/\/$/, "");
// Ensure an href is absolute so it is clickable from a PDF and unambiguous on paper.
const absURL = (u) => (/^https?:\/\//i.test(u) ? u : "https://" + String(u).replace(/^\/+/, ""));

// A section only renders when it has content. This is the whole graceful-
// degradation contract: no data means no heading, so a sparse dossier produces
// a short, clean document rather than a scaffold of empty titles.
const has = (v) => (Array.isArray(v) ? v.length > 0 : !!v);

// ---------- shared print stylesheet ----------
// One stylesheet, two body classes (.classic / .compact). Design goals, in
// order of importance for a resume:
//   1. Real page geometry for BOTH A4 and US Letter. We set @page size to A4 but
//      choose margins (14mm/15mm) that leave a safe, symmetric frame on Letter
//      too, which is a hair wider and shorter. Content never touches the edge.
//   2. Never orphan a heading from its content: headings use break-after:avoid,
//      and every entry is break-inside:avoid so a role and its bullets stay on
//      one page.
//   3. White paper, dark ink. No dark panels, no full-bleed color: it wastes a
//      recruiter's toner and reads worse. Accent is a thin red rule and the
//      name, nothing that fills a region.
//   4. Selectable, real text at a print-appropriate size (10.5pt body), with the
//      CineFolio voice: Bricolage for the name, IBM Plex Mono for the small
//      uppercase labels, Inter for body. Web fonts are requested but every
//      family has a system fallback so the document is correct offline too.
function styles() {
  return `
:root{
  --ink:#14181F;          /* near-black body: softer than pure black on paper */
  --ink-soft:#3B424E;     /* secondary text */
  --ink-faint:#697280;    /* meta, periods, labels */
  --navy:#0E1C3F;         /* headings, the CineFolio ink */
  --red:#B00E28;          /* the one accent, used only as a hairline and the name underline */
  --rule:rgba(14,28,63,.16);
  --mono:'IBM Plex Mono',ui-monospace,'SFMono-Regular',Menlo,monospace;
  --disp:'Bricolage Grotesque','Helvetica Neue',Arial,sans-serif;
  --body:Inter,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;
}

/* Page geometry. A4 named size; margins chosen to also frame US Letter safely.
   The running content sits inside these margins, so nothing bleeds to an edge on
   either paper. */
@page{ size:A4; margin:14mm 15mm; }

*{ box-sizing:border-box; margin:0; padding:0; }
html{ -webkit-text-size-adjust:100%; }
body{
  font-family:var(--body);
  color:var(--ink);
  background:#fff;              /* white paper: never tint the sheet */
  font-size:10.5pt;
  line-height:1.5;
  /* Ensure browsers keep our (very light) accent color rather than dropping it
     to save ink; we only use color for hairlines and the name, so this is safe. */
  -webkit-print-color-adjust:exact;
  print-color-adjust:exact;
}

/* On screen (the preview iframe / the throwaway render) we simulate the sheet so
   the author sees exactly what will print. @media print drops this framing and
   lets the real @page margins take over. */
@media screen{
  body{ background:#e9e6df; padding:24px; }
  .sheet{ background:#fff; width:210mm; min-height:297mm; margin:0 auto; padding:14mm 15mm; box-shadow:0 2px 30px rgba(0,0,0,.18); }
}
@media print{
  .sheet{ padding:0; width:auto; }        /* @page owns the margins when printing */
}

a{ color:var(--navy); text-decoration:none; }
a:hover{ text-decoration:underline; }

/* ---------- masthead: name, headline, contact line ---------- */
.mast{ border-bottom:1.5px solid var(--red); padding-bottom:10pt; margin-bottom:14pt; }
.name{
  font-family:var(--disp);
  font-weight:800;
  font-size:26pt;
  line-height:1.02;
  letter-spacing:-.01em;
  color:var(--navy);
  text-transform:uppercase;
}
.headline{
  font-family:var(--body);
  font-weight:500;
  font-size:11.5pt;
  color:var(--red);
  margin-top:3pt;
}
.contact{
  font-family:var(--mono);
  font-size:8pt;
  letter-spacing:.04em;
  color:var(--ink-faint);
  margin-top:8pt;
  display:flex;
  flex-wrap:wrap;
  gap:4pt 14pt;
}
.contact a{ color:var(--ink-faint); }
.contact .sep{ opacity:.4; }

/* ---------- section scaffolding ---------- */
.sec{ margin-top:13pt; }
/* Keep a section title with at least its opening lines: the heading must never
   be the last thing on a page. */
.sec h2{
  font-family:var(--mono);
  font-size:9pt;
  font-weight:600;
  letter-spacing:.22em;
  text-transform:uppercase;
  color:var(--navy);
  padding-bottom:4pt;
  margin-bottom:8pt;
  border-bottom:.75pt solid var(--rule);
  break-after:avoid;
  page-break-after:avoid;
}
.lede{ color:var(--ink-soft); font-size:10.5pt; max-width:70ch; }

/* Each experience/education/cert block stays whole across a page break. */
.entry{ margin-bottom:10pt; break-inside:avoid; page-break-inside:avoid; }
.entry:last-child{ margin-bottom:0; }
.entry .top{ display:flex; justify-content:space-between; align-items:baseline; gap:12pt; }
.entry .role{ font-weight:600; font-size:11pt; color:var(--navy); }
.entry .period{ font-family:var(--mono); font-size:8pt; letter-spacing:.06em; color:var(--ink-faint); white-space:nowrap; }
.entry .org{ font-size:10pt; color:var(--red); margin-top:1pt; }
.entry ul{ margin:5pt 0 0 14pt; }
.entry li{ font-size:10pt; color:var(--ink-soft); margin-bottom:2.5pt; line-height:1.45; }

/* Skills: inline wrapped tokens, hairline separated, no filled chips (ink). */
.skills{ display:flex; flex-wrap:wrap; gap:4pt 0; }
.skills span{ font-size:9.5pt; color:var(--ink); padding:0 9pt; border-right:.75pt solid var(--rule); line-height:1.3; }
.skills span:first-child{ padding-left:0; }
.skills span:last-child{ border-right:0; }

/* Compact facts used by both columns: certs, education, languages. */
.fact{ margin-bottom:8pt; break-inside:avoid; page-break-inside:avoid; }
.fact:last-child{ margin-bottom:0; }
.fact .h{ font-weight:600; font-size:10pt; color:var(--navy); }
.fact .m{ font-size:9pt; color:var(--ink-faint); margin-top:1pt; }
.fact .m a{ color:var(--ink-faint); }
.lang{ display:flex; justify-content:space-between; gap:10pt; font-size:9.5pt; margin-bottom:3pt; }
.lang .lv{ color:var(--ink-faint); font-family:var(--mono); font-size:8pt; letter-spacing:.04em; }

/* ---------- COMPACT (two column) ---------- */
/* The narrative (story + experience) reads in the wide main column; the fast
   facts (skills, education, certs, languages) sit in the sidebar a recruiter
   scans first. On paper the two columns share the page height. */
.compact .cols{ display:flex; gap:16pt; align-items:flex-start; }
.compact .main{ flex:1 1 62%; min-width:0; }
.compact .side{ flex:0 0 33%; }
.compact .side .sec:first-child{ margin-top:0; }
.compact .main .sec:first-child{ margin-top:0; }

/* Print engines vary on flex column heights; a small nudge keeps the sidebar
   from being pushed to a second page when the main column is long. Blocks inside
   already refuse to split, so content integrity holds regardless. */
@media print{ .compact .cols{ gap:14pt; } }

/* ---------- footer credit ---------- */
.credit{
  margin-top:16pt;
  padding-top:8pt;
  border-top:.75pt solid var(--rule);
  font-family:var(--mono);
  font-size:7pt;
  letter-spacing:.18em;
  text-transform:uppercase;
  color:var(--ink-faint);
  text-align:center;
}
.credit a{ color:var(--ink-faint); }
`;
}

// ---------- section renderers (shared by both layouts) ----------
const storySec = (vm) =>
  has(vm.story) ? `<section class="sec"><h2>Profile</h2><p class="lede">${esc(vm.story)}</p></section>` : "";

const experienceSec = (vm) =>
  has(vm.experience)
    ? `<section class="sec"><h2>Experience</h2>${vm.experience
        .map(
          (x) => `<div class="entry">
<div class="top"><span class="role">${esc(x.role || x.company)}</span>${x.period ? `<span class="period">${esc(x.period)}</span>` : ""}</div>
${x.company && x.role ? `<div class="org">${esc(x.company)}</div>` : ""}
${x.highlights.length ? `<ul>${x.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
</div>`
        )
        .join("")}</section>`
    : "";

const skillsSec = (vm) =>
  has(vm.skills)
    ? `<section class="sec"><h2>Skills</h2><div class="skills">${vm.skills.map((s) => `<span>${esc(s)}</span>`).join("")}</div></section>`
    : "";

const educationSec = (vm) =>
  has(vm.education)
    ? `<section class="sec"><h2>Education</h2>${vm.education
        .map(
          (e) => `<div class="fact"><div class="h">${esc(e.degree || e.school)}</div>${
            (e.degree && e.school) || e.years
              ? `<div class="m">${[e.degree && e.school ? e.school : "", e.years].filter(Boolean).map(esc).join(" · ")}</div>`
              : ""
          }</div>`
        )
        .join("")}</section>`
    : "";

const certsSec = (vm) =>
  has(vm.certifications)
    ? `<section class="sec"><h2>Certifications</h2>${vm.certifications
        .map(
          (c) => `<div class="fact"><div class="h">${esc(c.name)}</div>${
            c.issuer || c.year || c.url
              ? `<div class="m">${[c.issuer, c.year].filter(Boolean).map(esc).join(" · ")}${
                  c.url ? `${c.issuer || c.year ? " · " : ""}<a href="${esc(absURL(c.url))}">${esc(strip(c.url))}</a>` : ""
                }</div>`
              : ""
          }</div>`
        )
        .join("")}</section>`
    : "";

const languagesSec = (vm) =>
  has(vm.languages)
    ? `<section class="sec"><h2>Languages</h2>${vm.languages
        .map((l) => `<div class="lang"><span>${esc(l.name)}</span>${l.level ? `<span class="lv">${esc(l.level)}</span>` : ""}</div>`)
        .join("")}</section>`
    : "";

// The masthead is identical across layouts: it is the six-second anchor.
function masthead(vm) {
  const contactBits = [];
  if (vm.location) contactBits.push(esc(vm.location));
  if (vm.email) contactBits.push(`<a href="mailto:${esc(vm.email)}">${esc(vm.email)}</a>`);
  for (const l of vm.linkList) contactBits.push(`<a href="${esc(l.href)}">${esc(l.label)}</a>`);
  const contact = contactBits.join(`<span class="sep"> / </span>`);
  return `<header class="mast">
<div class="name">${esc(vm.name || "Your Name")}</div>
${vm.headline ? `<div class="headline">${esc(vm.headline)}</div>` : ""}
${contact ? `<div class="contact">${contact}</div>` : ""}
</header>`;
}

// A discreet, print-friendly credit line. It carries a referral link (the reason
// this feature earns its keep: a shared PDF quietly advertises CineFolio) but is
// tiny, gray, and never competes with the content.
const CREDIT = `<div class="credit"><a href="https://cine-folio.vercel.app/?ref=resume-pdf">Typeset with CineFolio</a></div>`;

// ---------- the two body compositions ----------
function classicBody(vm) {
  // Single column: masthead, then every section stacked in a natural reading
  // order. Best when the story and highlights carry the weight.
  return `${masthead(vm)}
${storySec(vm)}
${experienceSec(vm)}
${skillsSec(vm)}
${educationSec(vm)}
${certsSec(vm)}
${languagesSec(vm)}
${CREDIT}`;
}

function compactBody(vm) {
  // Two column: masthead spans full width, then narrative on the left and the
  // scannable facts on the right. If the sidebar has nothing (a very sparse
  // dossier) we collapse to a single readable column rather than leave dead space.
  const side = `${skillsSec(vm)}${educationSec(vm)}${certsSec(vm)}${languagesSec(vm)}`;
  const main = `${storySec(vm)}${experienceSec(vm)}`;
  if (!side.trim()) return `${masthead(vm)}${main}${CREDIT}`;
  if (!main.trim()) return `${masthead(vm)}${side}${CREDIT}`;
  return `${masthead(vm)}
<div class="cols">
<div class="main">${main}</div>
<div class="side">${side}</div>
</div>
${CREDIT}`;
}

// ---------- public: build the full print document ----------
// opts.layout: "classic" | "compact" (default classic).
// Returns one self-contained HTML string: no external CSS, only optional web
// fonts (with system fallbacks), so it renders identically in a print iframe, a
// preview, or saved to a file for inspection.
export function buildResumeHTML(profile, opts = {}) {
  const layout = RESUME_LAYOUTS.some((l) => l.id === opts.layout) ? opts.layout : "classic";
  const vm = viewModel(profile);
  const body = layout === "compact" ? compactBody(vm) : classicBody(vm);
  const title = `${vm.name || "Resume"}${vm.headline ? " · " + vm.headline : ""}`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(vm.headline || vm.name)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>${styles()}</style>
</head><body class="${layout}"><div class="sheet">${body}</div></body></html>`;
}

// ---------- public: print to PDF, client side, no dependency ----------
// We render into a hidden, same-origin iframe and drive its own print dialog.
// Why an iframe and not window.open: a popup is blocked by default and loses the
// app's origin; an iframe prints just the resume (not the whole console) with no
// popup, and we can wait for fonts and images to settle before printing so the
// PDF is never a half-loaded snapshot. Returns a promise that resolves once the
// dialog has been dismissed (best-effort) so the caller can clear its busy state.
export function printResume(profile, opts = {}) {
  // Server-side / non-DOM guard: buildResumeHTML is still usable for tests, but
  // printing needs a document.
  if (typeof document === "undefined") return Promise.reject(new Error("Printing needs a browser."));

  const html = buildResumeHTML(profile, opts);

  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    // Off-screen but still rendered (display:none can suppress layout/print in
    // some engines). Fixed and sized so fonts lay out at print metrics.
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;z-index:-1;";
    frame.title = "Resume print view";

    let done = false;
    let fallbackTimer = 0;
    const cleanup = () => {
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("focus", onFocus);
      // Remove after a tick so the print job keeps its source document.
      window.setTimeout(() => { try { frame.remove(); } catch { /* already gone */ } }, 300);
    };
    const finish = () => { if (done) return; done = true; cleanup(); resolve(); };
    // Browsers do not fire a reliable "print finished" event; the window regains
    // focus when the dialog closes, so we resolve on the next focus.
    const onFocus = () => window.setTimeout(finish, 150);

    const doPrint = async () => {
      try {
        const win = frame.contentWindow;
        if (!win) throw new Error("Could not open the print view.");
        // Give web fonts a chance to load so the PDF is not a fallback-font
        // snapshot; never block forever if the network is slow.
        try {
          if (win.document.fonts && win.document.fonts.ready) {
            await Promise.race([win.document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]);
          }
        } catch { /* fonts API absent: proceed with system fonts */ }
        window.addEventListener("focus", onFocus);
        // If focus never returns (some headless/kiosk setups), resolve anyway.
        fallbackTimer = window.setTimeout(finish, 60000);
        win.focus();
        win.print();
      } catch (e) {
        done = true;
        cleanup();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };

    frame.onload = doPrint;
    document.body.appendChild(frame);
    // Write the document explicitly so onload fires consistently across engines.
    try {
      const d = frame.contentWindow.document;
      d.open();
      d.write(html);
      d.close();
    } catch (e) {
      cleanup();
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
