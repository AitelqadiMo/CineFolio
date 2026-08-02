// outcome.js · CineFolio template family for Product Managers.
//
// Design rationale: the target reader is a hiring manager or recruiter who
// thinks in business outcomes, not in screenshots or commits. The visual
// language is lifted from two real-world artifacts those readers already
// trust: (1) an internal company dashboard, where numbers are the primary
// signal and everything else is annotation, and (2) a Y Combinator
// application, where you lead with traction and earn the narrative paragraph
// by demonstrating the metric first. Numbers are the largest elements on the
// page. Tabular-numerals font-variant is applied so figures align in columns.
// Nothing is decorative: no gradients, no icons invented from thin air,
// no fake company logos.
//
// Profession-specific sections rendered from existing fields:
//   - Metric hero blocks on the index (p.projects[].metrics[], shown before
//     the project name so a recruiter sees quantified outcomes immediately).
//   - Full metricsBlocks in the case page, where the numbers are the page's
//     centrepiece: bigger than the project name.
//   - Product timeline from p.experience (via normExperience), rendered as a
//     left-ruled chronology with shipped-work framing, not a job-duties list.
//   - Frameworks-and-tools block from p.skills[].
//   - Stakeholder quotes from p.testimonials[] when present.
//
// What the data model cannot support and is therefore omitted:
//   - Company logos (no logo field exists).
//   - GitHub contribution graphs (no commit data).
//   - Embed URLs for product demos or prototype links (no embed field).
//   - Quarterly OKR tables (no structured OKR field).
//   - PRD or spec document links (no document-link field).

import {
  esc,
  indexHead,
  caseHead,
  credit,
  normExperience,
  hasCerts,
  hasLangObjs,
  eduLabel,
  langLabel,
  linkRow,
  initialsAvatar,
  metaRow,
  isCaseStudy,
  hasMetrics,
  metricsBlocks, projectLinks,
  DIRECTION_GLYPH,
  noHref,
} from "../shared.js";

// ---------- local helpers ----------

// Render up to 3 headline metric tiles on the INDEX page for one project.
// These run before the project name, ensuring a recruiter sees quantified
// outcomes before reading anything else. Absent or neutral direction renders
// no glyph, as the brief requires.
function indexMetricRow(pr) {
  const metrics = Array.isArray(pr.metrics) ? pr.metrics.slice(0, 3) : [];
  if (!metrics.length) return "";
  return metrics.map((m) => {
    const dir = m.direction === "up" ? DIRECTION_GLYPH.up
      : m.direction === "down" ? DIRECTION_GLYPH.down
      : "";
    return `<div class="om-is"><span class="om-iv">${esc(m.value)}${dir ? `<span class="om-idir" aria-hidden="true">${dir}</span>` : ""}</span><span class="om-il">${esc(m.label)}</span></div>`;
  }).join("");
}

/* ================================================================
   INDEX PAGE
================================================================ */
export function outcome(p, pal, sec, ctx = {}) {
  // Palette vars: [canvas, ink, accent, muted, rule]
  const [canvas, ink, accent, muted, rule] = pal.vars;
  const badge = ctx.badge;
  const caseHref = ctx.caseHref || noHref;
  const exp = normExperience(p);
  const photo = p.photo || initialsAvatar(p.name, ink, canvas);

  // Colors passed to indexHead for og:image card generation. The card builder
  // expects { bg, panel, accent, accent2, text }. We use canvas as bg, a
  // slightly-tinted canvas as panel, accent for accent, and ink for text.
  const colors = { bg: canvas, panel: canvas, accent, accent2: accent, text: ink };

  // Gate optional CSS on data presence so a minimal profile produces identical
  // output to one that never had those features.
  const anyMetrics = hasMetrics(p.projects);
  const csProjects = (p.projects || []).filter(isCaseStudy);
  const plainProjects = (p.projects || []).filter((pr) => !isCaseStudy(pr));
  const testimonials = Array.isArray(p.testimonials) ? p.testimonials : [];

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} · ${esc(p.headline)}</title>
<meta name="description" content="${esc(p.summary || p.headline)}">
${indexHead(p, pal, colors)}
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}
body{background:${canvas};color:${ink};font-family:'DM Sans',system-ui,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
.om-mono{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:${muted}}
a{color:${accent};text-decoration:none}
a:focus-visible{outline:2px solid ${accent};outline-offset:3px}
.om-w{max-width:1020px;margin:0 auto;padding:0 clamp(18px,6vw,64px)}
/* ------ header ------ */
.om-hd{padding:10vh 0 7vh;border-bottom:1px solid ${rule}}
.om-hi{display:grid;grid-template-columns:1fr auto;align-items:start;gap:32px}
.om-ph{width:80px;height:80px;border-radius:8px;object-fit:cover;flex-shrink:0;display:block}
.om-nm{font-family:'Playfair Display',serif;font-weight:700;font-size:clamp(2rem,5vw,3.4rem);line-height:1.05;letter-spacing:-.02em}
.om-hl{font-size:1.08rem;color:${muted};margin-top:8px;max-width:54ch}
.om-lk{margin-top:18px}
.om-lk a{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.12em;color:${ink};border-bottom:1px solid ${rule};transition:color .15s,border-color .15s}
.om-lk a:hover{border-color:${accent};color:${accent}}
/* ------ section pattern ------ */
.om-sec{padding:7vh 0}
h2.om-sh{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:${muted};margin-bottom:28px;border-bottom:1px solid ${rule};padding-bottom:10px}
.om-rule{height:1px;background:${rule};margin:0 clamp(18px,6vw,64px)}
/* ------ about ------ */
.om-story{font-size:1.12rem;color:${ink};max-width:60ch;line-height:1.72}
/* ------ project cards (metrics-first layout) ------ */
.om-pg{display:grid;gap:16px}
.om-pc{border:1px solid ${rule};border-radius:8px;padding:28px 28px 22px;background:${canvas};transition:border-color .2s,box-shadow .2s}
.om-pc:hover{border-color:${accent}55;box-shadow:0 4px 24px rgba(0,0,0,.06)}
.om-ph2{display:flex;justify-content:space-between;align-items:baseline;gap:16px;flex-wrap:wrap;margin-bottom:16px}
.om-pn{font-size:1.15rem;font-weight:700;color:${ink}}
.om-pr{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.16em;color:${muted};text-transform:uppercase}
.om-ps{font-size:.97rem;color:${muted};max-width:64ch;margin-top:8px}
.om-pl{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:${accent};border-bottom:1px solid ${accent}55;margin-top:16px;display:inline-block}
${anyMetrics ? `.om-ir{display:flex;gap:28px;flex-wrap:wrap;padding:18px 0;border-top:1px solid ${rule};border-bottom:1px solid ${rule};margin:16px 0}
.om-is{display:flex;flex-direction:column;gap:4px}
.om-iv{font-family:'DM Mono',monospace;font-size:2rem;font-weight:500;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.01em;color:${accent}}
.om-il{font-family:'DM Mono',monospace;font-size:9.5px;letter-spacing:.24em;text-transform:uppercase;color:${muted}}
.om-idir{font-size:1.4rem;margin-left:3px;vertical-align:middle}
` : ""}/* ------ plain projects ------ */
.om-ppg{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:16px}
.om-ppc{border:1px solid ${rule};border-radius:6px;padding:18px}
.om-ppc b{font-weight:600;font-size:.97rem}
.om-ppc p{font-size:.9rem;color:${muted};margin-top:5px}
/* ------ career timeline ------ */
.om-tl{position:relative;padding-left:24px}
.om-tl:before{content:"";position:absolute;left:0;top:6px;bottom:0;width:1px;background:${rule}}
.om-ti{position:relative;margin-bottom:32px}
.om-ti:last-child{margin-bottom:0}
.om-ti:before{content:"";position:absolute;left:-28px;top:7px;width:9px;height:9px;border-radius:50%;border:2px solid ${accent};background:${canvas}}
.om-tp{font-family:'DM Mono',monospace;font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:${muted};margin-bottom:4px}
.om-tt{font-weight:700;font-size:1.02rem;color:${ink}}
.om-to{font-size:.92rem;color:${accent};margin-bottom:8px}
.om-tpts{list-style:none;margin-top:8px}
.om-tpts li{font-size:.93rem;color:${muted};padding:3px 0 3px 14px;position:relative}
.om-tpts li:before{content:"→";position:absolute;left:0;color:${accent};font-size:.8rem}
/* ------ frameworks and tools ------ */
.om-sk{display:flex;flex-wrap:wrap;gap:8px}
.om-tag{font-family:'DM Mono',monospace;font-size:10.5px;letter-spacing:.06em;padding:7px 13px;border:1px solid ${rule};border-radius:4px;color:${ink};background:${canvas};white-space:nowrap}
/* ------ stakeholder quotes ------ */
.om-q{border-left:3px solid ${accent};padding:10px 0 10px 20px;margin-bottom:20px}
.om-q p{font-size:1.06rem;color:${ink};font-style:italic;max-width:58ch;line-height:1.65}
.om-q cite{font-family:'DM Mono',monospace;font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:${muted};margin-top:8px;display:block;font-style:normal}
/* ------ education, certs, languages ------ */
.om-edu{list-style:none}
.om-edu li{padding:10px 0;border-bottom:1px solid ${rule};font-size:.97rem}
.om-edu li:last-child{border-bottom:0}
.om-cg{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
.om-cc{border:1px solid ${rule};border-radius:6px;padding:14px}
.om-cc b{font-weight:600;font-size:.95rem}
.om-cm{font-family:'DM Mono',monospace;font-size:9.5px;letter-spacing:.12em;color:${muted};margin-top:4px;text-transform:uppercase}
.om-cc a{font-size:.88rem}
.om-lng{display:flex;flex-wrap:wrap;gap:8px}
/* ------ footer / contact ------ */
.om-ft{padding:9vh 0 3vh;border-top:1px solid ${rule};text-align:center}
.om-ftc{font-family:'Playfair Display',serif;font-size:clamp(1.6rem,4vw,2.6rem);font-weight:700;color:${ink};margin-bottom:20px}
.om-ftl a{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.12em;color:${ink};border-bottom:1px solid ${rule};transition:color .15s,border-color .15s}
.om-ftl a:hover{color:${accent};border-color:${accent}}
/* ------ responsive + motion ------ */
@media(max-width:600px){.om-hi{grid-template-columns:1fr}.om-ph{display:none}.om-iv{font-size:1.6rem}}
@media(prefers-reduced-motion:reduce){.om-pc,.om-lk a,.om-ftl a{transition:none}}
</style></head><body>
<header class="om-w">
<div class="om-hd">
<div class="om-hi">
<div>
<div class="om-mono" style="margin-bottom:14px">Product Management</div>
<div class="om-nm">${esc(p.name)}</div>
<div class="om-hl">${esc(p.headline)}</div>
<div class="om-lk" style="margin-top:16px">${linkRow(p, ink)}</div>
</div>
<img class="om-ph" src="${photo}" alt="${esc(p.name)}" width="80" height="80">
</div>
</div>
</header>
${sec.about && p.summary ? `<section class="om-w om-sec"><h2 class="om-sh">About</h2><p class="om-story">${esc(p.summary)}</p></section><div class="om-rule"></div>` : ""}
${sec.projects && (p.projects || []).length ? `<section class="om-w om-sec"><h2 class="om-sh">Product work</h2><div class="om-pg">${csProjects.map((pr) => { const href = caseHref(pr); const mRow = indexMetricRow(pr); return `<article class="om-pc"><div class="om-ph2"><span class="om-pn">${esc(pr.name)}</span>${pr.role ? `<span class="om-pr">${esc(pr.role)}</span>` : ""}</div>${mRow ? `<div class="om-ir">${mRow}</div>` : ""}${pr.summary || pr.desc ? `<p class="om-ps">${esc(pr.summary || pr.desc)}</p>` : ""}${href ? `<a class="om-pl" href="${href}">Full case study</a>` : ""}</article>`; }).join("")}</div>${plainProjects.length ? `<div class="om-ppg">${plainProjects.map((pr) => `<div class="om-ppc"><b>${esc(pr.name)}</b>${pr.summary || pr.desc ? `<p>${esc(pr.summary || pr.desc)}</p>` : ""}</div>`).join("")}</div>` : ""}</section><div class="om-rule"></div>` : ""}
${sec.experience && exp.length ? `<section class="om-w om-sec"><h2 class="om-sh">Career timeline</h2><div class="om-tl">${exp.map((x) => `<div class="om-ti">${x.period ? `<div class="om-tp">${esc(x.period)}</div>` : ""}<div class="om-tt">${esc(x.title)}</div>${x.org ? `<div class="om-to">${esc(x.org)}</div>` : ""}${x.points.length ? `<ul class="om-tpts">${x.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul>` : ""}</div>`).join("")}</div></section><div class="om-rule"></div>` : ""}
${sec.skills && (p.skills || []).length ? `<section class="om-w om-sec"><h2 class="om-sh">Frameworks &amp; tools</h2><div class="om-sk">${(p.skills || []).map((s) => `<span class="om-tag">${esc(s)}</span>`).join("")}</div></section><div class="om-rule"></div>` : ""}
${sec.testimonials && testimonials.length ? `<section class="om-w om-sec"><h2 class="om-sh">Stakeholder perspectives</h2>${testimonials.map((t) => `<blockquote class="om-q"><p>"${esc(t.quote)}"</p><cite>${esc(t.who)}</cite></blockquote>`).join("")}</section><div class="om-rule"></div>` : ""}
${sec.education && (p.education || []).length ? `<section class="om-w om-sec"><h2 class="om-sh">Education</h2><ul class="om-edu">${p.education.map((e) => `<li>${esc(eduLabel(e))}</li>`).join("")}</ul></section><div class="om-rule"></div>` : ""}
${sec.certifications !== false && hasCerts(p) ? `<section class="om-w om-sec"><h2 class="om-sh">Certifications</h2><div class="om-cg">${p.certifications.map((c) => `<div class="om-cc"><b>${esc(c.name)}</b><div class="om-cm">${[c.issuer, c.year].filter(Boolean).map(esc).join(" · ")}</div>${c.url ? `<div style="margin-top:8px"><a href="${/^http/.test(c.url) ? esc(c.url) : "https://" + esc(c.url)}" target="_blank" rel="noopener noreferrer">Credential</a></div>` : ""}</div>`).join("")}</div></section><div class="om-rule"></div>` : ""}
${sec.languages !== false && hasLangObjs(p) ? `<section class="om-w om-sec"><h2 class="om-sh">Languages</h2><div class="om-lng">${p.languages.map((l) => `<span class="om-tag">${esc(langLabel(l))}</span>`).join("")}</div></section><div class="om-rule"></div>` : ""}
${sec.contact ? `<footer class="om-w"><div class="om-ft"><div class="om-ftc">Let's build the right thing.</div><div class="om-ftl">${linkRow(p, ink)}</div></div></footer>` : ""}
${credit(badge, { fg: ink, accent })}
</body></html>`;
}

/* ================================================================
   CASE-STUDY PAGE
================================================================ */
export function outcomeCase(p, pal, pr, nav, ctx = {}) {
  // Palette vars: [canvas, ink, accent, muted, rule]
  const [canvas, ink, accent, muted, rule] = pal.vars;
  const badge = ctx.badge;

  // Colors for caseHead's og:image card.
  const colors = { bg: canvas, panel: canvas, accent, accent2: accent, text: ink };

  // metricsBlocks returns "" when absent, so hasM gates the CSS block only.
  const hasM = Array.isArray(pr.metrics) && pr.metrics.length > 0;

  // Back link: when nav is present we are in a bundle (../index.html); when not,
  // we fall back gracefully to the ctx path or "#".
  const backHref = nav ? "../index.html" : (ctx.path ? ctx.path.replace(/[^/]*$/, "index.html") : "#");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pr.name)} · ${esc(p.name)}</title>
${caseHead(p, pal, pr, colors, ctx)}
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}
body{background:${canvas};color:${ink};font-family:'DM Sans',system-ui,sans-serif;line-height:1.65;-webkit-font-smoothing:antialiased}
.om-mono{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:${muted}}
a{color:${accent};text-decoration:none}
a:focus-visible{outline:2px solid ${accent};outline-offset:3px}
.om-w{max-width:880px;margin:0 auto;padding:0 clamp(18px,6vw,64px)}
.om-rule{height:1px;background:${rule};margin:0}
/* ------ back link ------ */
.om-bk{display:inline-block;padding:5vh 0 0;font-family:'DM Mono',monospace;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:${muted};border-bottom:1px solid ${rule};transition:color .15s,border-color .15s}
.om-bk:hover{color:${accent};border-color:${accent}}
/* ------ hero ------ */
.om-hero{padding:5vh 0 4vh;border-bottom:1px solid ${rule}}
.om-ht{font-family:'Playfair Display',serif;font-size:clamp(2rem,6vw,3.6rem);font-weight:700;line-height:1.05;letter-spacing:-.02em;margin-top:16px}
.om-hs{font-size:1.1rem;color:${muted};max-width:58ch;margin-top:14px;line-height:1.65}
/* ------ meta row (role, timeline, tools) ------ */
.om-meta{display:flex;gap:32px;flex-wrap:wrap;padding:18px 0;border-bottom:1px solid ${rule}}
.om-meta span{font-size:.9rem}
.om-meta b{display:block;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.26em;text-transform:uppercase;color:${muted};margin-bottom:3px}
/* ------ metrics: the centrepiece of this template ------ */
${hasM ? `.om-ms{padding:5vh 0;border-bottom:1px solid ${rule}}
.om-mg{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:24px 32px}
.om-mg>div{display:flex;flex-direction:column;gap:6px}
.om-mg>div>span:first-child{font-family:'DM Mono',monospace;font-size:clamp(2.4rem,5vw,3.4rem);font-weight:500;line-height:1;font-variant-numeric:tabular-nums;color:${accent}}
.om-mg>div>span:last-child{font-family:'DM Mono',monospace;font-size:9.5px;letter-spacing:.24em;text-transform:uppercase;color:${muted};max-width:18ch}
.om-mg>div>span:first-child>span{font-size:2rem;vertical-align:middle;margin-left:4px}
` : ""}/* ------ narrative blocks ------ */
.om-blk{padding:5vh 0;border-bottom:1px solid ${rule}}
.om-blk:last-of-type{border-bottom:0}
.om-bll{font-family:'DM Mono',monospace;font-size:9.5px;letter-spacing:.3em;text-transform:uppercase;color:${muted};margin-bottom:14px}
.om-blp{font-size:1.06rem;color:${ink};max-width:70ch;line-height:1.72}
/* ------ case navigation ------ */
.om-nav{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:5vh 0;border-top:1px solid ${rule}}
.om-nav a{font-family:'DM Mono',monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:${muted};border-bottom:1px solid ${rule};transition:color .15s,border-color .15s}
.om-nav a:hover{color:${accent};border-color:${accent}}
@media(max-width:540px){.om-mg>div>span:first-child{font-size:2rem}}
@media(prefers-reduced-motion:reduce){.om-bk,.om-nav a{transition:none}}
</style></head><body>
<div class="om-w">
<a class="om-bk" href="${esc(backHref)}">&#8592; Back to portfolio</a>
<div class="om-hero">
<div class="om-mono">Case study</div>
<h1 class="om-ht">${esc(pr.name)}</h1>
${pr.summary || pr.desc ? `<p class="om-hs">${esc(pr.summary || pr.desc)}</p>` : ""}
</div>
${metaRow(pr, "om-meta")}
${hasM ? `<section class="om-ms"><div class="om-mono" style="margin-bottom:20px">Outcomes</div>${metricsBlocks(pr, "om-mg")}${projectLinks(pr, "plinks")}</section>` : ""}
${["problem", "process", "results"].filter((k) => pr[k]).map((k) => `<div class="om-blk"><div class="om-bll">${k === "problem" ? "The problem" : k === "process" ? "The approach" : "The results"}</div><p class="om-blp">${esc(pr[k])}</p></div>`).join("")}
${nav ? `<nav class="om-nav" aria-label="Case study navigation"><a href="../index.html">All case studies</a>${nav.next ? `<a href="${esc(nav.next.slug)}.html">Next: ${esc(nav.next.pr.name)} &#8594;</a>` : ""}</nav>` : ""}
</div>
${credit(badge, { fg: ink, accent })}
</body></html>`;
}

/* ================================================================
   PALETTES (three with real range: not tints of one hue)
================================================================ */
// Each entry vars: [canvas, ink, accent, muted, rule]
//
// "daybreak"  : off-white canvas, deep navy ink, electric blue accent. Evokes
//               the investor deck or internal PRD. Clean, confident, credible.
//               The natural default for most PM contexts.
//
// "evergreen" : warm white canvas, dark forest ink, green accent. Reads like a
//               well-maintained product spec or OKR document. Calm and
//               trustworthy; good for enterprise or sustainability-focused PM roles.
//
// "signal"    : near-black canvas, light cream text, bright amber accent.
//               References the ops dashboard left open overnight: high contrast,
//               metrics pop. Good for growth or data-PM roles where the recruiter
//               is a numbers-first reader.
export const outcomePalettes = [
  {
    id: "daybreak",
    label: "Daybreak",
    vars: ["#F7F8FA", "#0E1726", "#2563EB", "#64748B", "#E2E6ED"],
  },
  {
    id: "evergreen",
    label: "Evergreen",
    vars: ["#F8F8F4", "#1A2620", "#15803D", "#556B5A", "#D9E4DB"],
  },
  {
    id: "signal",
    label: "Signal",
    vars: ["#0E1117", "#F0EDE6", "#F59E0B", "#8A8E96", "#1E242F"],
  },
];
