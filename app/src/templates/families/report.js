// The report family: data analyst and data scientist portfolio.
// Visual register: the well-designed analytical report. Think The Economist data
// pages, FiveThirtyEight, or a Stripe annual report. Clarity and information
// hierarchy are the primary design values. An explicit visible grid signals
// competence to an audience that reads order as craft. DM Mono (tabular numerals)
// for all figures so metrics align. Off-white canvas; two-colour data accent pair.
// Charts and cover images read as embedded context, not screenshots.
import {
  esc, indexHead, caseHead, initialsAvatar, linkRow, credit,
  normExperience, hasCerts, hasLangObjs, eduLabel, langLabel,
  isCaseStudy, metaRow, metricsBlocks, projectLinks, hasMetrics, noHref,
} from "../shared.js";

// ------------------------------------------------------------------ index page
export function report(p, pal, sec, ctx = {}) {
  // vars[0] canvas (off-white or very light), vars[1] ink (near-black),
  // vars[2] primary data accent, vars[3] secondary data accent, vars[4] rule/muted
  const [canvas, ink, accent, accent2, rule] = pal.vars;
  const caseHref = ctx.caseHref || noHref;
  const badge = ctx.badge; // undefined -> on by default; false -> owner removed it
  const exp = normExperience(p);
  const photo = p.photo || initialsAvatar(p.name, ink, canvas);

  // Skill grouping: classify by keyword presence into broad domains.
  // Only uses the strings in p.skills, never invents data.
  const LANG_KEYS = ["python","r","sql","scala","java","julia","go","javascript","typescript","bash","matlab"];
  const TOOL_KEYS = ["spark","hadoop","pandas","numpy","scikit","sklearn","tensorflow","pytorch","keras","xgboost","dbt","airflow","kafka","flink","snowflake","bigquery","redshift","athena","databricks","tableau","power bi","looker","qlik","metabase","superset"];
  const CLOUD_KEYS = ["aws","azure","gcp","cloud"];
  const langs  = p.skills.filter((s) => LANG_KEYS.some((k) => s.toLowerCase().includes(k)));
  const tools  = p.skills.filter((s) => !langs.includes(s) && TOOL_KEYS.some((k) => s.toLowerCase().includes(k)));
  const clouds = p.skills.filter((s) => !langs.includes(s) && !tools.includes(s) && CLOUD_KEYS.some((k) => s.toLowerCase().includes(k)));
  const other  = p.skills.filter((s) => !langs.includes(s) && !tools.includes(s) && !clouds.includes(s));
  // hasGroups is true only when at least two non-empty buckets exist; otherwise
  // fall back to a flat list so a sparse profile does not render empty sub-headings.
  const groups = [["Languages", langs], ["Libraries & Tools", tools], ["Cloud & Infra", clouds], ["Other", other]].filter(([, arr]) => arr.length);
  const hasGroups = groups.length >= 2;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} · ${esc(p.headline)}</title><meta name="description" content="${esc(p.summary || p.headline)}">
${indexHead(p, pal, { bg: canvas, panel: canvas, accent, accent2, text: ink })}
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,400;0,500;1,400&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,400&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:${canvas};color:${ink};font-family:'DM Sans',sans-serif;font-size:15px;line-height:1.65;overflow-x:hidden}
/* Tabular figures everywhere numbers appear */
.mono{font-family:'DM Mono',monospace;font-variant-numeric:tabular-nums;letter-spacing:.04em}
.label{font-family:'DM Mono',monospace;font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:${accent};font-variant-numeric:tabular-nums}
/* Top rule: the column grid anchor */
.wrap{max-width:960px;margin:0 auto;padding:0 clamp(20px,5vw,60px)}
/* Hairline grid rules (visual) */
.hrule{border:none;border-top:1px solid ${rule};margin:0}
/* Header */
header{padding:8vh 0 5vh;border-bottom:2px solid ${ink}}
.hdr-inner{display:grid;grid-template-columns:1fr auto;align-items:end;gap:32px;flex-wrap:wrap}
.hdr-text h1{font-size:clamp(1.8rem,5vw,3.2rem);font-weight:700;line-height:1.08;letter-spacing:-.02em}
.hdr-text .hl{font-size:clamp(.95rem,2vw,1.08rem);color:${ink}bb;margin-top:10px;font-weight:400}
.hdr-text .links{margin-top:16px;font-size:.88rem}
.hdr-text .links a{color:${accent};text-decoration:none;border-bottom:1px solid ${accent}66}
.ph{width:90px;height:90px;object-fit:cover;border-radius:2px;filter:grayscale(15%);border:1px solid ${rule}}
/* Sections */
section{padding:6vh 0;border-bottom:1px solid ${rule}}
section:last-of-type{border-bottom:none}
.sec-head{display:flex;align-items:baseline;gap:14px;margin-bottom:28px}
.sec-no{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.22em;color:${rule};font-variant-numeric:tabular-nums}
h2{font-size:1.1rem;font-weight:700;letter-spacing:-.01em}
/* Skills: column grid */
.sk-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:24px 40px}
.sk-group h3{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.24em;text-transform:uppercase;color:${accent};margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid ${rule}}
.sk-list{display:flex;flex-wrap:wrap;gap:6px 10px}
.sk-item{font-size:.88rem;padding:4px 10px;border:1px solid ${rule};border-radius:2px;background:transparent}
/* Experience */
.xp-row{display:grid;grid-template-columns:140px 1fr;gap:0 28px;padding:18px 0;border-top:1px solid ${rule}}
.xp-row:first-child{border-top:none}
.xp-period{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.12em;color:${ink}88;padding-top:4px;font-variant-numeric:tabular-nums;line-height:1.5}
.xp-body h3{font-size:.98rem;font-weight:600}
.xp-body .org{font-size:.88rem;color:${accent};margin-top:2px;margin-bottom:8px}
.xp-body li{list-style:disc;margin-left:16px;font-size:.9rem;color:${ink}cc;margin-bottom:4px;line-height:1.55}
/* Projects / analyses */
.proj-cs{padding:22px 0;border-top:1px solid ${rule}}
.proj-cs:first-child{border-top:none}
.proj-cs .proj-cover{width:100%;aspect-ratio:16/7;object-fit:cover;border-radius:2px;border:1px solid ${rule};margin-bottom:16px;display:block;filter:grayscale(8%)}
.proj-cs h3{font-size:1.06rem;font-weight:700;letter-spacing:-.01em}
.proj-cs .sum{color:${ink}bb;margin-top:6px;max-width:64ch;font-size:.94rem}
.proj-simple{padding:14px 0;border-top:1px solid ${rule};display:grid;grid-template-columns:1fr 2.2fr;gap:10px 24px}
.proj-simple:first-child{border-top:none}
.proj-simple b{font-size:.94rem;font-weight:600}
.proj-simple p{font-size:.9rem;color:${ink}bb}
.proj-link{display:inline-block;margin-top:10px;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:${accent};text-decoration:none;border-bottom:1px solid ${accent}66}
/* Dataset-Method-Finding blocks (maps to problem/process/results) */
.dmf{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0;border:1px solid ${rule};margin:16px 0;border-radius:2px}
.dmf-cell{padding:14px 18px;border-right:1px solid ${rule}}
.dmf-cell:last-child{border-right:none}
.dmf-cell .dmf-label{font-family:'DM Mono',monospace;font-size:8.5px;letter-spacing:.24em;text-transform:uppercase;color:${accent};margin-bottom:6px}
.dmf-cell p{font-size:.88rem;color:${ink}cc;line-height:1.5}
/* Certifications: given weight because cloud and analytics credentials matter here */
.cert-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1px;border:1px solid ${rule};border-radius:2px}
.cert-cell{padding:16px 18px;border-right:1px solid ${rule};border-bottom:1px solid ${rule}}
.cert-cell:last-child{border-right:none}
.cert-name{font-size:.94rem;font-weight:600;line-height:1.35}
.cert-meta{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.14em;color:${ink}88;margin-top:4px;font-variant-numeric:tabular-nums}
.cert-link{display:inline-block;margin-top:8px;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:${accent};text-decoration:none;border-bottom:1px solid ${accent}66}
/* Education */
.edu-list{display:flex;flex-direction:column;gap:0}
.edu-item{padding:12px 0;border-top:1px solid ${rule};font-size:.93rem;color:${ink}cc}
.edu-item:first-child{border-top:none}
/* Languages */
.lang-list{display:flex;flex-wrap:wrap;gap:8px 16px}
.lang-tag{font-size:.88rem;padding:5px 12px;border:1px solid ${rule};border-radius:2px}
/* Contact footer */
.contact-foot{padding:7vh 0 4vh;border-top:2px solid ${ink}}
.contact-foot .big{font-size:clamp(1.3rem,3.5vw,2rem);font-weight:700;letter-spacing:-.01em;margin-bottom:14px}
a:focus-visible{outline:2px solid ${accent};outline-offset:3px}
@media(max-width:620px){.hdr-inner{grid-template-columns:1fr}.ph{display:none}.xp-row{grid-template-columns:1fr}.xp-period{padding-bottom:4px}.proj-simple{grid-template-columns:1fr}.dmf{grid-template-columns:1fr}.dmf-cell{border-right:none;border-bottom:1px solid ${rule}}.dmf-cell:last-child{border-bottom:none}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
${hasMetrics(p.projects) ? `.met-row{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0 0}
.met-cell{flex:1;min-width:90px;max-width:160px;padding:14px 16px;border:1px solid ${accent}44;border-radius:2px;display:flex;flex-direction:column;gap:3px}
.met-cell span:first-child{font-family:'DM Mono',monospace;font-variant-numeric:tabular-nums;font-size:1.7rem;font-weight:500;color:${accent};line-height:1}
.met-cell span:last-child{font-family:'DM Mono',monospace;font-size:8.5px;letter-spacing:.2em;text-transform:uppercase;color:${ink}88}
\n` : ""}</style></head><body>
<div class="wrap">
<header>
<div class="hdr-inner">
<div class="hdr-text">
<div class="label" style="margin-bottom:12px">Data Portfolio</div>
<h1>${esc(p.name)}</h1>
<div class="hl">${esc(p.headline)}</div>
<div class="links" style="margin-top:14px">${linkRow(p, ink)}</div>
</div>
<img class="ph" src="${photo}" alt="${esc(p.name)}">
</div>
</header>
${sec.about && p.summary ? `<section><div class="wrap"><div class="sec-head"><span class="sec-no mono">00</span><h2>Abstract</h2></div><p style="font-size:1.03rem;color:${ink}dd;max-width:62ch">${esc(p.summary)}</p></div></section>` : ""}
${sec.skills && p.skills.length ? `<section><div class="wrap"><div class="sec-head"><span class="sec-no mono">01</span><h2>Technical skills</h2></div>${hasGroups ? `<div class="sk-grid">${groups.map(([label, arr]) => `<div class="sk-group"><h3>${label}</h3><div class="sk-list">${arr.map((s) => `<span class="sk-item">${esc(s)}</span>`).join("")}</div></div>`).join("")}</div>` : `<div class="sk-list">${p.skills.map((s) => `<span class="sk-item">${esc(s)}</span>`).join("")}</div>`}</div></section>` : ""}
${sec.experience && exp.length ? `<section><div class="wrap"><div class="sec-head"><span class="sec-no mono">02</span><h2>Experience</h2></div>${exp.map((x) => `<div class="xp-row"><div class="xp-period mono">${esc(x.period)}</div><div class="xp-body"><h3>${esc(x.title)}</h3>${x.org ? `<div class="org">${esc(x.org)}</div>` : ""}${x.points.length ? `<ul>${x.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul>` : ""}</div></div>`).join("")}</div></section>` : ""}
${sec.projects && p.projects.length ? `<section><div class="wrap"><div class="sec-head"><span class="sec-no mono">03</span><h2>Selected analyses</h2></div>${p.projects.filter(isCaseStudy).map((pr) => { const href = caseHref(pr); const hasDmf = pr.problem || pr.process || pr.results; return href
  ? `<div class="proj-cs">${pr.cover ? `<img class="proj-cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}<h3>${esc(pr.name)}</h3>${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}${metaRow(pr, "csmeta-r")}<a class="proj-link" href="${href}">View full analysis →</a></div>`
  : `<div class="proj-cs">${pr.cover ? `<img class="proj-cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}<h3>${esc(pr.name)}</h3>${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}${metaRow(pr, "csmeta-r")}${hasDmf ? `<div class="dmf">${pr.problem ? `<div class="dmf-cell"><div class="dmf-label">Dataset</div><p>${esc(pr.problem)}</p></div>` : ""}${pr.process ? `<div class="dmf-cell"><div class="dmf-label">Method</div><p>${esc(pr.process)}</p></div>` : ""}${pr.results ? `<div class="dmf-cell"><div class="dmf-label">Finding</div><p>${esc(pr.results)}</p></div>` : ""}</div>` : ""}${metricsBlocks(pr, "met-row")}${projectLinks(pr, "plinks")}</div>`; }).join("")}${p.projects.filter((pr) => !isCaseStudy(pr)).length ? `<div style="margin-top:24px">${p.projects.filter((pr) => !isCaseStudy(pr)).map((pr) => `<div class="proj-simple"><b>${esc(pr.name)}</b><p>${esc(pr.summary || pr.desc)}</p></div>`).join("")}</div>` : ""}</div></section>` : ""}
${sec.certifications !== false && hasCerts(p) ? `<section><div class="wrap"><div class="sec-head"><span class="sec-no mono">04</span><h2>Certifications</h2></div><div class="cert-grid">${p.certifications.map((c) => `<div class="cert-cell"><div class="cert-name">${esc(c.name)}</div><div class="cert-meta">${[c.issuer, c.year].filter(Boolean).map(esc).join(" · ")}</div>${c.url ? `<a class="cert-link" href="${/^http/.test(c.url) ? esc(c.url) : "https://" + esc(c.url)}" target="_blank" rel="noopener noreferrer">Credential ↗</a>` : ""}</div>`).join("")}</div></div></section>` : ""}
${sec.education && (p.education || []).length ? `<section><div class="wrap"><div class="sec-head"><span class="sec-no mono">05</span><h2>Education</h2></div><div class="edu-list">${p.education.map((e) => `<div class="edu-item">${esc(eduLabel(e))}</div>`).join("")}</div></div></section>` : ""}
${sec.languages !== false && hasLangObjs(p) ? `<section><div class="wrap"><div class="sec-head"><span class="sec-no mono">06</span><h2>Languages</h2></div><div class="lang-list">${p.languages.map((l) => `<span class="lang-tag">${esc(langLabel(l))}</span>`).join("")}</div></div></section>` : ""}
${sec.contact ? `<div class="contact-foot wrap"><div class="big">${p.email ? `<a href="mailto:${esc(p.email)}" style="color:${ink};text-decoration:none;border-bottom:2px solid ${accent}">${esc(p.email)}</a>` : "Get in touch"}</div><div style="font-size:.88rem">${linkRow(p, ink)}</div></div>` : ""}
</div>${credit(badge, { fg: ink, accent })}</body></html>`;
}

// --------------------------------------------------------------- case study page
export function reportCase(p, pal, pr, nav, ctx = {}) {
  const badge = ctx.badge;
  const [canvas, ink, accent, accent2, rule] = pal.vars;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pr.name)} · ${esc(p.name)}</title><meta name="description" content="${esc(pr.summary || pr.desc || pr.name)}">
${caseHead(p, pal, pr, { bg: canvas, panel: canvas, accent, accent2, text: ink }, ctx)}
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,400;0,500;1,400&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,400&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:${canvas};color:${ink};font-family:'DM Sans',sans-serif;font-size:15px;line-height:1.7;overflow-x:hidden}
.mono{font-family:'DM Mono',monospace;font-variant-numeric:tabular-nums;letter-spacing:.04em}
.label{font-family:'DM Mono',monospace;font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:${accent};font-variant-numeric:tabular-nums}
.wrap{max-width:840px;margin:0 auto;padding:0 clamp(20px,5vw,60px)}
.hrule{border:none;border-top:1px solid ${rule};margin:0}
.back{display:inline-block;margin:5vh 0 0;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.18em;color:${accent};text-decoration:none;border-bottom:1px solid ${accent}66}
/* Header */
.cs-header{padding:5vh 0 4vh;border-bottom:2px solid ${ink}}
.cs-header h1{font-size:clamp(1.8rem,5vw,3rem);font-weight:700;letter-spacing:-.02em;line-height:1.08;margin-top:12px}
.cs-sum{font-size:1.08rem;color:${ink}bb;max-width:62ch;margin-top:12px}
/* Meta row (role / timeline / tools) */
.meta-r{display:flex;gap:28px;flex-wrap:wrap;margin-top:20px;padding-top:16px;border-top:1px solid ${rule}}
.meta-r span{font-size:.9rem;color:${ink}cc}
.meta-r b{display:block;font-family:'DM Mono',monospace;font-size:8.5px;letter-spacing:.22em;text-transform:uppercase;color:${accent};margin-bottom:3px;font-variant-numeric:tabular-nums}
/* Cover image: read as embedded chart, not screenshot */
.cs-cover{width:100%;aspect-ratio:16/7;object-fit:cover;border-radius:2px;border:1px solid ${rule};margin:4vh 0 0;display:block;filter:grayscale(8%)}
/* Dataset-Method-Finding three-column panel */
.dmf-panel{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0;border:1px solid ${rule};margin:4vh 0;border-radius:2px}
.dmf-col{padding:18px 20px;border-right:1px solid ${rule}}
.dmf-col:last-child{border-right:none}
.dmf-col .dmf-lbl{font-family:'DM Mono',monospace;font-size:8.5px;letter-spacing:.24em;text-transform:uppercase;color:${accent};margin-bottom:8px;font-variant-numeric:tabular-nums}
.dmf-col p{font-size:.93rem;color:${ink}cc;line-height:1.55}
/* Metrics: the finding usually IS a number */
${Array.isArray(pr.metrics) && pr.metrics.length ? `.met-row{display:flex;flex-wrap:wrap;gap:12px;margin:3vh 0}
.met-cell{flex:1;min-width:100px;max-width:170px;padding:16px 18px;border:1px solid ${accent}44;border-radius:2px;display:flex;flex-direction:column;gap:4px}
.met-cell span:first-child{font-family:'DM Mono',monospace;font-variant-numeric:tabular-nums;font-size:1.9rem;font-weight:500;color:${accent};line-height:1}
.met-cell span:last-child{font-family:'DM Mono',monospace;font-size:8.5px;letter-spacing:.2em;text-transform:uppercase;color:${ink}88}
\n` : ""}/* Navigation */
.cs-nav{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:5vh 0 3vh;border-top:1px solid ${rule}}
.cs-nav a{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:${accent};text-decoration:none;border-bottom:1px solid ${accent}66}
a:focus-visible{outline:2px solid ${accent};outline-offset:3px}
@media(max-width:620px){.dmf-panel{grid-template-columns:1fr}.dmf-col{border-right:none;border-bottom:1px solid ${rule}}.dmf-col:last-child{border-bottom:none}.meta-r{gap:16px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style></head><body>
<div class="wrap">
<a class="back" href="../index.html">← Back to portfolio</a>
<div class="cs-header">
<div class="label">Analysis</div>
<h1>${esc(pr.name)}</h1>
${pr.summary || pr.desc ? `<p class="cs-sum">${esc(pr.summary || pr.desc)}</p>` : ""}
${(pr.role || pr.timeline || pr.tools) ? `<div class="meta-r">${pr.role ? `<span><b>Role</b>${esc(pr.role)}</span>` : ""}${pr.timeline ? `<span><b>Timeline</b>${esc(pr.timeline)}</span>` : ""}${pr.tools ? `<span><b>Tools</b>${esc(pr.tools)}</span>` : ""}</div>` : ""}
</div>
${pr.cover ? `<img class="cs-cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}
${(pr.problem || pr.process || pr.results) ? `<div class="dmf-panel">${pr.problem ? `<div class="dmf-col"><div class="dmf-lbl">Dataset</div><p>${esc(pr.problem)}</p></div>` : ""}${pr.process ? `<div class="dmf-col"><div class="dmf-lbl">Method</div><p>${esc(pr.process)}</p></div>` : ""}${pr.results ? `<div class="dmf-col"><div class="dmf-lbl">Finding</div><p>${esc(pr.results)}</p></div>` : ""}</div>` : ""}
${metricsBlocks(pr, "met-row")}${projectLinks(pr, "plinks")}
<div class="cs-nav"><a href="../index.html">← All analyses</a>${nav && nav.next ? `<a href="${esc(nav.next.slug)}.html">Next: ${esc(nav.next.pr.name)} →</a>` : ""}</div>
</div>${credit(badge, { fg: ink, accent })}</body></html>`;
}

// ------------------------------------------------------------------ palettes
// Three palettes with real range: not tints of one hue but distinct registers.
// Each uses 5 vars: canvas, ink, accent, accent2, rule.
export const reportPalettes = [
  {
    id: "ledger",
    label: "Ledger",
    // Off-white page, near-black ink, steel blue primary accent, amber secondary.
    // Reads like a quality printed research brief: authoritative, clean.
    vars: ["#F7F7F5", "#1A1A1A", "#1D5FA8", "#C87533", "#DEDEDE"],
  },
  {
    id: "slate",
    label: "Slate",
    // Very light warm grey canvas, charcoal ink, teal primary, coral secondary.
    // Closer to a modern data product dashboard: considered, analytical.
    vars: ["#F2F2EF", "#212121", "#006E6E", "#C0392B", "#D8D8D5"],
  },
  {
    id: "nocturne",
    label: "Nocturne",
    // Dark mode: deep grey canvas, near-white ink, electric blue primary, gold secondary.
    // The late-night analyst's view; figures pop like a terminal chart.
    vars: ["#16181C", "#E8E8E6", "#4A9EFF", "#E6B84A", "#2E3038"],
  },
];
