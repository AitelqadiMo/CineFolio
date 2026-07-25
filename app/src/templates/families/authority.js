// The authority family. Designed for the individual consultant or business
// strategist: no visual portfolio, no named clients, but a page that must
// project trust and gravitas to a senior professional audience. The visual
// register is a McKinsey or Bain one-pager: authoritative serif headline,
// clean sans body, restrained gold or slate accent, off-white or dark-navy ground.
import {
  esc, indexHead, caseHead, initialsAvatar, linkRow, credit,
  normExperience, hasCerts, hasEduObjs, hasLangObjs, eduLabel, langLabel,
  isCaseStudy, metaRow, csBlocks, metricsBlocks, hasMetrics, noHref, slugify
} from "../shared.js";

// Section rule: "Engagements" maps to projects. We treat case-study projects
// as engagement summaries (deliberately de-identified summaries still render
// substantively because problem/process/results give structure even when names
// are withheld). Plain projects with only a name and desc are rendered as a
// compact credential list, not as creative portfolio cards.

// ----------------------------------------------------------------
// INDEX PAGE
// ----------------------------------------------------------------
export function authority(p, pal, sec, ctx = {}) {
  const [bg, ink, accent, panel, muted] = pal.vars;
  const badge = ctx.badge; // undefined = on by default; false = owner removed it
  const caseHref = ctx.caseHref || noHref;
  const exp = normExperience(p);
  const photo = p.photo || initialsAvatar(p.name, panel, accent);
  const certList = hasCerts(p) ? p.certifications : [];
  const eduList = Array.isArray(p.education) ? p.education : [];
  const csProjects = (p.projects || []).filter(isCaseStudy);
  const plainProjects = (p.projects || []).filter((pr) => !isCaseStudy(pr));
  const hasEngagements = sec.projects && (p.projects || []).length > 0;

  // Credentials: MBA, CFA, and similar degrees/certs carry genuine authority
  // signals for a consultant, so we surface them prominently alongside the name
  // rather than burying them in a footer footnote.
  const credLine = (() => {
    const parts = [];
    for (const c of certList.slice(0, 3)) {
      if (c.name) parts.push(esc(c.name));
    }
    for (const e of eduList.slice(0, 2)) {
      const lbl = eduLabel(e);
      if (lbl) parts.push(esc(lbl));
    }
    return parts.join("  ·  ");
  })();

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} · ${esc(p.headline)}</title><meta name="description" content="${esc(p.summary || p.headline)}">
${indexHead(p, pal, { bg, panel, accent, accent2: accent, text: ink })}
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth;font-size:16px}
body{background:${bg};color:${ink};font-family:Inter,sans-serif;font-weight:400;line-height:1.7;-webkit-font-smoothing:antialiased}
a{color:${accent};text-decoration:none}
a:focus-visible{outline:2px solid ${accent};outline-offset:3px;border-radius:2px}
.wrap{max-width:780px;margin:0 auto;padding:0 clamp(20px,6vw,60px)}

/* ---- masthead ---- */
.mast{padding:clamp(48px,9vh,90px) 0 clamp(32px,5vh,52px);border-bottom:1px solid ${ink}1a}
.mast-inner{display:flex;align-items:flex-start;gap:clamp(24px,4vw,48px)}
.mast-photo{flex-shrink:0;width:84px;height:84px;border-radius:50%;object-fit:cover;border:1px solid ${ink}18}
.mast-body{flex:1;min-width:0}
.mast-name{font-family:'EB Garamond',serif;font-size:clamp(2rem,5vw,3rem);font-weight:500;line-height:1.1;letter-spacing:-.01em;color:${ink}}
.mast-hl{font-size:clamp(.95rem,2vw,1.1rem);font-weight:300;color:${muted};margin-top:6px;letter-spacing:.01em}
.mast-cred{font-size:.78rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:${accent};margin-top:12px;line-height:1.6}
.mast-links{margin-top:14px;font-size:.85rem}
.mast-links a{color:${muted};border-bottom:1px solid ${muted}55;padding-bottom:1px;transition:color .18s,border-color .18s}
.mast-links a:hover{color:${accent};border-color:${accent}88}
@media(prefers-reduced-motion:reduce){.mast-links a{transition:none}}

/* ---- section chrome ---- */
section{padding:clamp(32px,5vh,52px) 0;border-bottom:1px solid ${ink}12}
section:last-of-type{border-bottom:none}
.sec-label{font-size:.72rem;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:${accent};margin-bottom:20px;display:flex;align-items:center;gap:10px}
.sec-label:after{content:"";flex:1;height:1px;background:${accent}30}

/* ---- about / story ---- */
.story{font-family:'EB Garamond',serif;font-size:1.15rem;line-height:1.75;color:${ink}dd;max-width:64ch}

/* ---- expertise (skills) ---- */
.expertise-grid{display:flex;flex-wrap:wrap;gap:8px}
.expertise-tag{font-size:.8rem;letter-spacing:.05em;font-weight:500;padding:5px 13px;border:1px solid ${ink}22;border-radius:2px;color:${ink}cc;background:${panel}}

/* ---- credentials: certifications + education as headline material ---- */
.cred-list{display:flex;flex-direction:column;gap:0}
.cred-row{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid ${ink}0e}
.cred-row:last-child{border-bottom:none}
.cred-name{font-family:'EB Garamond',serif;font-size:1.05rem;color:${ink};font-weight:500}
.cred-meta{font-size:.78rem;color:${muted};letter-spacing:.04em;flex-shrink:0;text-align:right}
.cred-link{display:inline-block;margin-top:3px;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:${accent};border-bottom:1px solid ${accent}55}

/* ---- experience ---- */
.xp-item{padding:20px 0;border-bottom:1px solid ${ink}0e}
.xp-item:last-child{border-bottom:none}
.xp-period{font-size:.72rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${muted};margin-bottom:4px}
.xp-title{font-family:'EB Garamond',serif;font-size:1.18rem;font-weight:500;color:${ink};line-height:1.3}
.xp-org{font-size:.88rem;color:${accent};margin-top:2px;margin-bottom:10px;letter-spacing:.02em}
.xp-pts{list-style:none;padding:0}
.xp-pts li{font-size:.92rem;color:${ink}bb;padding:3px 0 3px 16px;position:relative;line-height:1.6}
.xp-pts li:before{content:"—";position:absolute;left:0;color:${accent};font-weight:600}

/* ---- engagements (projects / case studies) ---- */
.engagement{padding:24px 0;border-bottom:1px solid ${ink}0e}
.engagement:last-child{border-bottom:none}
.engagement-name{font-family:'EB Garamond',serif;font-size:1.18rem;font-weight:500;color:${ink};margin-bottom:6px}
.engagement-name a{color:${ink};border-bottom:1px solid ${accent}55}
.engagement-name a:hover{color:${accent};border-color:${accent}}
.engagement-sum{font-size:.93rem;color:${ink}aa;margin-bottom:12px;max-width:62ch;line-height:1.6}
.engagement-meta{display:flex;gap:24px;flex-wrap:wrap;margin-bottom:14px}
.engagement-meta span{font-size:.78rem;color:${muted};letter-spacing:.04em}
.engagement-meta b{display:block;font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;color:${accent};margin-bottom:2px}
.engagement-blocks{margin-top:10px;display:flex;flex-direction:column;gap:10px}
.eng-blk-label{font-size:.7rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:${accent};margin-bottom:4px}
.eng-blk-body{font-size:.92rem;color:${ink}cc;max-width:64ch;line-height:1.65}
${hasMetrics((p.projects || [])) ? `.eng-metrics{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px}
.eng-metrics div{background:${panel};border:1px solid ${accent}28;border-radius:2px;padding:12px 18px;min-width:90px}
.eng-metrics .mv{font-family:'EB Garamond',serif;font-size:1.7rem;font-weight:500;color:${accent};line-height:1.1}
.eng-metrics .ml{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:${muted};margin-top:4px}
` : ""}
/* ---- plain (non-case-study) projects rendered as a compact list ---- */
.plain-proj-list{display:flex;flex-direction:column;gap:0}
.plain-proj{padding:10px 0;border-bottom:1px solid ${ink}0e;display:flex;gap:16px;align-items:baseline}
.plain-proj:last-child{border-bottom:none}
.plain-proj-name{font-family:'EB Garamond',serif;font-size:1rem;font-weight:500;color:${ink};flex-shrink:0}
.plain-proj-desc{font-size:.88rem;color:${muted};line-height:1.5}

/* ---- languages ---- */
.lang-row{display:flex;flex-wrap:wrap;gap:10px}
.lang-tag{font-size:.82rem;letter-spacing:.04em;color:${ink}cc;padding:4px 12px;border:1px solid ${ink}1a;border-radius:2px}

/* ---- contact / footer ---- */
.contact-block{padding:clamp(32px,5vh,52px) 0 clamp(20px,3vh,32px)}
.contact-heading{font-family:'EB Garamond',serif;font-size:1.6rem;font-style:italic;color:${ink};margin-bottom:12px}
.contact-email{font-size:1rem;color:${accent};border-bottom:1px solid ${accent}55;padding-bottom:2px}
</style></head><body>
<div class="wrap">

<header class="mast">
  <div class="mast-inner">
    <img class="mast-photo" src="${photo}" alt="${esc(p.name)}">
    <div class="mast-body">
      <h1 class="mast-name">${esc(p.name)}</h1>
      <div class="mast-hl">${esc(p.headline)}</div>
      ${credLine ? `<div class="mast-cred">${credLine}</div>` : ""}
      <div class="mast-links">${linkRow(p, muted)}</div>
    </div>
  </div>
</header>

${sec.about && p.summary ? `<section>
  <div class="sec-label">Overview</div>
  <p class="story">${esc(p.summary)}</p>
</section>` : ""}

${sec.skills && (p.skills || []).length ? `<section>
  <div class="sec-label">Areas of Expertise</div>
  <div class="expertise-grid">${p.skills.map((s) => `<span class="expertise-tag">${esc(s)}</span>`).join("")}</div>
</section>` : ""}

${sec.experience && exp.length ? `<section>
  <div class="sec-label">Experience</div>
  <div>${exp.map((x) => `<div class="xp-item">
    ${x.period ? `<div class="xp-period">${esc(x.period)}</div>` : ""}
    <div class="xp-title">${esc(x.title)}</div>
    ${x.org ? `<div class="xp-org">${esc(x.org)}</div>` : ""}
    ${x.points.length ? `<ul class="xp-pts">${x.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul>` : ""}
  </div>`).join("")}</div>
</section>` : ""}

${hasEngagements ? `<section>
  <div class="sec-label">Selected Engagements</div>
  <div>
    ${csProjects.map((pr) => {
      const href = caseHref(pr);
      const metaFields = [["SECTOR / ROLE", pr.role], ["TIMELINE", pr.timeline], ["TOOLS / APPROACH", pr.tools]].filter(([, v]) => v);
      const metaHtml = metaFields.length ? `<div class="engagement-meta">${metaFields.map(([k, v]) => `<span><b>${esc(k)}</b>${esc(v)}</span>`).join("")}</div>` : "";
      const blocks = ["problem", "process", "results"].filter((k) => pr[k]);
      const blockLabels = { problem: "Challenge", process: "Approach", results: "Outcome" };
      const blocksHtml = blocks.length ? `<div class="engagement-blocks">${blocks.map((k) => `<div><div class="eng-blk-label">${blockLabels[k]}</div><div class="eng-blk-body">${esc(pr[k])}</div></div>`).join("")}</div>` : "";
      const metricsHtml = hasMetrics([pr]) ? (() => {
        const cells = (pr.metrics || []).slice(0, 4).map((m) => {
          const glyph = { up: "↑", down: "↓" }[m.direction] || "";
          return `<div><div class="mv">${glyph ? `<span aria-hidden="true">${glyph}</span>` : ""}${esc(m.value)}</div><div class="ml">${esc(m.label || "")}</div></div>`;
        }).join("");
        return `<div class="eng-metrics">${cells}</div>`;
      })() : "";
      return `<div class="engagement">
        <div class="engagement-name">${href ? `<a href="${href}">${esc(pr.name)}</a>` : esc(pr.name)}</div>
        ${pr.summary || pr.desc ? `<div class="engagement-sum">${esc(pr.summary || pr.desc)}</div>` : ""}
        ${metaHtml}
        ${blocksHtml}
        ${metricsHtml}
      </div>`;
    }).join("")}
    ${plainProjects.length ? `<div class="plain-proj-list">${plainProjects.map((pr) => `<div class="plain-proj"><span class="plain-proj-name">${esc(pr.name)}</span><span class="plain-proj-desc">${esc(pr.summary || pr.desc)}</span></div>`).join("")}</div>` : ""}
  </div>
</section>` : ""}

${sec.certifications !== false && certList.length ? `<section>
  <div class="sec-label">Credentials &amp; Certifications</div>
  <div class="cred-list">${certList.map((c) => {
    const meta = [c.issuer, c.year].filter(Boolean).map(esc).join(" · ");
    return `<div class="cred-row">
      <div><div class="cred-name">${esc(c.name)}</div>${c.url ? `<a class="cred-link" href="${/^http/.test(c.url) ? esc(c.url) : "https://" + esc(c.url)}" target="_blank" rel="noopener noreferrer">Verify ↗</a>` : ""}</div>
      ${meta ? `<div class="cred-meta">${meta}</div>` : ""}
    </div>`;
  }).join("")}</div>
</section>` : ""}

${sec.education && eduList.length ? `<section>
  <div class="sec-label">Education</div>
  <div class="cred-list">${eduList.map((e) => {
    const lbl = eduLabel(e);
    if (!lbl) return "";
    if (typeof e === "string") return `<div class="cred-row"><div class="cred-name">${esc(e)}</div></div>`;
    const meta = [e.year].filter(Boolean).map(esc).join("");
    return `<div class="cred-row">
      <div class="cred-name">${e.degree ? esc(e.degree) : esc(lbl)}${e.school ? `<span style="font-weight:400;color:${muted};font-size:.92em"> — ${esc(e.school)}</span>` : ""}</div>
      ${meta ? `<div class="cred-meta">${meta}</div>` : ""}
    </div>`;
  }).join("")}</div>
</section>` : ""}

${sec.languages !== false && hasLangObjs(p) ? `<section>
  <div class="sec-label">Languages</div>
  <div class="lang-row">${p.languages.map((l) => `<span class="lang-tag">${esc(langLabel(l))}</span>`).join("")}</div>
</section>` : ""}

${sec.contact ? `<div class="contact-block">
  <div class="sec-label">Contact</div>
  <div class="contact-heading">Available for engagements.</div>
  ${p.email ? `<a class="contact-email" href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : `<div style="font-size:.92rem;color:${muted}">Reach out via the links above.</div>`}
</div>` : ""}

</div>${credit(badge, { fg: ink, accent })}</body></html>`;
}

// ----------------------------------------------------------------
// CASE-STUDY PAGE (standalone engagement detail)
// ----------------------------------------------------------------
export function authorityCase(p, pal, pr, nav, ctx = {}) {
  const badge = ctx.badge;
  const [bg, ink, accent, panel, muted] = pal.vars;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pr.name)} · ${esc(p.name)}</title><meta name="description" content="${esc(pr.summary || pr.desc || pr.name)}">
${caseHead(p, pal, pr, { bg, panel, accent, accent2: accent, text: ink }, ctx)}
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{font-size:16px}
body{background:${bg};color:${ink};font-family:Inter,sans-serif;font-weight:400;line-height:1.7;-webkit-font-smoothing:antialiased}
a{color:${accent};text-decoration:none}
a:focus-visible{outline:2px solid ${accent};outline-offset:3px;border-radius:2px}
.wrap{max-width:780px;margin:0 auto;padding:0 clamp(20px,6vw,60px)}

.back{display:inline-block;margin:clamp(28px,4vh,44px) 0 0;font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;color:${muted};border-bottom:1px solid ${muted}44;padding-bottom:2px}
.back:hover{color:${accent};border-color:${accent}66}
@media(prefers-reduced-motion:reduce){.back{transition:none}}

.hero{padding:clamp(28px,4vh,44px) 0 clamp(24px,3.5vh,40px);border-bottom:1px solid ${ink}1a}
.hero-label{font-size:.7rem;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:${accent};margin-bottom:14px}
h1{font-family:'EB Garamond',serif;font-size:clamp(1.8rem,5vw,2.8rem);font-weight:500;line-height:1.15;letter-spacing:-.01em;color:${ink};margin-bottom:12px}
.hero-sum{font-family:'EB Garamond',serif;font-size:1.1rem;color:${ink}bb;max-width:62ch;line-height:1.7}

.meta-row{display:flex;gap:28px;flex-wrap:wrap;padding:18px 0;border-top:1px solid ${ink}12;border-bottom:1px solid ${ink}12;margin-top:18px}
.meta-row span{font-size:.82rem;color:${ink}cc}
.meta-row b{display:block;font-size:.68rem;letter-spacing:.16em;text-transform:uppercase;color:${accent};margin-bottom:3px}

.case-body{padding:clamp(28px,4vh,48px) 0}
.blk{margin-bottom:clamp(28px,4vh,44px)}
.blk-label{font-size:.7rem;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:${accent};margin-bottom:12px;display:flex;align-items:center;gap:10px}
.blk-label:after{content:"";flex:1;height:1px;background:${accent}30}
.blk-body{font-family:'EB Garamond',serif;font-size:1.12rem;line-height:1.78;color:${ink}dd;max-width:66ch}
${Array.isArray(pr.metrics) && pr.metrics.length ? `.metrics-row{display:flex;gap:14px;flex-wrap:wrap;margin-top:clamp(20px,3vh,36px)}
.metrics-row div{background:${panel};border:1px solid ${accent}28;border-radius:2px;padding:14px 22px;min-width:100px}
.metrics-row .mv{font-family:'EB Garamond',serif;font-size:2rem;font-weight:500;color:${accent};line-height:1.1}
.metrics-row .ml{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:${muted};margin-top:5px}
` : ""}
.nav-row{display:flex;justify-content:space-between;align-items:center;padding:clamp(24px,3.5vh,40px) 0;border-top:1px solid ${ink}12;margin-top:clamp(16px,2vh,28px);gap:16px;flex-wrap:wrap}
.nav-row a{font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;color:${muted};border-bottom:1px solid ${muted}44;padding-bottom:2px}
.nav-row a:hover{color:${accent};border-color:${accent}66}
</style></head><body>
<div class="wrap">
<a class="back" href="../index.html">← Back to profile</a>

<div class="hero">
  <div class="hero-label">Engagement</div>
  <h1>${esc(pr.name)}</h1>
  ${pr.summary || pr.desc ? `<p class="hero-sum">${esc(pr.summary || pr.desc)}</p>` : ""}
  ${metaRow(pr, "meta-row")}
</div>

<div class="case-body">
${["problem", "process", "results"].filter((k) => pr[k]).map((k) => {
  const labels = { problem: "Challenge", process: "Approach", results: "Outcome" };
  return `<div class="blk">
    <div class="blk-label">${labels[k]}</div>
    <div class="blk-body">${esc(pr[k])}</div>
  </div>`;
}).join("")}${metricsBlocks(pr, "metrics-row")}
</div>

<div class="nav-row">
  <a href="../index.html">← All engagements</a>
  ${nav && nav.next ? `<a href="${esc(nav.next.slug)}.html">Next: ${esc(nav.next.pr.name)} →</a>` : ""}
</div>

</div>${credit(badge, { fg: ink, accent })}</body></html>`;
}

// ----------------------------------------------------------------
// PALETTES  (three with genuine range)
// ----------------------------------------------------------------
// vars order: [bg, ink, accent, panel, muted]
//
// "bg"    page background
// "ink"   primary text
// "accent" the single restrained accent (gold or slate)
// "panel" subtle surface for cards / credentials
// "muted" secondary / label text

export const authorityPalettes = [
  {
    // Parchment: warm off-white ground, deep ink, antique gold accent.
    // Evokes a well-printed annual report or private banking letterhead.
    id: "parchment",
    label: "Parchment",
    vars: ["#F8F4EE", "#1C1A17", "#8B6914", "#EFEBE3", "#6B6460"],
  },
  {
    // Midnight Brief: deep navy ground, warm white text, polished gold.
    // The dark counterpart: a Bain strategy deck printed on thick card stock.
    id: "midnight-brief",
    label: "Midnight Brief",
    vars: ["#111827", "#EDE9E1", "#C9A84C", "#1E2A3A", "#8A8FA0"],
  },
  {
    // Slate Chamber: cool charcoal ground, near-white text, cool slate accent.
    // For the consultant who favours a more institutional, board-room register
    // over warmth: think McKinsey Global Institute cover pages.
    id: "slate-chamber",
    label: "Slate Chamber",
    vars: ["#1F2328", "#E8EAF0", "#6B84A4", "#272D35", "#7A8194"],
  },
];
