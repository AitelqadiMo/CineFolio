// The plan family. Designed for architects, architecture students and recent
// graduates seeking individual (not firm-level) work. Optimised for the
// ACADEMIC portfolio: process-heavy, drawing-forward, concept-narrative-first.
// Why academic rather than practice: the practice segment is owned by
// firm-facing tools; the student-to-early-career individual is the open market.
// Academic work also maps cleanly to the available data fields: problem =>
// concept brief, process => design development, results => project outcome.
//
// Visual register: the RIBA A1 competition submission board. Architectural white
// ground, one material-reference accent (concrete grey or raw linen), grotesque
// typeface in controlled weights, project metadata set small like drawing
// annotations, generous white space treated as a structural element.
import {
  esc, indexHead, caseHead, initialsAvatar, linkRow, credit,
  normExperience, hasCerts, hasLangObjs, eduLabel, langLabel,
  isCaseStudy, metaRow, csBlocks, noHref, metricsBlocks, hasMetrics,
} from "../shared.js";

// plan: the index page
export function plan(p, pal, sec, ctx = {}) {
  const [ground, rule, accent, dim, panel] = pal.vars;
  const caseHref = ctx.caseHref || noHref;
  const badge = ctx.badge; // undefined => badge on; false => owner removed it
  const exp = normExperience(p);

  // Education carries unusual weight in architecture. Show it before experience
  // when the section is on, because the school signals the intellectual lineage.
  const edu = Array.isArray(p.education) ? p.education : [];

  // Render a project dossier card for each case-study project.
  // The convention: name, programme type hint (from tools/role), year (from
  // timeline), concept narrative (problem), and the single cover image at large
  // scale. There are no multi-image galleries in the data model.
  const csProjects = p.projects.filter(isCaseStudy);
  const plainProjects = p.projects.filter((pr) => !isCaseStudy(pr));

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} · ${esc(p.headline)}</title><meta name="description" content="${esc(p.summary || p.headline)}">
${indexHead(p, pal, { bg: ground, panel: panel, accent: accent, accent2: dim, text: rule })}
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:${ground};color:${rule};font-family:'DM Sans',sans-serif;font-weight:300;line-height:1.65;font-size:15px}
/* Annotation-scale mono label used throughout, like a drawing title block */
.ann{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.32em;text-transform:uppercase;color:${dim}}
a{color:${accent};text-decoration:none}
a:focus-visible{outline:2px solid ${accent};outline-offset:3px}
/* ---- page shell ---- */
.shell{max-width:960px;margin:0 auto;padding:0 clamp(24px,6vw,72px)}
/* ---- header ---- */
.site-header{padding:14vh 0 10vh;border-bottom:1px solid ${rule}20}
.site-header .role{margin-bottom:28px}
h1{font-size:clamp(2.2rem,7vw,4.6rem);font-weight:300;letter-spacing:-.03em;line-height:1.03;color:${rule}}
.hl{margin-top:12px;font-size:1.05rem;font-weight:400;color:${dim}}
.links-row{margin-top:20px;font-family:'DM Mono',monospace;font-size:9.5px;letter-spacing:.2em}
.links-row a{color:${dim};border-bottom:1px solid ${dim}66;padding-bottom:1px}
.links-row a:hover{color:${rule}}
/* ---- section rhythm ---- */
section{padding:9vh 0;border-bottom:1px solid ${rule}14}
.sec-label{display:flex;align-items:center;gap:16px;margin-bottom:36px}
.sec-label:before{content:"";display:block;width:32px;height:1px;background:${accent}}
h2{font-size:.85rem;font-weight:500;letter-spacing:.22em;text-transform:uppercase;color:${accent}}
/* ---- story / about ---- */
.story{max-width:52ch;font-size:1.08rem;line-height:1.75;color:${rule}dd}
/* ---- skills / capabilities ---- */
.skills-grid{display:flex;flex-wrap:wrap;gap:6px 20px}
.skills-grid span{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${dim};border-bottom:1px solid ${dim}44;padding-bottom:2px}
/* ---- experience ---- */
.xp-row{display:grid;grid-template-columns:140px 1fr;gap:20px;padding:20px 0;border-top:1px solid ${rule}12}
.xp-row:first-of-type{border-top:0}
.xp-period{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.2em;color:${dim};padding-top:4px}
.xp-body h3{font-size:1rem;font-weight:500;letter-spacing:-.01em}
.xp-org{font-size:.88rem;color:${dim};margin:2px 0 8px}
.xp-body ul{list-style:none;padding:0}
.xp-body li{font-size:.92rem;color:${rule}99;padding:2px 0}
.xp-body li:before{content:"— ";color:${accent};font-family:'DM Mono',monospace}
@media(max-width:560px){.xp-row{grid-template-columns:1fr}}
/* ---- education ---- */
/* School carries unusual weight in architecture: it signals intellectual lineage.
   Render each entry with full vertical emphasis rather than as a footnote. */
.edu-list{display:flex;flex-direction:column;gap:0}
.edu-row{padding:16px 0;border-top:1px solid ${rule}12;display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px}
.edu-row:first-of-type{border-top:0}
.edu-name{font-size:1rem;font-weight:500}
.edu-meta{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.2em;color:${dim}}
/* ---- project dossiers ---- */
/* Each project card follows the competition board convention: cover image full
   width at top, then the title block at bottom with annotation-scale metadata. */
.dossiers{display:flex;flex-direction:column;gap:8vh}
.dossier{border:1px solid ${rule}14;background:${panel}}
.dossier-cover{width:100%;aspect-ratio:3/2;object-fit:cover;display:block;background:${rule}08}
.dossier-body{padding:clamp(20px,3vw,40px)}
.dossier-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.dossier-title{font-size:clamp(1.2rem,3.5vw,1.9rem);font-weight:300;letter-spacing:-.02em;line-height:1.1}
.dossier-no{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.28em;color:${dim};margin-top:4px}
/* metaRow for dossiers: role, timeline, tools set in annotation scale */
.dmeta{display:flex;gap:24px;flex-wrap:wrap;margin:16px 0 20px;padding:14px 0;border-top:1px solid ${rule}12;border-bottom:1px solid ${rule}12}
.dmeta span{font-size:.88rem;color:${rule}cc}
.dmeta b{display:block;font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.28em;text-transform:uppercase;color:${accent};margin-bottom:3px}
/* Concept narrative: the equivalent of the project brief annotation */
.dossier-narrative{margin-top:22px}
.dossier-narrative h4{font-family:'DM Mono',monospace;font-size:8.5px;letter-spacing:.28em;text-transform:uppercase;color:${dim};margin-bottom:8px}
.dossier-narrative p{font-size:.95rem;color:${rule}cc;max-width:66ch;line-height:1.7}
.dossier-link{display:inline-block;margin-top:22px;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.24em;text-transform:uppercase;color:${accent};border-bottom:1px solid ${accent}66;padding-bottom:1px}
/* plain projects: listed in an annotation table */
.plain-table{margin-top:4vh;border-top:1px solid ${rule}12}
.plain-row{display:grid;grid-template-columns:1fr 2fr;gap:16px;padding:14px 0;border-bottom:1px solid ${rule}12}
.plain-row b{font-size:.95rem;font-weight:500}
.plain-row p{font-size:.9rem;color:${dim}}
@media(max-width:520px){.plain-row{grid-template-columns:1fr}}
/* ---- certifications ---- */
.cert-list{display:flex;flex-direction:column;gap:0}
.cert-row{padding:12px 0;border-top:1px solid ${rule}12;display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px}
.cert-row:first-of-type{border-top:0}
.cert-name{font-size:.95rem;font-weight:500}
.cert-meta{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.16em;color:${dim}}
.cert-link{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.16em;color:${accent};border-bottom:1px solid ${accent}66}
/* ---- languages ---- */
.lang-row{display:flex;flex-wrap:wrap;gap:6px 24px}
.lang-row span{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${dim}}
/* ---- footer ---- */
footer.site-footer{padding:10vh 0 4vh;text-align:left}
.footer-cta{font-size:clamp(1.6rem,5vw,3rem);font-weight:300;letter-spacing:-.03em;line-height:1.1;max-width:18ch;color:${rule}}
.footer-links{margin-top:24px}
/* ---- metrics (gated) ---- */
${hasMetrics(p.projects) ? `.dmet{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0 0}
.dmet div{flex:1;min-width:110px;background:${ground};border:1px solid ${rule}14;padding:16px 18px;display:flex;flex-direction:column;gap:4px}
.dmet div span:first-child{font-family:'DM Mono',monospace;font-size:1.8rem;font-weight:500;color:${accent};line-height:1}
.dmet div span:last-child{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.24em;text-transform:uppercase;color:${dim};margin-top:2px}
\n` : ""}/* ---- motion ---- */
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style></head><body>
<div class="shell">
<header class="site-header">
<div class="ann role">${esc(p.headline)}</div>
<h1>${esc(p.name)}</h1>
${p.summary ? `<div class="hl">${esc(p.summary.slice(0, 120))}</div>` : ""}
<div class="links-row" style="margin-top:20px">${linkRow(p, dim)}</div>
</header>
${sec.education && edu.length ? `<section>
<div class="sec-label"><h2>Education</h2></div>
<div class="edu-list">${edu.map((e) => {
  if (typeof e === "object" && e !== null) {
    return `<div class="edu-row"><span class="edu-name">${esc(e.school || "")}${e.degree ? ` &middot; ${esc(e.degree)}` : ""}</span><span class="edu-meta">${esc(String(e.year || e.years || ""))}</span></div>`;
  }
  return `<div class="edu-row"><span class="edu-name">${esc(String(e))}</span></div>`;
}).join("")}</div>
</section>` : ""}
${sec.about && p.story ? `<section>
<div class="sec-label"><h2>Practice statement</h2></div>
<p class="story">${esc(p.story)}</p>
</section>` : sec.about && p.summary ? `<section>
<div class="sec-label"><h2>Practice statement</h2></div>
<p class="story">${esc(p.summary)}</p>
</section>` : ""}
${sec.projects && p.projects.length ? `<section>
<div class="sec-label"><h2>Selected projects</h2></div>
<div class="dossiers">${csProjects.map((pr, i) => {
  const href = caseHref(pr);
  const num = String(i + 1).padStart(2, "0");
  return `<article class="dossier">
${pr.cover ? `<img class="dossier-cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}
<div class="dossier-body">
<div class="dossier-head">
<div>
<div class="ann dossier-no">PROJECT ${num}</div>
<h3 class="dossier-title">${esc(pr.name)}</h3>
</div>
</div>
${metaRow(pr, "dmeta")}
${pr.summary || pr.desc ? `<div class="dossier-narrative"><h4>Summary</h4><p>${esc(pr.summary || pr.desc)}</p></div>` : ""}
${pr.problem ? `<div class="dossier-narrative"><h4>Concept</h4><p>${esc(pr.problem)}</p></div>` : ""}
${pr.process ? `<div class="dossier-narrative"><h4>Development</h4><p>${esc(pr.process)}</p></div>` : ""}
${pr.results ? `<div class="dossier-narrative"><h4>Outcome</h4><p>${esc(pr.results)}</p></div>` : ""}
${metricsBlocks(pr, "dmet")}
${href ? `<a class="dossier-link" href="${href}">Full dossier &rarr;</a>` : ""}
</div>
</article>`;
}).join("")}
</div>
${plainProjects.length ? `<div class="plain-table">${plainProjects.map((pr) => `<div class="plain-row"><b>${esc(pr.name)}</b><p>${esc(pr.summary || pr.desc || "")}</p></div>`).join("")}</div>` : ""}
</section>` : ""}
${sec.experience && exp.length ? `<section>
<div class="sec-label"><h2>Experience</h2></div>
${exp.map((x) => `<div class="xp-row"><div class="xp-period">${esc(x.period)}</div><div class="xp-body"><h3>${esc(x.title)}</h3>${x.org ? `<div class="xp-org">${esc(x.org)}</div>` : ""}${x.points.length ? `<ul>${x.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul>` : ""}</div></div>`).join("")}
</section>` : ""}
${sec.skills && p.skills.length ? `<section>
<div class="sec-label"><h2>Capabilities</h2></div>
<div class="skills-grid">${p.skills.map((s) => `<span>${esc(s)}</span>`).join("")}</div>
</section>` : ""}
${sec.certifications !== false && hasCerts(p) ? `<section>
<div class="sec-label"><h2>Certifications</h2></div>
<div class="cert-list">${p.certifications.map((c) => `<div class="cert-row"><span class="cert-name">${esc(c.name)}</span><span class="cert-meta">${[c.issuer, c.year].filter(Boolean).map(esc).join(" · ")}${c.url ? ` · <a class="cert-link" href="${/^http/.test(c.url) ? esc(c.url) : "https://" + esc(c.url)}" target="_blank" rel="noopener noreferrer">Credential</a>` : ""}</span></div>`).join("")}</div>
</section>` : ""}
${sec.languages !== false && hasLangObjs(p) ? `<section>
<div class="sec-label"><h2>Languages</h2></div>
<div class="lang-row">${p.languages.map((l) => `<span>${esc(langLabel(l))}</span>`).join("")}</div>
</section>` : ""}
${sec.contact ? `<footer class="site-footer">
<div class="ann">Contact</div>
<div class="footer-cta">Available for collaboration.</div>
<div class="footer-links">${linkRow(p, dim)}</div>
</footer>` : ""}
</div>${credit(badge, { fg: rule, accent })}</body></html>`;
}

// planCase: the standalone case-study (project dossier) page
export function planCase(p, pal, pr, nav, ctx = {}) {
  const badge = ctx.badge;
  const [ground, rule, accent, dim, panel] = pal.vars;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pr.name)} · ${esc(p.name)}</title><meta name="description" content="${esc(pr.summary || pr.desc || pr.name)}">
${caseHead(p, pal, pr, { bg: ground, panel: panel, accent: accent, accent2: dim, text: rule }, ctx)}
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:${ground};color:${rule};font-family:'DM Sans',sans-serif;font-weight:300;line-height:1.65;font-size:15px}
.ann{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.32em;text-transform:uppercase;color:${dim}}
a{color:${accent};text-decoration:none}
a:focus-visible{outline:2px solid ${accent};outline-offset:3px}
.shell{max-width:900px;margin:0 auto;padding:0 clamp(24px,6vw,72px)}
.back{display:inline-block;margin:6vh 0 0;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.24em;text-transform:uppercase;color:${dim};border-bottom:1px solid ${dim}44}
.back:hover{color:${rule};border-bottom-color:${rule}66}
/* ---- hero / title block ---- */
.hero{padding:6vh 0 5vh;border-bottom:1px solid ${rule}14}
.project-no{margin-bottom:18px}
h1{font-size:clamp(2rem,7vw,4.2rem);font-weight:300;letter-spacing:-.03em;line-height:1.03;color:${rule}}
.sum{font-size:1.1rem;color:${rule}cc;max-width:58ch;margin-top:14px;line-height:1.7}
/* metaRow for the dossier page */
.dmeta{display:flex;gap:24px;flex-wrap:wrap;margin:24px 0 0;padding:16px 0;border-top:1px solid ${rule}12;border-bottom:1px solid ${rule}12}
.dmeta span{font-size:.88rem;color:${rule}cc}
.dmeta b{display:block;font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.28em;text-transform:uppercase;color:${accent};margin-bottom:3px}
/* ---- cover ---- */
/* Architecture convention: one cover image at large scale. The data model has
   one cover per project; multi-image galleries are not a field and are not
   emitted. If cover is absent, the white ground itself is the visual rest. */
.cover-img{width:100%;aspect-ratio:3/2;object-fit:cover;display:block;margin:5vh 0 0;background:${rule}06}
/* ---- narrative blocks ---- */
/* problem => concept brief, process => design development, results => outcome.
   Labels follow the academic convention, not the startup case-study convention. */
.blk{padding:6vh 0;border-bottom:1px solid ${rule}10}
.blk:last-of-type{border-bottom:0}
.blk-label{margin-bottom:16px}
.blk h2{font-size:.85rem;font-weight:500;letter-spacing:.2em;text-transform:uppercase;color:${accent}}
.blk p{font-size:1.05rem;color:${rule}cc;max-width:66ch;line-height:1.75}
/* ---- metrics ---- */
${Array.isArray(pr.metrics) && pr.metrics.length ? `.dmet{display:flex;gap:12px;flex-wrap:wrap;margin:6vh 0}
.dmet div{flex:1;min-width:110px;background:${panel};border:1px solid ${rule}14;padding:16px 18px;display:flex;flex-direction:column;gap:4px}
.dmet div span:first-child{font-family:'DM Mono',monospace;font-size:1.8rem;font-weight:500;color:${accent};line-height:1}
.dmet div span:last-child{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.24em;text-transform:uppercase;color:${dim};margin-top:2px}
\n` : ""}/* ---- navigation ---- */
.page-nav{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:6vh 0;border-top:1px solid ${rule}14}
.page-nav a{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:${dim};border-bottom:1px solid ${dim}44}
.page-nav a:hover{color:${rule};border-bottom-color:${rule}66}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style></head><body>
<div class="shell">
<a class="back" href="../index.html">&larr; Portfolio index</a>
<div class="hero">
<div class="ann project-no">Project dossier</div>
<h1>${esc(pr.name)}</h1>
${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}
${metaRow(pr, "dmeta")}
</div>
${pr.cover ? `<img class="cover-img" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}
${pr.problem ? `<div class="blk"><div class="blk-label ann">Concept</div><h2 class="sr-only">Concept</h2><p>${esc(pr.problem)}</p></div>` : ""}
${pr.process ? `<div class="blk"><div class="blk-label ann">Design development</div><h2 class="sr-only">Design development</h2><p>${esc(pr.process)}</p></div>` : ""}
${pr.results ? `<div class="blk"><div class="blk-label ann">Outcome</div><h2 class="sr-only">Outcome</h2><p>${esc(pr.results)}</p></div>` : ""}
${metricsBlocks(pr, "dmet")}
<div class="page-nav">
<a href="../index.html">&larr; All projects</a>
${nav && nav.next ? `<a href="${esc(nav.next.slug)}.html">Next: ${esc(nav.next.pr.name)} &rarr;</a>` : ""}
</div>
</div>${credit(badge, { fg: rule, accent })}</body></html>`;
}

// Three palettes. Each evokes a distinct material tradition in architecture.
// The vars order is: [ground, rule, accent, dim, panel].
//   ground: page background (the "paper")
//   rule:   primary text and hairlines
//   accent: the single material accent (links, annotation labels, metrics)
//   dim:    secondary text (annotation notes, metadata)
//   panel:  card / dossier background (slightly distinguished from ground)

export const planPalettes = [
  {
    // "Gypsum": near-white ground, graphite rule, warm raw-concrete accent.
    // The most neutral and versatile; reads like a physical portfolio board.
    id: "gypsum",
    label: "Gypsum",
    vars: ["#f8f7f4", "#1a1a18", "#6b6760", "#9e9b95", "#f2f0ec"],
  },
  {
    // "Blueprint": cool white ground, ink rule, Prussian blue accent.
    // Recalls the cyanotype drafting tradition; signals technical rigour.
    id: "blueprint",
    label: "Blueprint",
    vars: ["#f5f7fa", "#0f1923", "#2153a3", "#7a8fa6", "#edf0f5"],
  },
  {
    // "Charcoal": dark ground, near-white rule, raw linen accent.
    // Evokes a night-mode drawing set or a presentation at a pin-up jury.
    id: "charcoal",
    label: "Charcoal",
    vars: ["#17191c", "#e8e4dc", "#c9b88a", "#7a7670", "#1e2024"],
  },
];
