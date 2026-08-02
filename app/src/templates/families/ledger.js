// The ledger family. Designed for finance, procurement and operations
// professionals whose portfolios are built from quantitative outcomes:
// cost reductions, supplier consolidations, cycle-time cuts, compliance
// records. The register is the annual report or the audited statement,
// not a creative portfolio. Rigour, precision and institutional weight
// are the only visual values worth chasing here.
import {
  esc, indexHead, caseHead, linkRow, credit,
  normExperience, hasCerts, hasLangObjs, eduLabel, langLabel,
  slugify, isCaseStudy, metaRow, csBlocks,
  metricsBlocks, projectLinks, hasMetrics, noHref, METRICS_CAP, DIRECTION_GLYPH,
} from "../shared.js";

// Three Google Fonts that carry the annual-report register:
// Playfair Display for display headings (serious editorial serif),
// Source Serif 4 for body text (the workhorse of financial typography),
// IBM Plex Mono for figures and labels (tabular, unambiguous numerals).
const FONTS = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap";

// ---------- index page ----------
export function ledger(p, pal, sec, ctx = {}) {
  const [paper, ink, accent, rule] = pal.vars;
  const caseHref = ctx.caseHref || noHref;
  const badge = ctx.badge;
  const exp = normExperience(p);

  // Credentials that matter to this audience: CPA, CIPS, MBA, PMP etc.
  // We surface them right next to the name rather than burying them below.
  const credLine = hasCerts(p)
    ? p.certifications.slice(0, 3).map((c) => esc(c.name)).join(" · ")
    : "";

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} · ${esc(p.headline)}</title><meta name="description" content="${esc(p.summary || p.headline)}">
${indexHead(p, pal, { bg: paper, panel: paper, accent, accent2: rule, text: ink })}
<link href="${FONTS}" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{font-size:16px}
body{background:${paper};color:${ink};font-family:'Source Serif 4',Georgia,serif;line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:${accent};text-decoration:none}
a:hover{text-decoration:underline}
a:focus-visible{outline:2px solid ${accent};outline-offset:2px;border-radius:1px}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}

/* document shell: centred column, generous margins */
.doc{max-width:860px;margin:0 auto;padding:0 clamp(20px,5vw,60px)}

/* masthead: ruled top bar, name block, contact strip */
.mast{border-top:4px solid ${ink};border-bottom:1px solid ${rule};padding:clamp(24px,4vw,48px) 0 clamp(16px,2.5vw,28px)}
.mast-inner{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px}
.name-block{}
.name-block h1{font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:clamp(1.9rem,5vw,3rem);letter-spacing:-.01em;color:${ink};line-height:1.1}
.name-block .headline{font-family:'Source Serif 4',Georgia,serif;font-style:italic;font-size:clamp(0.95rem,2vw,1.15rem);color:${ink};opacity:.72;margin-top:6px}
.cred-line{font-family:'IBM Plex Mono',monospace;font-size:0.7rem;letter-spacing:.12em;text-transform:uppercase;color:${accent};margin-top:10px;font-weight:500}
.contact-block{text-align:right;font-family:'IBM Plex Mono',monospace;font-size:0.72rem;letter-spacing:.06em;color:${ink};opacity:.65;line-height:1.9}
.contact-block a{color:${ink};opacity:.65}
.contact-block a:hover{opacity:1}

/* section anatomy: label rule + content */
.section{padding:clamp(20px,3vw,36px) 0;border-bottom:1px solid ${rule}}
.section:last-child{border-bottom:none}
.section-label{font-family:'IBM Plex Mono',monospace;font-size:0.68rem;letter-spacing:.22em;text-transform:uppercase;color:${accent};margin-bottom:14px;font-weight:500}

/* executive summary */
.summary-text{font-size:1.04rem;line-height:1.7;color:${ink};max-width:66ch}

/* skills: compact inline tags, no flourish */
.skill-list{display:flex;flex-wrap:wrap;gap:6px 10px;list-style:none}
.skill-list li{font-family:'IBM Plex Mono',monospace;font-size:0.72rem;letter-spacing:.06em;padding:4px 10px;border:1px solid ${rule};color:${ink};opacity:.8}

/* experience: the institutional record */
.exp-entry{display:grid;grid-template-columns:1fr auto;gap:0 24px;margin-bottom:clamp(18px,2.5vw,28px)}
.exp-entry:last-child{margin-bottom:0}
.exp-role{font-family:'Playfair Display',Georgia,serif;font-weight:600;font-size:1.05rem;color:${ink}}
.exp-org{font-size:0.92rem;color:${ink};opacity:.7;margin-top:2px}
.exp-period{font-family:'IBM Plex Mono',monospace;font-size:0.72rem;letter-spacing:.06em;color:${ink};opacity:.55;white-space:nowrap;text-align:right;padding-top:4px}
.exp-points{margin-top:8px;grid-column:1/-1;list-style:none}
.exp-points li{font-size:0.92rem;color:${ink};opacity:.8;padding:3px 0 3px 16px;position:relative;line-height:1.55}
.exp-points li:before{content:"—";position:absolute;left:0;opacity:.35;font-family:'IBM Plex Mono',monospace}

/* projects: engagement table */
.engagement{width:100%;border-collapse:collapse;margin-top:4px}
.engagement thead tr{border-bottom:2px solid ${ink}}
.engagement thead th{font-family:'IBM Plex Mono',monospace;font-size:0.66rem;letter-spacing:.18em;text-transform:uppercase;color:${ink};opacity:.5;padding:0 12px 10px 0;text-align:left;font-weight:500}
.engagement thead th:last-child{text-align:right}
.engagement tbody tr{border-bottom:1px solid ${rule}}
.engagement tbody tr:last-child{border-bottom:none}
.engagement tbody td{padding:12px 12px 12px 0;vertical-align:top;font-size:0.92rem;color:${ink};opacity:.85}
.engagement tbody td:last-child{text-align:right;font-family:'IBM Plex Mono',monospace;font-size:0.72rem;opacity:.55;white-space:nowrap}
.engagement tbody td.eng-name{font-family:'Source Serif 4',Georgia,serif;font-weight:600;font-style:italic;opacity:1}
.engagement tbody td.eng-name a{color:${ink}}
.engagement tbody td.eng-name a:hover{color:${accent}}
.engagement tbody td.eng-summ{font-size:0.88rem;opacity:.68;max-width:36ch}

/* certifications */
.cert-list{list-style:none}
.cert-list li{padding:8px 0;border-bottom:1px solid ${rule};display:flex;justify-content:space-between;align-items:baseline;gap:16px;flex-wrap:wrap}
.cert-list li:last-child{border-bottom:none}
.cert-name{font-family:'Source Serif 4',Georgia,serif;font-weight:600;font-size:0.95rem}
.cert-meta{font-family:'IBM Plex Mono',monospace;font-size:0.7rem;letter-spacing:.06em;opacity:.55;text-align:right}

/* education */
.edu-list{list-style:none}
.edu-list li{padding:8px 0;border-bottom:1px solid ${rule};font-size:0.92rem;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
.edu-list li:last-child{border-bottom:none}

/* languages */
.lang-list{list-style:none;display:flex;flex-wrap:wrap;gap:8px 20px}
.lang-list li{font-family:'IBM Plex Mono',monospace;font-size:0.72rem;letter-spacing:.08em;padding:4px 10px;border:1px solid ${rule}}

/* links row */
.links-row{font-family:'IBM Plex Mono',monospace;font-size:0.72rem;letter-spacing:.06em}
.links-row a{color:${ink};opacity:.6}
.links-row a:hover{opacity:1}

/* contact footer */
.footer-contact{padding:clamp(20px,3vw,36px) 0}
.footer-contact .fc-email{font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:clamp(1rem,2.5vw,1.4rem);color:${ink}}
.footer-contact .fc-email a{color:${ink}}
.footer-contact .fc-sub{font-family:'IBM Plex Mono',monospace;font-size:0.7rem;letter-spacing:.1em;opacity:.45;margin-top:8px}
${hasMetrics(p.projects) ? `.met-inline{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}
.met-inline .mblock{border:1px solid ${rule};padding:8px 12px;min-width:80px}
.met-inline .mblock .mv{font-family:'IBM Plex Mono',monospace;font-size:1.05rem;font-weight:500;color:${accent};font-variant-numeric:tabular-nums;display:block;line-height:1.2}
.met-inline .mblock .ml{font-family:'IBM Plex Mono',monospace;font-size:0.62rem;letter-spacing:.1em;text-transform:uppercase;opacity:.5;display:block;margin-top:4px}
\n` : ""}</style></head><body>
<div class="doc">

<header class="mast">
<div class="mast-inner">
<div class="name-block">
<h1>${esc(p.name)}</h1>
<div class="headline">${esc(p.headline)}</div>
${credLine ? `<div class="cred-line">${credLine}</div>` : ""}
</div>
<div class="contact-block">
${p.email ? `<div><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></div>` : ""}
${p.phone ? `<div>${esc(p.phone)}</div>` : ""}
<div class="links-row" style="margin-top:6px">${linkRow(p, ink)}</div>
</div>
</div>
</header>

${sec.about && p.summary ? `<section class="section"><div class="section-label">Profile</div><p class="summary-text">${esc(p.summary)}</p></section>` : ""}

${sec.experience && exp.length ? `<section class="section"><div class="section-label">Career History</div>${exp.map((x) => `<div class="exp-entry"><div><div class="exp-role">${esc(x.title)}</div>${x.org ? `<div class="exp-org">${esc(x.org)}</div>` : ""}</div>${x.period ? `<div class="exp-period">${esc(x.period)}</div>` : ""}${x.points.length ? `<ul class="exp-points">${x.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul>` : ""}</div>`).join("")}</section>` : ""}

${sec.projects && p.projects.length ? `<section class="section"><div class="section-label">Engagements</div><table class="engagement" role="table"><thead><tr><th scope="col">Engagement</th><th scope="col">Summary</th><th scope="col">Timeline</th></tr></thead><tbody>${p.projects.map((pr) => { const href = caseHref(pr); const cs = isCaseStudy(pr); return `<tr><td class="eng-name">${href ? `<a href="${href}">${esc(pr.name)}</a>` : esc(pr.name)}${cs ? "" : ""}</td><td class="eng-summ">${esc(pr.summary || pr.desc || "")}</td><td>${pr.timeline ? esc(pr.timeline) : ""}</td></tr>`; }).join("")}</tbody></table></section>` : ""}

${sec.skills && p.skills.length ? `<section class="section"><div class="section-label">Functional Expertise</div><ul class="skill-list">${p.skills.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></section>` : ""}

${sec.certifications !== false && hasCerts(p) ? `<section class="section"><div class="section-label">Qualifications &amp; Credentials</div><ul class="cert-list">${p.certifications.map((c) => `<li><span class="cert-name">${esc(c.name)}</span><span class="cert-meta">${[c.issuer, c.year].filter(Boolean).map(esc).join(" · ")}${c.url ? ` · <a href="${/^http/.test(c.url) ? esc(c.url) : "https://" + esc(c.url)}" target="_blank" rel="noopener noreferrer">Verify</a>` : ""}</span></li>`).join("")}</ul></section>` : ""}

${sec.education && (p.education || []).length ? `<section class="section"><div class="section-label">Education</div><ul class="edu-list">${p.education.map((e) => `<li><span>${esc(eduLabel(e))}</span></li>`).join("")}</ul></section>` : ""}

${sec.languages !== false && hasLangObjs(p) ? `<section class="section"><div class="section-label">Languages</div><ul class="lang-list">${p.languages.map((l) => `<li>${esc(langLabel(l))}</li>`).join("")}</ul></section>` : ""}

${sec.contact ? `<div class="footer-contact"><div class="fc-email">${p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : esc(p.name)}</div><div class="fc-sub">Available for enquiries</div></div>` : ""}

</div>${credit(badge, { fg: ink, accent })}</body></html>`;
}

// ---------- case-study page ----------
export function ledgerCase(p, pal, pr, nav, ctx = {}) {
  const badge = ctx.badge;
  const [paper, ink, accent, rule] = pal.vars;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pr.name)} · ${esc(p.name)}</title><meta name="description" content="${esc(pr.summary || pr.desc || pr.name)}">
${caseHead(p, pal, pr, { bg: paper, panel: paper, accent, accent2: rule, text: ink }, ctx)}
<link href="${FONTS}" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{font-size:16px}
body{background:${paper};color:${ink};font-family:'Source Serif 4',Georgia,serif;line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:${accent};text-decoration:none}
a:hover{text-decoration:underline}
a:focus-visible{outline:2px solid ${accent};outline-offset:2px;border-radius:1px}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}

.doc{max-width:860px;margin:0 auto;padding:0 clamp(20px,5vw,60px)}

/* back nav */
.back-nav{padding:clamp(16px,2.5vw,28px) 0;font-family:'IBM Plex Mono',monospace;font-size:0.72rem;letter-spacing:.1em;border-bottom:1px solid ${rule}}
.back-nav a{color:${ink};opacity:.55}
.back-nav a:hover{opacity:1}

/* case header */
.case-head{border-top:4px solid ${ink};padding:clamp(24px,4vw,48px) 0 clamp(16px,2.5vw,28px);border-bottom:2px solid ${ink}}
.case-label{font-family:'IBM Plex Mono',monospace;font-size:0.68rem;letter-spacing:.22em;text-transform:uppercase;color:${accent};margin-bottom:12px;font-weight:500}
.case-head h1{font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:clamp(1.8rem,5vw,2.9rem);letter-spacing:-.01em;line-height:1.1;color:${ink}}
.case-head .case-sum{font-style:italic;font-size:1.05rem;margin-top:12px;color:${ink};opacity:.72;max-width:62ch}

/* meta row (role, timeline, tools) */
.meta-table{width:100%;border-collapse:collapse;margin-top:clamp(14px,2vw,24px)}
.meta-table td{font-family:'IBM Plex Mono',monospace;padding:8px 16px 8px 0;font-size:0.72rem;border-top:1px solid ${rule};vertical-align:top}
.meta-table td:first-child{letter-spacing:.12em;text-transform:uppercase;opacity:.45;width:110px}
.meta-table td:last-child{color:${ink};opacity:.8}

/* cover image */
.case-cover{width:100%;display:block;border-top:1px solid ${rule};border-bottom:1px solid ${rule};margin:clamp(16px,3vw,32px) 0}

/* content sections */
.cs-section{padding:clamp(20px,3vw,36px) 0;border-bottom:1px solid ${rule}}
.cs-section:last-of-type{border-bottom:none}
.cs-section-label{font-family:'IBM Plex Mono',monospace;font-size:0.68rem;letter-spacing:.22em;text-transform:uppercase;color:${accent};margin-bottom:14px;font-weight:500}
.cs-section p{font-size:1rem;color:${ink};opacity:.88;max-width:68ch;line-height:1.7}

/* metrics: the headline numbers displayed as a mini table */
${Array.isArray(pr.metrics) && pr.metrics.length ? `.met-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0;border-top:2px solid ${ink};margin-top:clamp(14px,2vw,24px)}
.met-grid .mblock{border-right:1px solid ${rule};border-bottom:1px solid ${rule};padding:clamp(12px,2vw,20px) clamp(12px,2vw,20px) clamp(10px,1.5vw,16px)}
.met-grid .mblock:nth-child(4n){border-right:none}
.met-grid .mblock .mv{font-family:'IBM Plex Mono',monospace;font-size:clamp(1.3rem,3.5vw,2rem);font-weight:500;color:${ink};font-variant-numeric:tabular-nums;display:block;line-height:1.1}
.met-grid .mblock .mv .dir{color:${accent};font-size:.75em}
.met-grid .mblock .ml{font-family:'IBM Plex Mono',monospace;font-size:0.65rem;letter-spacing:.1em;text-transform:uppercase;opacity:.45;display:block;margin-top:6px}
\n` : ""}/* nav footer */
.case-nav{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:clamp(20px,3vw,36px) 0;border-top:1px solid ${rule}}
.case-nav a{font-family:'IBM Plex Mono',monospace;font-size:0.72rem;letter-spacing:.08em;color:${ink};opacity:.55}
.case-nav a:hover{opacity:1}
</style></head><body>
<div class="doc">

<nav class="back-nav"><a href="../index.html">&#8592; Back to portfolio</a></nav>

<header class="case-head">
<div class="case-label">Engagement</div>
<h1>${esc(pr.name)}</h1>
${pr.summary || pr.desc ? `<p class="case-sum">${esc(pr.summary || pr.desc)}</p>` : ""}
${(pr.role || pr.timeline || pr.tools) ? `<table class="meta-table" role="presentation"><tbody>${["role","timeline","tools"].filter((k) => pr[k]).map((k) => `<tr><td>${k}</td><td>${esc(pr[k])}</td></tr>`).join("")}</tbody></table>` : ""}
</header>

${pr.cover ? `<img class="case-cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}

${["problem","process","results"].filter((k) => pr[k]).map((k) => `<div class="cs-section"><div class="cs-section-label">${k === "problem" ? "The Problem" : k === "process" ? "The Approach" : "Outcomes"}</div><p>${esc(pr[k])}</p></div>`).join("")}

${Array.isArray(pr.metrics) && pr.metrics.length ? `<div class="cs-section"><div class="cs-section-label">Key Metrics</div><div class="met-grid">${pr.metrics.slice(0, METRICS_CAP).map((m) => { const glyph = DIRECTION_GLYPH[m.direction] || ""; return `<div class="mblock"><span class="mv">${glyph ? `<span class="dir" aria-hidden="true">${glyph}</span>` : ""}${projectLinks(pr, "plinks")}${esc(m.value)}</span><span class="ml">${esc(m.label || "")}</span></div>`; }).join("")}</div></div>` : ""}

<nav class="case-nav">
<a href="../index.html">&#8592; Portfolio</a>
${nav && nav.next ? `<a href="${esc(nav.next.slug)}.html">${esc(nav.next.pr.name)} &#8594;</a>` : ""}
</nav>

</div>${credit(badge, { fg: ink, accent })}</body></html>`;
}

// ---------- palettes ----------
// Three palettes that all honour the annual-report register but give a real
// range across paper stocks and ink choices. None uses a gradient or a glow.
// vars order: [paper, ink, accent, rule]
//   paper: the page background (the stock)
//   ink:   the primary text colour (the ink)
//   accent: one company-colour accent for labels and links
//   rule:   the hairline colour for borders and dividers

export const ledgerPalettes = [
  {
    // Ivory Bond: warm off-white paper stock, dark charcoal ink, a deep navy
    // accent that recalls company-colour stamps on a printed annual report.
    // The hairline is a warm mid-grey, the colour of a printed rule.
    id: "ivory-bond",
    label: "Ivory Bond",
    vars: ["#F5F1E8", "#1C1C1C", "#003D6B", "#C4BAA8"],
  },
  {
    // Stonehaven: a cool grey stock, near-black ink, a slate-green accent that
    // reads as institutional without being blue. Used by audit and advisory
    // houses that want to signal independence without warmth.
    id: "stonehaven",
    label: "Stonehaven",
    vars: ["#F0F0EE", "#1A1A1A", "#2D6A4F", "#C0BDB8"],
  },
  {
    // Night Ledger: dark mode done as a document, not as a dashboard. Charcoal
    // page, near-white ink, a warm amber accent that stands for precision without
    // neon. The rule is a very dark grey, barely visible: discipline in the dark.
    id: "night-ledger",
    label: "Night Ledger",
    vars: ["#1A1A18", "#E8E4DC", "#C8962A", "#2E2E2A"],
  },
];
