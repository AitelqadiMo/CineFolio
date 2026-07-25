// The byline family. Designed specifically for writers and journalists whose
// published work lives on external domains. The unit of display is the byline
// itself: headline, publication name, and date. Unlike the general-purpose
// Editorial family (a magazine layout), this family is structured around a
// dense, scannable index of published pieces, the way a serious author page
// or a broadsheet's contributor page works. Publication names get the same
// typographic weight as the piece headlines, because institutional credit
// is a first-class signal for a writer's audience.
import {
  esc,
  indexHead,
  caseHead,
  initialsAvatar,
  linkRow,
  credit,
  normExperience,
  hasCerts,
  hasLangObjs,
  eduLabel,
  langLabel,
  isCaseStudy,
  metaRow,
  csBlocks,
  noHref,
  metricsBlocks,
  hasMetrics,
} from "../shared.js";

// Pull publication and date from the fields available. The "tools" field is
// the best fit for "published in The Atlantic" and "timeline" for the date,
// since the data model has no dedicated publication or URL-per-piece field.
// Both are optional; the piece renders cleanly without them.
function pubMeta(pr) {
  const pub = pr.tools ? esc(pr.tools) : "";
  const date = pr.timeline ? esc(pr.timeline) : "";
  return { pub, date };
}

export function byline(p, pal, sec, ctx = {}) {
  // vars[0] paper: page background (warm white or dark field)
  // vars[1] ink:   primary text and rule colour
  // vars[2] accent: publication name, section accent, link hover
  // vars[3] soft:  secondary text, meta labels, subdued elements
  const [paper, ink, accent, soft] = pal.vars;
  const caseHref = ctx.caseHref || noHref;
  const badge = ctx.badge; // undefined -> on by default; false -> owner removed it
  const exp = normExperience(p);
  // The author photo or an initials disc. For a writer's page a photo has
  // real presence; the fallback keeps the layout clean either way.
  const photo = p.photo || initialsAvatar(p.name, ink, paper);

  // Separate rich pieces (with problem/process/results or role: they get a
  // standfirst treatment) from plain credits (headline + pub + date only).
  const richPieces = p.projects ? p.projects.filter(isCaseStudy) : [];
  const plainPieces = p.projects ? p.projects.filter((pr) => !isCaseStudy(pr)) : [];

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} · ${esc(p.headline)}</title><meta name="description" content="${esc(p.story || p.summary || p.headline)}">
${indexHead(p, pal, { bg: paper, panel: ink, accent, accent2: soft, text: ink })}
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,400;1,700&family=Source+Sans+3:wght@400;500;600&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:${paper};color:${ink};font-family:'Source Sans 3',sans-serif;font-size:17px;line-height:1.65}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}

/* layout */
.page{max-width:760px;margin:0 auto;padding:0 5vw}

/* masthead */
.mast{border-bottom:3px double ${ink};padding:5vh 0 3.5vh;display:grid;grid-template-columns:1fr auto;gap:24px;align-items:end}
.mast-left h1{font-family:'Playfair Display',serif;font-weight:900;font-size:clamp(2.2rem,7vw,4rem);line-height:1.05;letter-spacing:-.02em}
.mast-left .hl{font-family:'Source Sans 3',sans-serif;font-size:1.05rem;font-weight:500;color:${soft};margin-top:8px;letter-spacing:.01em}
.mast-left .links{margin-top:12px;font-size:.88rem}
.mast-left .links a{color:${accent};text-decoration:none;border-bottom:1px solid ${accent}88}
.mast-left .links a:hover{border-bottom-color:${accent}}
.mast-left .links a:focus-visible{outline:2px solid ${accent};outline-offset:2px;border-radius:1px}
.author-photo{width:96px;height:96px;border-radius:2px;object-fit:cover;display:block;border:1.5px solid ${ink}22}

/* section rule and label */
.sec-rule{display:flex;align-items:baseline;gap:14px;padding:3.5vh 0 1.8vh;border-bottom:1px solid ${ink};margin-bottom:0}
.sec-label{font-family:'IBM Plex Mono',monospace;font-size:.68rem;letter-spacing:.26em;text-transform:uppercase;color:${soft}}
.sec-title{font-family:'Playfair Display',serif;font-weight:700;font-size:clamp(1.3rem,3vw,1.7rem)}

/* author bio (story) */
.bio{padding:3.5vh 0;border-bottom:1px solid ${ink}22;max-width:66ch}
.bio p{font-size:1.06rem;color:${ink}ee;line-height:1.7}

/* byline list: the primary display unit */
.byline-list{list-style:none;margin:0;padding:0}
.byline-item{border-bottom:1px solid ${ink}18;padding:1.6rem 0}
.byline-item:last-child{border-bottom:none}

/* headline typography: the piece title leads. Large, serif, scannable. */
.piece-head{font-family:'Playfair Display',serif;font-weight:700;font-size:clamp(1.15rem,2.6vw,1.5rem);line-height:1.22;color:${ink}}
.piece-head a{color:inherit;text-decoration:none}
.piece-head a:hover{color:${accent}}
.piece-head a:focus-visible{outline:2px solid ${accent};outline-offset:2px;border-radius:1px}

/* publication and date row. Publication gets accent weight: it is credit, not meta. */
.piece-pub{margin-top:.45rem;display:flex;align-items:baseline;gap:.7rem;flex-wrap:wrap}
.pub-name{font-family:'Playfair Display',serif;font-weight:700;font-size:.95rem;color:${accent};letter-spacing:.01em}
.pub-sep{color:${soft};opacity:.5;font-size:.8rem}
.pub-date{font-family:'IBM Plex Mono',monospace;font-size:.75rem;letter-spacing:.08em;color:${soft}}

/* standfirst: the project summary used as a pull quote */
.standfirst{margin-top:.7rem;font-size:1rem;color:${ink}cc;max-width:62ch;line-height:1.55;font-style:italic}
.standfirst-roman{font-style:normal}

/* "read the piece" link for rich case studies */
.read-link{display:inline-block;margin-top:.75rem;font-family:'IBM Plex Mono',monospace;font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;color:${accent};text-decoration:none;border-bottom:1px solid ${accent}}
.read-link:hover{opacity:.75}
.read-link:focus-visible{outline:2px solid ${accent};outline-offset:2px;border-radius:1px}

/* experience */
.xp-item{padding:1.4rem 0;border-bottom:1px solid ${ink}18}
.xp-item:last-child{border-bottom:none}
.xp-role{font-weight:600;font-size:1rem}
.xp-org{color:${accent};font-size:.95rem;margin-top:2px}
.xp-period{font-family:'IBM Plex Mono',monospace;font-size:.72rem;letter-spacing:.1em;color:${soft};margin-top:4px}
.xp-points{list-style:none;margin-top:.6rem;padding-left:0}
.xp-points li{color:${ink}bb;font-size:.94rem;padding:.25rem 0 .25rem 1.1rem;position:relative}
.xp-points li:before{content:"—";position:absolute;left:0;color:${accent};font-weight:700}

/* skills */
.skill-cloud{display:flex;flex-wrap:wrap;gap:.5rem .9rem;padding:2.5vh 0}
.skill-tag{font-size:.9rem;border-bottom:1.5px solid ${accent}55;padding-bottom:2px;line-height:1.5}

/* education, certs */
.plain-list{list-style:none;padding:0;margin:0}
.plain-list li{padding:.6rem 0;border-bottom:1px solid ${ink}14;font-size:.95rem;color:${ink}cc}
.plain-list li:last-child{border-bottom:none}
.cert-name{font-weight:600;color:${ink};display:block}
.cert-meta{color:${soft};font-size:.85rem}
.cert-link{color:${accent};font-size:.82rem;text-decoration:none;border-bottom:1px solid ${accent}88}
.cert-link:focus-visible{outline:2px solid ${accent};outline-offset:2px}

/* languages */
.lang-row{display:flex;flex-wrap:wrap;gap:.4rem .8rem;padding:2vh 0}
.lang-tag{font-size:.92rem;color:${ink}cc;border-bottom:1.5px solid ${soft}44;padding-bottom:2px}

/* contact footer */
.contact-foot{padding:6vh 0 4vh;border-top:1px solid ${ink}}
.contact-invite{font-family:'Playfair Display',serif;font-style:italic;font-size:clamp(1.4rem,3.5vw,2.2rem);line-height:1.2;color:${ink};margin-bottom:1.2rem}
.contact-links{font-size:.9rem}
.contact-links a{color:${accent};text-decoration:none;border-bottom:1px solid ${accent}88}
.contact-links a:hover{border-bottom-color:${accent}}
.contact-links a:focus-visible{outline:2px solid ${accent};outline-offset:2px;border-radius:1px}

/* inline piece blocks on index (for pieces without a standalone case page) */
.piece-blocks{margin-top:.9rem}
.piece-blocks h4{font-family:'IBM Plex Mono',monospace;font-size:.65rem;letter-spacing:.22em;text-transform:uppercase;color:${accent};margin-bottom:.4rem}
.piece-blocks p{font-size:.95rem;color:${ink}cc;max-width:62ch;line-height:1.6}

/* responsive */
@media(max-width:560px){
  .mast{grid-template-columns:1fr}
  .author-photo{display:none}
}
${hasMetrics(p.projects) ? `.met-row{display:flex;flex-wrap:wrap;gap:.5rem 1.2rem;margin-top:1rem}
.met-row div{border-top:2px solid ${accent};padding:.6rem 0;min-width:100px}
.met-row div span:first-child{font-family:'Playfair Display',serif;font-size:1.6rem;font-weight:700;color:${accent};line-height:1;display:block}
.met-row div span:last-child{font-family:'IBM Plex Mono',monospace;font-size:.65rem;letter-spacing:.18em;text-transform:uppercase;color:${soft};margin-top:4px;display:block}
` : ""}</style></head><body>
<div class="page">

<header class="mast">
  <div class="mast-left">
    <h1>${esc(p.name)}</h1>
    <div class="hl">${esc(p.headline)}</div>
    <div class="links">${linkRow(p, soft)}</div>
  </div>
  <img class="author-photo" src="${photo}" alt="${esc(p.name)}">
</header>

${sec.about && (p.story || p.summary) ? `<div class="bio"><p>${esc(p.story || p.summary)}</p></div>` : ""}

${sec.projects && p.projects && p.projects.length ? `<div class="sec-rule"><span class="sec-label">Published work</span><h2 class="sec-title">Bylines</h2></div>
<ul class="byline-list" aria-label="Published pieces">
${(richPieces.length ? richPieces : []).map((pr) => {
  const { pub, date } = pubMeta(pr);
  const href = caseHref(pr);
  const standfirst = pr.summary || pr.desc;
  return `<li class="byline-item">
  <div class="piece-head">${href ? `<a href="${href}">${esc(pr.name)}</a>` : esc(pr.name)}</div>
  ${pub || date ? `<div class="piece-pub">${pub ? `<span class="pub-name">${pub}</span>` : ""}${pub && date ? `<span class="pub-sep" aria-hidden="true">·</span>` : ""}${date ? `<span class="pub-date">${date}</span>` : ""}</div>` : ""}
  ${standfirst ? `<p class="standfirst">${esc(standfirst)}</p>` : ""}
  ${href ? `<a class="read-link" href="${href}">Read the piece</a>` : `${csBlocks(pr, "piece-blocks")}${metricsBlocks(pr, "met-row")}`}
</li>`;
}).join("")}
${plainPieces.map((pr) => {
  const { pub, date } = pubMeta(pr);
  const standfirst = pr.summary || pr.desc;
  return `<li class="byline-item">
  <div class="piece-head">${esc(pr.name)}</div>
  ${pub || date ? `<div class="piece-pub">${pub ? `<span class="pub-name">${pub}</span>` : ""}${pub && date ? `<span class="pub-sep" aria-hidden="true">·</span>` : ""}${date ? `<span class="pub-date">${date}</span>` : ""}</div>` : ""}
  ${standfirst ? `<p class="standfirst standfirst-roman">${esc(standfirst)}</p>` : ""}
</li>`;
}).join("")}
</ul>` : ""}

${sec.experience && exp.length ? `<div class="sec-rule"><span class="sec-label">Career</span><h2 class="sec-title">Experience</h2></div>
<div>
${exp.map((x) => `<div class="xp-item">
  <div class="xp-role">${esc(x.title)}</div>
  ${x.org ? `<div class="xp-org">${esc(x.org)}</div>` : ""}
  ${x.period ? `<div class="xp-period">${esc(x.period)}</div>` : ""}
  ${x.points.length ? `<ul class="xp-points">${x.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul>` : ""}
</div>`).join("")}
</div>` : ""}

${sec.skills && p.skills && p.skills.length ? `<div class="sec-rule"><span class="sec-label">Expertise</span><h2 class="sec-title">Beats &amp; skills</h2></div>
<div class="skill-cloud">${p.skills.map((s) => `<span class="skill-tag">${esc(s)}</span>`).join("")}</div>` : ""}

${sec.education && p.education && p.education.length ? `<div class="sec-rule"><span class="sec-label">Formation</span><h2 class="sec-title">Education</h2></div>
<ul class="plain-list">${p.education.map((e) => `<li>${esc(eduLabel(e))}</li>`).join("")}</ul>` : ""}

${sec.certifications !== false && hasCerts(p) ? `<div class="sec-rule"><span class="sec-label">Credentials</span><h2 class="sec-title">Certifications</h2></div>
<ul class="plain-list">${p.certifications.map((c) => `<li><span class="cert-name">${esc(c.name)}</span><span class="cert-meta">${[c.issuer, c.year].filter(Boolean).map(esc).join(" · ")}</span>${c.url ? `<a class="cert-link" href="${/^http/.test(c.url) ? esc(c.url) : "https://" + esc(c.url)}" target="_blank" rel="noopener noreferrer">Credential ↗</a>` : ""}</li>`).join("")}</ul>` : ""}

${sec.languages !== false && hasLangObjs(p) ? `<div class="sec-rule"><span class="sec-label">Voices</span><h2 class="sec-title">Languages</h2></div>
<div class="lang-row">${p.languages.map((l) => `<span class="lang-tag">${esc(langLabel(l))}</span>`).join("")}</div>` : ""}

${sec.contact ? `<div class="contact-foot">
<div class="contact-invite">Commissions, pitches &amp; correspondence welcome.</div>
<div class="contact-links">${p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a> ` : ""}${linkRow(p, soft)}</div>
</div>` : ""}

</div>${credit(badge, { fg: ink, accent })}</body></html>`;
}

// Standalone long-read page for a piece. The project's problem/process/results
// fields become the body of a long-form feature article, with the project name
// as the headline, the summary as the standfirst, and publication/date surfaced
// prominently above the text. This is structurally different from, say, a
// design case study: no cover image dominance, no metrics grid at the top.
// Instead the reader lands on text immediately, the way a published article does.
export function bylineCase(p, pal, pr, nav, ctx = {}) {
  const badge = ctx.badge;
  const [paper, ink, accent, soft] = pal.vars;
  const { pub, date } = pubMeta(pr);

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pr.name)} · ${esc(p.name)}</title><meta name="description" content="${esc(pr.summary || pr.desc || pr.name)}">
${caseHead(p, pal, pr, { bg: paper, panel: ink, accent, accent2: soft, text: ink }, ctx)}
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,400;1,700&family=Source+Sans+3:wght@400;500;600&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:${paper};color:${ink};font-family:'Source Sans 3',sans-serif;font-size:17px;line-height:1.65}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}

.page{max-width:700px;margin:0 auto;padding:0 5vw}

.back{display:inline-block;margin:4vh 0 0;font-family:'IBM Plex Mono',monospace;font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:${accent};text-decoration:none;border-bottom:1px solid ${accent}88}
.back:hover{opacity:.75}
.back:focus-visible{outline:2px solid ${accent};outline-offset:2px;border-radius:1px}

/* article header */
.art-head{padding:3vh 0 2.5vh;border-bottom:3px double ${ink}}
.art-kicker{font-family:'IBM Plex Mono',monospace;font-size:.7rem;letter-spacing:.28em;text-transform:uppercase;color:${soft};margin-bottom:1rem}
h1{font-family:'Playfair Display',serif;font-weight:900;font-size:clamp(1.8rem,6vw,3.2rem);line-height:1.06;letter-spacing:-.02em}
.art-standfirst{font-family:'Playfair Display',serif;font-style:italic;font-size:1.15rem;line-height:1.5;color:${ink}cc;margin-top:1rem;max-width:58ch}
.art-byline{display:flex;align-items:baseline;gap:.8rem;flex-wrap:wrap;margin-top:1.4rem;font-size:.88rem}
.art-author{font-weight:600;color:${ink}}
.art-pub{font-family:'Playfair Display',serif;font-weight:700;color:${accent};font-size:.95rem}
.art-date{font-family:'IBM Plex Mono',monospace;font-size:.72rem;letter-spacing:.08em;color:${soft}}
.art-sep{color:${soft};opacity:.4}

/* meta row for role/timeline/tools */
.art-meta{display:flex;gap:1.8rem;flex-wrap:wrap;margin:1.6rem 0 0;padding:1.2rem 0 0;border-top:1px solid ${ink}22}
.art-meta span{font-size:.88rem;color:${ink}cc}
.art-meta b{display:block;font-family:'IBM Plex Mono',monospace;font-size:.65rem;letter-spacing:.22em;text-transform:uppercase;color:${accent};margin-bottom:3px}

/* body text blocks */
.body-block{padding:3.5vh 0;border-bottom:1px solid ${ink}14}
.body-block:last-of-type{border-bottom:none}
.block-label{font-family:'IBM Plex Mono',monospace;font-size:.68rem;letter-spacing:.24em;text-transform:uppercase;color:${accent};margin-bottom:.9rem}
.block-text{font-size:1.06rem;color:${ink}ee;max-width:64ch;line-height:1.75}

/* cover image: below the header, the way a long read places photography after the deck */
.art-cover{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;margin:3vh 0;border:none}

/* navigation footer */
.art-nav{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:4.5vh 0 3vh;border-top:1px solid ${ink}}
.art-nav a{font-family:'IBM Plex Mono',monospace;font-size:.7rem;letter-spacing:.16em;text-transform:uppercase;color:${accent};text-decoration:none;border-bottom:1px solid ${accent}88}
.art-nav a:hover{opacity:.75}
.art-nav a:focus-visible{outline:2px solid ${accent};outline-offset:2px;border-radius:1px}

${Array.isArray(pr.metrics) && pr.metrics.length ? `.met-row{display:flex;flex-wrap:wrap;gap:.5rem 1.2rem;margin-top:1.6rem;padding-top:1.6rem;border-top:1px solid ${ink}18}
.met-row div{border-top:2px solid ${accent};padding:.6rem 0;min-width:100px}
.met-row div span:first-child{font-family:'Playfair Display',serif;font-size:1.6rem;font-weight:700;color:${accent};line-height:1;display:block}
.met-row div span:last-child{font-family:'IBM Plex Mono',monospace;font-size:.65rem;letter-spacing:.18em;text-transform:uppercase;color:${soft};margin-top:4px;display:block}
` : ""}</style></head><body>
<div class="page">
<a class="back" href="../index.html">← Back to all work</a>

<div class="art-head">
  <div class="art-kicker">Long read</div>
  <h1>${esc(pr.name)}</h1>
  ${pr.summary || pr.desc ? `<p class="art-standfirst">${esc(pr.summary || pr.desc)}</p>` : ""}
  <div class="art-byline">
    <span class="art-author">${esc(p.name)}</span>
    ${pub ? `<span class="art-sep" aria-hidden="true">·</span><span class="art-pub">${pub}</span>` : ""}
    ${date ? `<span class="art-sep" aria-hidden="true">·</span><span class="art-date">${date}</span>` : ""}
  </div>
  ${metaRow(pr, "art-meta")}
</div>

${pr.cover ? `<img class="art-cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}

${["problem", "process", "results"].filter((k) => pr[k]).map((k) => `<div class="body-block">
  <div class="block-label">${k === "problem" ? "The brief" : k === "process" ? "Reporting &amp; process" : "Findings"}</div>
  <p class="block-text">${esc(pr[k])}</p>
</div>`).join("")}${metricsBlocks(pr, "met-row")}

<div class="art-nav">
  <a href="../index.html">← All work</a>
  ${nav && nav.next ? `<a href="${esc(nav.next.slug)}.html">Next: ${esc(nav.next.pr.name)} →</a>` : ""}
</div>
</div>${credit(badge, { fg: ink, accent })}</body></html>`;
}

// Three palettes with genuine range: a warm broadsheet, a cold modernist
// daily, and a deep ink-on-black evening edition. Each evokes a different
// print tradition so users are not just picking a tint variant of the same look.
export const bylinePalettes = [
  {
    id: "broadsheet",
    label: "Broadsheet",
    // Warm white stock, deep Brunswick ink, a burgundy rule. Evokes the
    // Saturday long-read section of a quality British newspaper.
    vars: ["#FAF8F4", "#1A1614", "#7B2340", "#8A7E76"],
  },
  {
    id: "nordic",
    label: "Nordic",
    // Cool white, near-black charcoal, a slate-blue accent. Evokes the
    // clean modernist look of Scandinavian design journalism (Monocle, Zetland).
    vars: ["#F5F6F7", "#1C1F22", "#2E5FA3", "#8191A0"],
  },
  {
    id: "nightdesk",
    label: "Night desk",
    // A true inversion: deep-ink ground, aged newsprint text, a muted
    // gold accent. The late-edition / night-desk aesthetic; distinct from the
    // two light stocks above and readable on an OLED screen.
    vars: ["#141210", "#E8E0D5", "#C49A3C", "#7A7268"],
  },
];
