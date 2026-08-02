// The "brief" family: a portfolio skin for UX and product designers.
// The visual register is the well-produced internal product brief or design spec:
// near-white canvas, a single controlled accent, humanist sans typography,
// generous whitespace, every element earning its place. The inference that the
// designer produced this interface themselves is both intentional and load-bearing.
// The case-study page is the structural heart of this template. It does NOT mimic
// the editorial family: that family cannot express challenge, process and outcome.
// This one is built specifically to host those sections.
import {
  esc, indexHead, caseHead, initialsAvatar, linkRow, credit,
  normExperience, hasCerts, hasLangObjs, eduLabel, langLabel,
  isCaseStudy, metaRow, noHref, metricsBlocks, projectLinks, hasMetrics, slugify
} from "../shared.js";

// ---------- internal helpers used only inside this family ----------

// sectionLabel: readable display name for the three case-study narrative fields.
// Kept as a lookup rather than inline ternary chains so it reads at a glance.
const SECTION_LABEL = { problem: "The Challenge", process: "Process", results: "Solution" };

// metaCell: one key/value cell rendered in the meta strip.
// Kept as a helper to avoid repeating the same markup pattern three times.
const metaCell = (key, val) =>
  `<div class="bmet-cell"><span class="bmet-key">${esc(key)}</span><span class="bmet-val">${esc(val)}</span></div>`;

// briefMetaRow: project metadata strip (role, timeline, tools), rendered only when
// at least one field is present. Returns "" so callers need no guard.
const briefMetaRow = (pr) => {
  const cells = [["Role", pr.role], ["Timeline", pr.timeline], ["Tools & methods", pr.tools]]
    .filter(([, v]) => v)
    .map(([k, v]) => metaCell(k, v))
    .join("");
  return cells ? `<div class="bmet">${cells}</div>` : "";
};

// ---------- palette-independent CSS that both functions share ----------
// Split into palette-dependent (interpolated) and palette-independent (static)
// sections to keep the interpolated regions as narrow as possible.

const staticCSS = `*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
@media(prefers-reduced-motion:reduce){*{animation:none !important;transition:none !important;scroll-behavior:auto !important}}
`;

// ================================================================
//  INDEX PAGE
// ================================================================

export function brief(p, pal, sec, ctx = {}) {
  const [canvas, ink, accent, muted] = pal.vars;
  const caseHref = ctx.caseHref || noHref;
  const badge = ctx.badge; // undefined -> on by default; false -> owner removed it
  const exp = normExperience(p);
  const photo = p.photo || initialsAvatar(p.name, accent, canvas);

  // Case studies (projects with any of the structured fields) shown as primary cards.
  // Plain projects (no structured fields) shown as a compact secondary grid.
  const caseProjects = p.projects.filter(isCaseStudy);
  const plainProjects = p.projects.filter((pr) => !isCaseStudy(pr));

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} · ${esc(p.headline)}</title><meta name="description" content="${esc(p.story || p.summary || p.headline)}">
${indexHead(p, pal, { bg: canvas, panel: canvas, accent, accent2: accent, text: ink })}
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
${staticCSS}body{background:${canvas};color:${ink};font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:16px;line-height:1.65;overflow-x:hidden}
a{color:${accent};text-decoration:none}
a:focus-visible{outline:2px solid ${accent};outline-offset:3px;border-radius:2px}
.wrap{max-width:860px;margin:0 auto;padding:0 clamp(20px,5vw,48px)}
.tag{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:${muted}}
.tag-accent{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:${accent}}
/* ---- header ---- */
.bsite-header{padding:clamp(40px,8vh,80px) 0 clamp(32px,6vh,60px);border-bottom:1px solid ${ink}18}
.bsite-top{display:flex;align-items:center;gap:28px;flex-wrap:wrap;margin-bottom:28px}
.bsite-photo{width:72px;height:72px;border-radius:4px;object-fit:cover;flex-shrink:0;border:1.5px solid ${ink}18}
.bsite-name{font-size:clamp(1.5rem,4.5vw,2.4rem);font-weight:700;letter-spacing:-.02em;line-height:1.15}
.bsite-hl{font-size:1rem;color:${muted};margin-top:6px;font-weight:400}
.bsite-links{display:flex;gap:20px;flex-wrap:wrap;margin-top:6px;font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase}
.bsite-links a{color:${muted};border-bottom:1px solid ${muted}55;padding-bottom:1px;transition:color .18s,border-color .18s}
.bsite-links a:hover{color:${accent};border-color:${accent}}
.bsite-story{font-size:1.05rem;color:${ink}cc;max-width:62ch;line-height:1.7}
/* ---- section scaffold ---- */
.bsec{padding:clamp(40px,6vh,64px) 0;border-bottom:1px solid ${ink}14}
.bsec:last-child{border-bottom:0}
.bsec-hd{display:flex;align-items:baseline;gap:14px;margin-bottom:clamp(22px,3vh,36px)}
.bsec-num{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.28em;color:${accent};user-select:none}
.bsec h2{font-size:clamp(1rem,2.6vw,1.2rem);font-weight:700;letter-spacing:-.01em;text-transform:uppercase}
/* ---- positioning statement ---- */
.bstory{font-size:1.06rem;color:${ink}cc;max-width:66ch;line-height:1.75}
/* ---- skills / tools ---- */
.bskills{display:flex;flex-wrap:wrap;gap:8px}
.bskill{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.08em;padding:6px 12px;border:1px solid ${ink}22;border-radius:3px;color:${ink}99;background:${canvas}}
/* ---- experience ---- */
.bxp{padding:18px 0;border-top:1px solid ${ink}14}
.bxp:first-child{border-top:0}
.bxp-hd{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:baseline}
.bxp-role{font-size:.97rem;font-weight:600}
.bxp-org{font-size:.9rem;color:${accent};margin-top:2px}
.bxp-period{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.1em;color:${muted};white-space:nowrap}
.bxp ul{list-style:none;margin-top:10px}
.bxp li{font-size:.91rem;color:${ink}99;padding:3px 0 3px 16px;position:relative}
.bxp li:before{content:"";position:absolute;left:0;top:12px;width:5px;height:1px;background:${accent}}
/* ---- case-study cards (index) ---- */
.bcards{display:flex;flex-direction:column;gap:clamp(28px,4vh,48px)}
.bcard{border:1px solid ${ink}18;border-radius:6px;overflow:hidden;background:${canvas}}
.bcard:hover{border-color:${accent}55}
.bcard-cover{width:100%;aspect-ratio:16/7;object-fit:cover;display:block;border-bottom:1px solid ${ink}12}
.bcard-body{padding:clamp(18px,3vw,28px)}
.bcard-name{font-size:clamp(1.05rem,2.4vw,1.3rem);font-weight:700;letter-spacing:-.01em}
.bcard-name a{color:${ink}}
.bcard-name a:hover{color:${accent}}
.bcard-sum{font-size:.93rem;color:${ink}99;margin-top:7px;max-width:60ch}
.bcard-meta{display:flex;gap:20px;flex-wrap:wrap;margin:14px 0;padding:12px 0;border-top:1px solid ${ink}12;border-bottom:1px solid ${ink}12}
.bcard-meta-k{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:${accent};display:block;margin-bottom:2px}
.bcard-meta-v{font-size:.88rem;color:${ink}bb}
.bcard-link{display:inline-flex;align-items:center;gap:6px;margin-top:10px;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:${accent};border-bottom:1px solid ${accent}55;padding-bottom:1px}
/* ---- plain project grid ---- */
.bproj-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.bproj{padding:18px;border:1px solid ${ink}16;border-radius:4px}
.bproj b{font-size:.96rem;font-weight:600;display:block}
.bproj p{font-size:.88rem;color:${ink}88;margin-top:6px}
/* ---- education / certs / languages ---- */
.bedu li{list-style:none;padding:10px 0;border-bottom:1px solid ${ink}12;font-size:.93rem;color:${ink}cc}
.bedu li:last-child{border-bottom:0}
.bcerts-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.bcert{padding:14px;border:1px solid ${ink}14;border-radius:4px}
.bcert b{font-size:.92rem;font-weight:600;display:block}
.bcert-sub{font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.1em;color:${muted};margin-top:4px}
.bcert a{font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:${accent};margin-top:6px;display:inline-block;border-bottom:1px solid ${accent}55}
.blan{display:flex;flex-wrap:wrap;gap:8px}
.blan span{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.1em;padding:7px 13px;border:1px solid ${ink}22;border-radius:3px;color:${ink}88}
/* ---- footer / contact ---- */
.bfooter{padding:clamp(40px,6vh,64px) 0 clamp(24px,3vh,40px);text-align:left}
.bfooter-cta{font-size:clamp(1.3rem,3.5vw,2rem);font-weight:700;letter-spacing:-.02em;color:${ink};margin-bottom:20px}
.bfooter-links{display:flex;gap:20px;flex-wrap:wrap}
/* ---- metrics (CSS-gated) ---- */
${hasMetrics(p.projects) ? `.bmet-blocks{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0 0}
.bmet-blocks>div{flex:1;min-width:100px;background:${ink}07;border:1px solid ${accent}28;border-radius:4px;padding:16px 18px}
.bmet-blocks>div span:first-child{font-family:'IBM Plex Mono',monospace;font-size:1.55rem;font-weight:500;color:${accent};display:block;line-height:1.2}
.bmet-blocks>div span:last-child{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:${muted};margin-top:5px;display:block}
\n` : ""}</style></head><body>
<div class="wrap">
<header class="bsite-header">
<div class="bsite-top">
<img class="bsite-photo" src="${photo}" alt="${esc(p.name)}">
<div>
<div class="bsite-name">${esc(p.name)}</div>
<div class="bsite-hl">${esc(p.headline)}</div>
<div class="bsite-links">${linkRow(p, muted)}</div>
</div>
</div>
${p.story || p.summary ? `<p class="bsite-story">${esc(p.story || p.summary)}</p>` : ""}
</header>
${sec.projects && p.projects.length ? (() => {
  let idx = 0;
  const caseCards = caseProjects.map((pr) => {
    idx++;
    const href = caseHref(pr);
    const metaCells = [["Role", pr.role], ["Timeline", pr.timeline], ["Tools", pr.tools]]
      .filter(([, v]) => v)
      .map(([k, v]) => `<div><span class="bcard-meta-k">${esc(k)}</span><span class="bcard-meta-v">${esc(v)}</span></div>`)
      .join("");
    const metaHtml = metaCells ? `<div class="bcard-meta">${metaCells}</div>` : "";
    const nameHtml = href
      ? `<div class="bcard-name"><a href="${href}">${esc(pr.name)}</a></div>`
      : `<div class="bcard-name">${esc(pr.name)}</div>`;
    const linkHtml = href ? `<a class="bcard-link" href="${href}">Read case study &rarr;</a>` : "";
    // When there is no separate case page, show the problem/process/results summary inline.
    const inlineNarrative = !href && pr.problem
      ? `<p class="bcard-sum" style="margin-top:10px;color:${ink}88">${esc(pr.problem.slice(0, 200))}${pr.problem.length > 200 ? "&hellip;" : ""}</p>`
      : "";
    return `<div class="bcard">
${pr.cover ? `<img class="bcard-cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}
<div class="bcard-body">
<span class="tag-accent" style="display:block;margin-bottom:8px">Case study 0${idx}</span>
${nameHtml}
${pr.summary || pr.desc ? `<p class="bcard-sum">${esc(pr.summary || pr.desc)}</p>` : ""}
${inlineNarrative}
${metaHtml}
${metricsBlocks(pr, "bmet-blocks")}${projectLinks(pr, "plinks")}
${linkHtml}
</div></div>`;
  }).join("");

  const plainHtml = plainProjects.length
    ? `<div class="bproj-grid">${plainProjects.map((pr) => `<div class="bproj"><b>${esc(pr.name)}</b><p>${esc(pr.summary || pr.desc)}</p></div>`).join("")}</div>`
    : "";

  const heading = caseProjects.length ? "Case studies" : "Projects";
  return `<section class="bsec"><div class="bsec-hd"><span class="bsec-num">01</span><h2>${heading}</h2></div>
<div class="bcards">${caseCards}</div>${plainProjects.length ? `<div style="margin-top:28px">${plainHtml}</div>` : ""}
</section>`;
})() : ""}
${sec.skills && p.skills.length ? `<section class="bsec"><div class="bsec-hd"><span class="bsec-num">02</span><h2>Tools &amp; methods</h2></div><div class="bskills">${p.skills.map((s) => `<span class="bskill">${esc(s)}</span>`).join("")}</div></section>` : ""}
${sec.experience && exp.length ? `<section class="bsec"><div class="bsec-hd"><span class="bsec-num">03</span><h2>Experience</h2></div>${exp.map((x) => `<div class="bxp"><div class="bxp-hd"><div><div class="bxp-role">${esc(x.title)}</div>${x.org ? `<div class="bxp-org">${esc(x.org)}</div>` : ""}</div>${x.period ? `<div class="bxp-period">${esc(x.period)}</div>` : ""}</div>${x.points.length ? `<ul>${x.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul>` : ""}</div>`).join("")}</section>` : ""}
${sec.education && (p.education || []).length ? `<section class="bsec"><div class="bsec-hd"><span class="bsec-num">04</span><h2>Education</h2></div><ul class="bedu">${p.education.map((e) => `<li>${esc(eduLabel(e))}</li>`).join("")}</ul></section>` : ""}
${sec.certifications !== false && hasCerts(p) ? `<section class="bsec"><div class="bsec-hd"><span class="bsec-num">05</span><h2>Certifications</h2></div><div class="bcerts-grid">${p.certifications.map((c) => `<div class="bcert"><b>${esc(c.name)}</b><div class="bcert-sub">${[c.issuer, c.year].filter(Boolean).map(esc).join(" &middot; ")}</div>${c.url ? `<a href="${/^http/.test(c.url) ? esc(c.url) : "https://" + esc(c.url)}" target="_blank" rel="noopener noreferrer">View credential &rarr;</a>` : ""}</div>`).join("")}</div></section>` : ""}
${sec.languages !== false && hasLangObjs(p) ? `<section class="bsec"><div class="bsec-hd"><span class="bsec-num">06</span><h2>Languages</h2></div><div class="blan">${p.languages.map((l) => `<span>${esc(langLabel(l))}</span>`).join("")}</div></section>` : ""}
${sec.contact ? `<footer class="bfooter"><p class="bfooter-cta">Let&apos;s work on something together.</p><div class="bfooter-links">${linkRow(p, muted)}</div></footer>` : ""}
</div>${credit(badge, { fg: ink, accent })}</body></html>`;
}

// ================================================================
//  CASE-STUDY PAGE
//  Structure: overview strip, challenge, process (given the most
//  room because that is what interviewers read), solution, outcomes.
// ================================================================

export function briefCase(p, pal, pr, nav, ctx = {}) {
  const badge = ctx.badge; // undefined -> on by default; false -> owner removed it
  const [canvas, ink, accent, muted] = pal.vars;

  // nav may be null (single-project portfolio) or { next: { pr, slug } | null, slug }.
  const backHref = ctx.caseHref ? "../index.html" : "../index.html";
  const nextNav = nav && nav.next
    ? `<a class="bc-nav-link" href="${esc(nav.next.slug)}.html">Next &rarr; ${esc(nav.next.pr.name)}</a>`
    : "";

  // The process block intentionally gets larger body text and more vertical space
  // because UX hiring managers read it most closely.
  const narrativeBlocks = ["problem", "process", "results"]
    .filter((k) => pr[k])
    .map((k) => {
      const isProcess = k === "process";
      return `<div class="bc-blk${isProcess ? " bc-blk--process" : ""}">
<div class="bc-blk-label">${esc(SECTION_LABEL[k])}</div>
<div class="bc-blk-text">${esc(pr[k])}</div>
</div>`;
    })
    .join("");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pr.name)} &middot; ${esc(p.name)}</title><meta name="description" content="${esc(pr.summary || pr.desc || pr.name)}">
${caseHead(p, pal, pr, { bg: canvas, panel: canvas, accent, accent2: accent, text: ink }, ctx)}
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
${staticCSS}body{background:${canvas};color:${ink};font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:16px;line-height:1.7;overflow-x:hidden}
a{color:${accent};text-decoration:none}
a:focus-visible{outline:2px solid ${accent};outline-offset:3px;border-radius:2px}
.wrap{max-width:780px;margin:0 auto;padding:0 clamp(20px,5vw,48px)}
.tag{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:${muted}}
/* ---- top bar ---- */
.bc-topbar{padding:clamp(20px,3vh,32px) 0;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${ink}14}
.bc-back{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:${muted};border-bottom:1px solid ${muted}44;padding-bottom:1px;transition:color .18s,border-color .18s}
.bc-back:hover{color:${accent};border-color:${accent}}
.bc-author{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.18em;color:${muted}}
/* ---- hero / overview ---- */
.bc-hero{padding:clamp(36px,5vh,60px) 0 clamp(20px,3vh,36px)}
.bc-label{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:${accent};margin-bottom:14px}
.bc-title{font-size:clamp(1.7rem,5.5vw,3rem);font-weight:700;letter-spacing:-.025em;line-height:1.15;color:${ink}}
.bc-summary{font-size:1.08rem;color:${ink}99;margin-top:14px;max-width:62ch;line-height:1.7}
/* ---- meta strip ---- */
.bmet{display:flex;gap:28px;flex-wrap:wrap;margin:24px 0 0;padding:20px 0;border-top:1px solid ${ink}16;border-bottom:1px solid ${ink}16}
.bmet-cell{display:flex;flex-direction:column;gap:4px}
.bmet-key{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.26em;text-transform:uppercase;color:${accent}}
.bmet-val{font-size:.9rem;color:${ink}cc}
/* ---- cover image ---- */
.bc-cover{width:100%;aspect-ratio:16/7;object-fit:cover;display:block;border-radius:4px;margin:clamp(20px,3vh,36px) 0;border:1px solid ${ink}12}
/* ---- narrative blocks ---- */
.bc-blk{padding:clamp(28px,4vh,48px) 0;border-top:1px solid ${ink}12}
.bc-blk-label{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:${accent};margin-bottom:16px}
.bc-blk-text{font-size:1.02rem;color:${ink}cc;max-width:68ch;line-height:1.8}
/* process gets more prominence: larger text, more breathing room */
.bc-blk--process{padding-top:clamp(32px,5vh,60px);padding-bottom:clamp(32px,5vh,60px)}
.bc-blk--process .bc-blk-text{font-size:1.07rem;color:${ink}dd;max-width:70ch;line-height:1.85}
/* ---- outcomes / metrics (CSS-gated) ---- */
${Array.isArray(pr.metrics) && pr.metrics.length ? `.bmet-blocks{display:flex;flex-wrap:wrap;gap:12px;margin:clamp(24px,3vh,36px) 0 0}
.bmet-blocks>div{flex:1;min-width:110px;background:${ink}06;border:1px solid ${accent}28;border-radius:4px;padding:18px 20px}
.bmet-blocks>div span:first-child{font-family:'IBM Plex Mono',monospace;font-size:1.7rem;font-weight:500;color:${accent};display:block;line-height:1.2;letter-spacing:-.01em}
.bmet-blocks>div span:last-child{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:${muted};margin-top:6px;display:block}
\n` : ""}/* ---- nav footer ---- */
.bc-nav{display:flex;justify-content:space-between;align-items:baseline;gap:20px;flex-wrap:wrap;padding:clamp(28px,4vh,48px) 0 clamp(20px,3vh,36px);border-top:1px solid ${ink}14}
.bc-nav-link{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:${accent};border-bottom:1px solid ${accent}44;padding-bottom:1px}
</style></head><body>
<div class="wrap">
<nav class="bc-topbar"><a class="bc-back" href="../index.html">&larr; Portfolio</a><span class="bc-author">${esc(p.name)}</span></nav>
<div class="bc-hero">
<div class="bc-label">Case study</div>
<h1 class="bc-title">${esc(pr.name)}</h1>
${pr.summary || pr.desc ? `<p class="bc-summary">${esc(pr.summary || pr.desc)}</p>` : ""}
${briefMetaRow(pr)}
</div>
${pr.cover ? `<img class="bc-cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}
${narrativeBlocks}
${metricsBlocks(pr, "bmet-blocks")}${projectLinks(pr, "plinks")}
<nav class="bc-nav"><a class="bc-nav-link" href="../index.html">&larr; All case studies</a>${nextNav}</nav>
</div>${credit(badge, { fg: ink, accent })}</body></html>`;
}

// ================================================================
//  PALETTES: three distinct stocks, real range across hue and value
// ================================================================
//
// "folio"   Near-white canvas, warm dark ink, cobalt-blue accent.
//           The classic Figma-spec look: professional, legible, trustworthy.
//
// "obsidian" Deep slate background, off-white ink, warm amber accent.
//           A dark-mode spec sheet. Confident, calm. Suits night-mode-first
//           design teams and users who prefer low-luminance environments.
//
// "sage"    Warm off-white canvas, near-black ink, muted sage-green accent.
//           A more organic, editorial palette. Accessible and calm without
//           being either cold tech or warm editorial. Differentiates from folio
//           by hue (green vs blue) and warmth (warm paper vs cool white).

export const briefPalettes = [
  {
    id: "folio",
    label: "Folio",
    vars: ["#F8F9FA", "#1A1A2E", "#2563EB", "#94A3B8"],
  },
  {
    id: "obsidian",
    label: "Obsidian",
    vars: ["#16181D", "#E8E9EC", "#F59E0B", "#6B7280"],
  },
  {
    id: "sage",
    label: "Sage",
    vars: ["#F5F3EF", "#1C1917", "#4D7C5F", "#9CA3AF"],
  },
];
