// The console family. Targets software engineers and full-stack developers.
// Design register: the modern developer tool interface: Vercel dashboard,
// Linear, and a GitHub profile page. Structured, information-dense, and
// immediately recognisable to the people being addressed. NOT a fake shell;
// the divergence from Terminal is structural, not cosmetic.
//
// Terminal uses a single-column terminal window with a fake prompt, fake
// commands ("git log --career", "ls projects/") and a blinking cursor.
// Console uses a two-column sidebar layout, real navigation labels, status
// chips, stack badge rows per project, and a card grid. The aesthetic
// reference is a deployed app's own dashboard, not a session in one.
import {
  esc, indexHead, caseHead, linkRow, credit, normExperience,
  hasCerts, hasLangObjs, eduLabel, langLabel, slugify, isCaseStudy,
  noHref, metricsBlocks, projectLinks, hasMetrics,
} from "../shared.js";

// ------------------------------------------------------------------ index --
export function console_(p, pal, sec, ctx = {}) {
  const [bg, surface, accent, text, muted] = pal.vars;
  const caseHref = ctx.caseHref || noHref;
  const badge = ctx.badge;
  const exp = normExperience(p);
  const links = p.links || {};
  const ghUrl = links.github ? "https://" + links.github.replace(/^https?:\/\//, "") : "";
  const liUrl = links.linkedin ? "https://" + links.linkedin.replace(/^https?:\/\//, "") : "";
  const siteUrl = links.website ? (/^http/.test(links.website) ? links.website : "https://" + links.website) : "";

  // Render a row of small stack badges from a comma-separated tools string.
  const stackBadges = (tools) => {
    if (!tools) return "";
    return tools.split(/[,/]+/).map((t) => t.trim()).filter(Boolean)
      .map((t) => `<span class="badge">${esc(t)}</span>`).join("");
  };

  // External link icon, aria-hidden so it is purely decorative.
  const extIcon = `<svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none" style="vertical-align:middle;margin-left:3px"><path d="M2 8L8 2M8 2H4M8 2V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  // Build a project card. If a case-study href exists it links out; otherwise
  // shows the inline summary and stack. A live-link row uses p.links.website as
  // the closest available proxy (there is no per-project link field in the data
  // model; see report). Repo URL is likewise drawn from p.links.github when
  // the project is the primary one, but we cannot distinguish per-project repos,
  // so we omit fabricated per-project repo links and rely on the case study page.
  const projectCard = (pr, i) => {
    const href = caseHref(pr);
    const cs = isCaseStudy(pr);
    const mets = metricsBlocks(pr, "csmet");
    return `<div class="pcard">
<div class="pcard-head">
${href
  ? `<a class="pcard-name" href="${esc(href)}">${esc(pr.name)}</a>`
  : `<span class="pcard-name">${esc(pr.name)}</span>`}
${cs ? `<span class="chip chip-cs">case study</span>` : ""}
</div>
${pr.summary || pr.desc ? `<p class="pcard-sum">${esc(pr.summary || pr.desc)}</p>` : ""}
${pr.tools ? `<div class="pcard-stack">${stackBadges(pr.tools)}</div>` : ""}
${mets}
${pr.timeline || pr.role ? `<div class="pcard-meta">${pr.role ? `<span>${esc(pr.role)}</span>` : ""}${pr.role && pr.timeline ? `<span class="sep">·</span>` : ""}${pr.timeline ? `<span>${esc(pr.timeline)}</span>` : ""}</div>` : ""}
</div>`;
  };

  // Navigation links section, drawn from p.links.
  const navLinks = [];
  if (ghUrl) navLinks.push(`<a class="nav-link" href="${esc(ghUrl)}" target="_blank" rel="noopener noreferrer">GitHub${extIcon}</a>`);
  if (liUrl) navLinks.push(`<a class="nav-link" href="${esc(liUrl)}" target="_blank" rel="noopener noreferrer">LinkedIn${extIcon}</a>`);
  if (siteUrl) navLinks.push(`<a class="nav-link" href="${esc(siteUrl)}" target="_blank" rel="noopener noreferrer">Website${extIcon}</a>`);
  if (p.email) navLinks.push(`<a class="nav-link" href="mailto:${esc(p.email)}">Email</a>`);

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} · ${esc(p.headline)}</title><meta name="description" content="${esc(p.summary || p.headline)}">
${indexHead(p, pal, { bg, panel: surface, accent, accent2: accent, text })}
<link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:${bg};color:${text};font-family:'Geist',system-ui,sans-serif;font-size:14px;line-height:1.6;min-height:100vh}
a{color:${accent};text-decoration:none}
a:focus-visible{outline:2px solid ${accent};outline-offset:2px;border-radius:2px}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
/* layout */
.layout{display:grid;grid-template-columns:240px 1fr;min-height:100vh;max-width:1200px;margin:0 auto}
@media(max-width:780px){.layout{grid-template-columns:1fr}}
/* sidebar */
.sidebar{border-right:1px solid ${text}14;padding:32px 24px;display:flex;flex-direction:column;gap:28px;position:sticky;top:0;height:100vh;overflow-y:auto}
@media(max-width:780px){.sidebar{position:static;height:auto;border-right:none;border-bottom:1px solid ${text}14;padding:24px 20px}}
.sid-id{display:flex;flex-direction:column;gap:6px}
.sid-name{font-weight:700;font-size:16px;letter-spacing:-.01em}
.sid-hl{font-family:'Geist Mono',monospace;font-size:11px;color:${muted};line-height:1.4}
.nav-group{display:flex;flex-direction:column;gap:2px}
.nav-label{font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${muted};margin-bottom:6px;padding-left:8px}
.nav-link{display:block;padding:6px 8px;border-radius:6px;font-size:13px;color:${text};transition:background .15s}
.nav-link:hover{background:${text}0d;color:${accent}}
.nav-link svg{opacity:.55}
/* main content */
.main{padding:40px 48px}
@media(max-width:900px){.main{padding:32px 24px}}
@media(max-width:780px){.main{padding:24px 20px}}
/* section headings */
.sec-head{display:flex;align-items:center;gap:10px;margin-bottom:20px}
.sec-head h2{font-size:13px;font-weight:600;letter-spacing:.01em}
.sec-rule{flex:1;height:1px;background:${text}14}
section{margin-bottom:48px}
/* about */
.about-text{font-size:15px;line-height:1.7;color:${text}dd;max-width:62ch}
/* skills grid */
.skills-grid{display:flex;flex-wrap:wrap;gap:8px}
.sk-chip{font-family:'Geist Mono',monospace;font-size:11px;padding:4px 10px;border-radius:5px;border:1px solid ${text}20;color:${muted};background:${surface};letter-spacing:.01em}
/* experience */
.xp-list{display:flex;flex-direction:column;gap:0}
.xp-item{display:grid;grid-template-columns:160px 1fr;gap:16px 24px;padding:18px 0;border-top:1px solid ${text}10}
.xp-item:first-child{border-top:0}
.xp-period{font-family:'Geist Mono',monospace;font-size:11px;color:${muted};padding-top:2px;line-height:1.5}
.xp-body h3{font-size:14px;font-weight:600;margin-bottom:1px}
.xp-org{font-size:12px;color:${accent};margin-bottom:8px}
.xp-points{list-style:none;display:flex;flex-direction:column;gap:3px}
.xp-points li{font-size:13px;color:${text}cc;padding-left:12px;position:relative}
.xp-points li:before{content:"—";position:absolute;left:0;color:${text}30;font-size:11px}
@media(max-width:540px){.xp-item{grid-template-columns:1fr}.xp-period{padding-top:0}}
/* projects */
.proj-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.pcard{background:${surface};border:1px solid ${text}14;border-radius:10px;padding:18px;display:flex;flex-direction:column;gap:10px;transition:border-color .2s}
.pcard:hover{border-color:${accent}66}
.pcard-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.pcard-name{font-size:14px;font-weight:600;color:${text}}
a.pcard-name{color:${accent}}
a.pcard-name:hover{text-decoration:underline}
.pcard-sum{font-size:13px;color:${text}99;line-height:1.55}
.pcard-stack{display:flex;flex-wrap:wrap;gap:4px}
.badge{font-family:'Geist Mono',monospace;font-size:10px;padding:2px 7px;border-radius:4px;background:${accent}15;color:${accent};border:1px solid ${accent}25}
.pcard-meta{font-family:'Geist Mono',monospace;font-size:10px;color:${muted};display:flex;gap:6px;flex-wrap:wrap}
.sep{opacity:.4}
.chip{font-family:'Geist Mono',monospace;font-size:10px;padding:2px 8px;border-radius:99px;border:1px solid}
.chip-cs{border-color:${accent}44;color:${accent}}
/* education, certs, languages */
.simple-list{display:flex;flex-direction:column;gap:8px}
.simple-list p{font-size:13px;color:${text}cc}
.cert-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
.cert-card{background:${surface};border:1px solid ${text}14;border-radius:8px;padding:14px}
.cert-card b{font-size:13px;font-weight:600;display:block}
.cert-card .cm{font-family:'Geist Mono',monospace;font-size:10px;color:${muted};margin-top:4px}
.cert-card a{font-size:11px;color:${accent};margin-top:6px;display:inline-block}
.lang-grid{display:flex;flex-wrap:wrap;gap:8px}
/* contact strip */
.contact-strip{background:${surface};border:1px solid ${text}14;border-radius:10px;padding:24px 28px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px}
.contact-strip p{font-size:15px;font-weight:600;letter-spacing:-.01em}
.contact-strip .links{display:flex;gap:12px;flex-wrap:wrap}
.contact-strip .links a{font-size:13px;color:${text}cc;border:1px solid ${text}22;border-radius:6px;padding:6px 12px;transition:border-color .2s}
.contact-strip .links a:hover{border-color:${accent};color:${accent}}
${hasMetrics(p.projects) ? `.csmet{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px}
.csmet div{background:${bg};border:1px solid ${text}14;border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:3px}
.csmet div span:first-child{font-family:'Geist Mono',monospace;font-size:15px;font-weight:600;color:${accent};line-height:1.2}
.csmet div span:last-child{font-family:'Geist Mono',monospace;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:${muted}}
\n` : ""}</style></head><body>
<div class="layout">
<nav class="sidebar" aria-label="Profile navigation">
<div class="sid-id"><span class="sid-name">${esc(p.name)}</span><span class="sid-hl">${esc(p.headline)}</span></div>
${navLinks.length ? `<div class="nav-group"><div class="nav-label">Links</div>${navLinks.join("")}</div>` : ""}
</nav>
<main class="main">
${sec.about && p.summary ? `<section><div class="sec-head"><h2>About</h2><div class="sec-rule"></div></div><p class="about-text">${esc(p.summary)}</p></section>` : ""}
${sec.skills && p.skills.length ? `<section><div class="sec-head"><h2>Skills</h2><div class="sec-rule"></div></div><div class="skills-grid">${p.skills.map((s) => `<span class="sk-chip">${esc(s)}</span>`).join("")}</div></section>` : ""}
${sec.experience && exp.length ? `<section><div class="sec-head"><h2>Experience</h2><div class="sec-rule"></div></div><div class="xp-list">${exp.map((x) => `<div class="xp-item">${x.period ? `<div class="xp-period">${esc(x.period)}</div>` : `<div class="xp-period"></div>`}<div class="xp-body"><h3>${esc(x.title)}</h3>${x.org ? `<div class="xp-org">${esc(x.org)}</div>` : ""}${x.points.length ? `<ul class="xp-points">${x.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul>` : ""}</div></div>`).join("")}</div></section>` : ""}
${sec.projects && p.projects.length ? `<section><div class="sec-head"><h2>Projects</h2><div class="sec-rule"></div></div><div class="proj-grid">${p.projects.map(projectCard).join("")}</div></section>` : ""}
${sec.education && (p.education || []).length ? `<section><div class="sec-head"><h2>Education</h2><div class="sec-rule"></div></div><div class="simple-list">${p.education.map((e) => `<p>${esc(eduLabel(e))}</p>`).join("")}</div></section>` : ""}
${sec.certifications !== false && hasCerts(p) ? `<section><div class="sec-head"><h2>Certifications</h2><div class="sec-rule"></div></div><div class="cert-grid">${p.certifications.map((c) => `<div class="cert-card"><b>${esc(c.name)}</b><div class="cm">${[c.issuer, c.year].filter(Boolean).map(esc).join(" · ")}</div>${c.url ? `<a href="${/^http/.test(c.url) ? esc(c.url) : "https://" + esc(c.url)}" target="_blank" rel="noopener noreferrer">Credential ↗</a>` : ""}</div>`).join("")}</div></section>` : ""}
${sec.languages !== false && hasLangObjs(p) ? `<section><div class="sec-head"><h2>Languages</h2><div class="sec-rule"></div></div><div class="lang-grid">${p.languages.map((l) => `<span class="sk-chip">${esc(langLabel(l))}</span>`).join("")}</div></section>` : ""}
${sec.contact ? `<section><div class="sec-head"><h2>Contact</h2><div class="sec-rule"></div></div><div class="contact-strip"><p>Get in touch</p><div class="links">${navLinks.join("")}</div></div></section>` : ""}
</main>
</div>
${credit(badge, { fg: text, accent })}</body></html>`;
}

// ----------------------------------------------------------------- case --
export function consoleCase(p, pal, pr, nav, ctx = {}) {
  const badge = ctx.badge;
  const [bg, surface, accent, text, muted] = pal.vars;
  const links = p.links || {};
  const ghUrl = links.github ? "https://" + links.github.replace(/^https?:\/\//, "") : "";
  const liUrl = links.linkedin ? "https://" + links.linkedin.replace(/^https?:\/\//, "") : "";
  const siteUrl = links.website ? (/^http/.test(links.website) ? links.website : "https://" + links.website) : "";

  const stackBadges = (tools) => {
    if (!tools) return "";
    return tools.split(/[,/]+/).map((t) => t.trim()).filter(Boolean)
      .map((t) => `<span class="badge">${esc(t)}</span>`).join("");
  };

  const navLinks = [];
  if (ghUrl) navLinks.push(`<a class="nav-link" href="${esc(ghUrl)}" target="_blank" rel="noopener noreferrer">GitHub</a>`);
  if (liUrl) navLinks.push(`<a class="nav-link" href="${esc(liUrl)}" target="_blank" rel="noopener noreferrer">LinkedIn</a>`);
  if (siteUrl) navLinks.push(`<a class="nav-link" href="${esc(siteUrl)}" target="_blank" rel="noopener noreferrer">Website</a>`);
  if (p.email) navLinks.push(`<a class="nav-link" href="mailto:${esc(p.email)}">Email</a>`);

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pr.name)} · ${esc(p.name)}</title><meta name="description" content="${esc(pr.summary || pr.desc || pr.name)}">
${caseHead(p, pal, pr, { bg, panel: surface, accent, accent2: accent, text }, ctx)}
<link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:${bg};color:${text};font-family:'Geist',system-ui,sans-serif;font-size:14px;line-height:1.6}
a{color:${accent};text-decoration:none}
a:focus-visible{outline:2px solid ${accent};outline-offset:2px;border-radius:2px}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
.layout{display:grid;grid-template-columns:240px 1fr;min-height:100vh;max-width:1200px;margin:0 auto}
@media(max-width:780px){.layout{grid-template-columns:1fr}}
.sidebar{border-right:1px solid ${text}14;padding:32px 24px;display:flex;flex-direction:column;gap:28px;position:sticky;top:0;height:100vh;overflow-y:auto}
@media(max-width:780px){.sidebar{position:static;height:auto;border-right:none;border-bottom:1px solid ${text}14;padding:24px 20px}}
.sid-id{display:flex;flex-direction:column;gap:6px}
.sid-name{font-weight:700;font-size:16px;letter-spacing:-.01em}
.sid-hl{font-family:'Geist Mono',monospace;font-size:11px;color:${muted};line-height:1.4}
.nav-group{display:flex;flex-direction:column;gap:2px}
.nav-label{font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${muted};margin-bottom:6px;padding-left:8px}
.nav-link{display:block;padding:6px 8px;border-radius:6px;font-size:13px;color:${text};transition:background .15s}
.nav-link:hover{background:${text}0d;color:${accent}}
.main{padding:40px 48px}
@media(max-width:900px){.main{padding:32px 24px}}
@media(max-width:780px){.main{padding:24px 20px}}
.back-row{margin-bottom:28px}
.back{font-size:13px;color:${muted};border:1px solid ${text}18;border-radius:6px;padding:6px 12px;display:inline-block;transition:border-color .2s}
.back:hover{border-color:${accent};color:${accent}}
.cs-header{margin-bottom:32px}
.cs-label{font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${muted};margin-bottom:10px}
h1{font-size:clamp(1.6rem,4vw,2.6rem);font-weight:700;letter-spacing:-.02em;line-height:1.1;margin-bottom:12px}
.cs-sum{font-size:15px;color:${text}cc;max-width:62ch;line-height:1.65;margin-bottom:20px}
.meta-row{display:flex;gap:20px;flex-wrap:wrap;padding:16px 0;border-top:1px solid ${text}12;border-bottom:1px solid ${text}12;margin-bottom:24px}
.meta-cell{display:flex;flex-direction:column;gap:2px}
.meta-cell .mk{font-family:'Geist Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:${muted}}
.meta-cell .mv{font-size:13px;color:${text}}
.stack-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:28px}
.badge{font-family:'Geist Mono',monospace;font-size:10px;padding:2px 8px;border-radius:4px;background:${accent}15;color:${accent};border:1px solid ${accent}25}
.cover{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:10px;margin-bottom:32px;display:block;border:1px solid ${text}12}
.cs-block{background:${surface};border:1px solid ${text}12;border-radius:10px;padding:22px 26px;margin-bottom:16px}
.cs-block h2{font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:${muted};margin-bottom:12px}
.cs-block p{font-size:14px;color:${text}dd;line-height:1.7;max-width:68ch}
.nav-strip{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:32px;padding-top:24px;border-top:1px solid ${text}14}
.nav-strip a{font-size:13px;color:${muted};border:1px solid ${text}18;border-radius:6px;padding:6px 12px;transition:border-color .2s}
.nav-strip a:hover{border-color:${accent};color:${accent}}
${Array.isArray(pr.metrics) && pr.metrics.length ? `.csmet{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;margin-bottom:24px}
.csmet div{background:${bg};border:1px solid ${text}14;border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:3px}
.csmet div span:first-child{font-family:'Geist Mono',monospace;font-size:15px;font-weight:600;color:${accent};line-height:1.2}
.csmet div span:last-child{font-family:'Geist Mono',monospace;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:${muted}}
\n` : ""}</style></head><body>
<div class="layout">
<nav class="sidebar" aria-label="Profile navigation">
<div class="sid-id"><span class="sid-name">${esc(p.name)}</span><span class="sid-hl">${esc(p.headline)}</span></div>
${navLinks.length ? `<div class="nav-group"><div class="nav-label">Links</div>${navLinks.join("")}</div>` : ""}
</nav>
<main class="main">
<div class="back-row"><a class="back" href="${ctx.caseHref ? "../index.html" : "index.html"}">← Back to profile</a></div>
<div class="cs-header">
<div class="cs-label">Case study</div>
<h1>${esc(pr.name)}</h1>
${pr.summary || pr.desc ? `<p class="cs-sum">${esc(pr.summary || pr.desc)}</p>` : ""}
${["role", "timeline"].filter((k) => pr[k]).length ? `<div class="meta-row">${["role", "timeline"].filter((k) => pr[k]).map((k) => `<div class="meta-cell"><span class="mk">${k}</span><span class="mv">${esc(pr[k])}</span></div>`).join("")}</div>` : ""}
${pr.tools ? `<div class="stack-row">${stackBadges(pr.tools)}</div>` : ""}
</div>
${metricsBlocks(pr, "csmet")}${projectLinks(pr, "plinks")}
${pr.cover ? `<img class="cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}
${["problem", "process", "results"].filter((k) => pr[k]).map((k) => `<div class="cs-block"><h2>${k === "problem" ? "Problem" : k === "process" ? "Process" : "Results"}</h2><p>${esc(pr[k])}</p></div>`).join("")}
<div class="nav-strip">
<a href="${ctx.caseHref ? "../index.html" : "index.html"}">← All projects</a>
${nav && nav.next ? `<a href="${esc(nav.next.slug)}.html">Next: ${esc(nav.next.pr.name)} →</a>` : ""}
</div>
</main>
</div>
${credit(badge, { fg: text, accent })}</body></html>`;
}

// ---------------------------------------------------------------- palettes --
// Three palettes with a real range: dark default (Midnight), dark blue (Ocean
// Depth, signals belonging to the "developer blue" convention), and a genuine
// light theme (Paper) for developers who prefer it and because Terminal has no
// light palette at all.
//
// vars order: [bg, surface, accent, text, muted]
// accent colours are drawn from syntax-highlighting conventions:
//   Midnight: amber/orange (like VSCode warning; warm on dark)
//   Ocean:    cyan/teal (like Go/TypeScript highlight)
//   Paper:    violet/purple (like Rust/Kotlin highlight on light)
export const consolePalettes = [
  {
    id: "midnight",
    label: "Midnight",
    vars: ["#0d0d0f", "#18181b", "#e5a135", "#e4e4e7", "#71717a"],
  },
  {
    id: "ocean",
    label: "Ocean Depth",
    vars: ["#050d14", "#0c1a28", "#22d3ee", "#d0e8f5", "#5e8a9e"],
  },
  {
    id: "paper",
    label: "Paper",
    vars: ["#f5f5f4", "#ffffff", "#7c3aed", "#1c1917", "#78716c"],
  },
];
