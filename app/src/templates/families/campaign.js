// The campaign family: a results-led marketing strategist portfolio styled after
// a Cannes Lions case-study book or a brand campaign deck. Bold headline weight
// against a clean regular weight for body; metrics cards are first-class citizens
// because quantified outcomes are the currency of this profession. Confidential
// work is handled by design: a case study with no cover and no process detail
// still reads as substantial because the metric callouts and the objective-
// strategy-execution narrative carry the page.
import {
  esc, indexHead, caseHead, initialsAvatar, linkRow, credit,
  normExperience, hasCerts, hasLangObjs, eduLabel, langLabel,
  isCaseStudy, metaRow, csBlocks, noHref, metricsBlocks, projectLinks, hasMetrics,
  slugify
} from "../shared.js";

// ---- palette destructure is kept in one place per function ----
// vars order: [bg, ink, accent, muted, panel]
// bg     : page background
// ink    : primary text
// accent : high-contrast callout (used on metrics values, CTA labels, rule bars)
// muted  : secondary / caption text
// panel  : card / sidebar background

export function campaign(p, pal, sec, ctx = {}) {
  const [bg, ink, accent, muted, panel] = pal.vars;
  const caseHref = ctx.caseHref || noHref;
  const badge = ctx.badge; // undefined means on; false means owner removed it
  const exp = normExperience(p);
  const photo = p.photo || initialsAvatar(p.name, panel, accent);
  const hasMets = hasMetrics(p.projects);

  // Channel / discipline tags drawn from p.skills: shown in the "channels" strip
  // under the hero so the strategist's spread is visible immediately.
  const channelChips = p.skills.length
    ? `<div class="channels" aria-label="Channels and disciplines">${p.skills.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div>`
    : "";

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} · ${esc(p.headline)}</title><meta name="description" content="${esc(p.summary || p.headline)}">
${indexHead(p, pal, { bg, panel, accent, accent2: muted, text: ink })}
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:${bg};color:${ink};font-family:Inter,sans-serif;line-height:1.65;overflow-x:hidden}
.syne{font-family:'Syne',sans-serif;font-weight:800}
.mono{font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.32em;text-transform:uppercase;color:${muted}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
/* ---- layout ---- */
.wrap{max-width:1020px;margin:0 auto;padding:0 clamp(20px,5vw,72px)}
/* ---- hero ---- */
.hero{padding:10vh 0 6vh;border-bottom:3px solid ${ink}}
.hero-inner{display:grid;grid-template-columns:1fr auto;align-items:end;gap:32px}
@media(max-width:680px){.hero-inner{grid-template-columns:1fr}}
.hero-ph{width:110px;height:110px;object-fit:cover;border-radius:4px;flex-shrink:0}
h1{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(2.8rem,8vw,5.6rem);line-height:.96;letter-spacing:-.02em;text-transform:uppercase}
.hero-hl{margin-top:16px;font-size:clamp(1rem,2vw,1.18rem);color:${ink}cc;max-width:54ch}
.hero-links{margin-top:20px;font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.12em}
.hero-links a{color:${accent};text-decoration:none;border-bottom:1px solid ${accent}66}
/* ---- channel chip strip ---- */
.channels{display:flex;flex-wrap:wrap;gap:8px;padding:22px 0}
.chip{font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;padding:7px 13px;border:1.5px solid ${ink}33;border-radius:2px;color:${ink}bb}
.chip:nth-child(3n+1){border-color:${accent};color:${accent}}
/* ---- sections ---- */
section{padding:7vh 0;border-bottom:1px solid ${ink}18}
.sec-head{display:flex;align-items:center;gap:14px;margin-bottom:32px}
.sec-rule{width:40px;height:3px;background:${accent};flex-shrink:0;border-radius:1px}
h2{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(1.4rem,3vw,2rem);text-transform:uppercase;letter-spacing:-.01em}
/* ---- about ---- */
.about-body{font-size:1.06rem;color:${ink}dd;max-width:62ch}
/* ---- experience ---- */
.xp-row{display:grid;grid-template-columns:140px 1fr;gap:24px;padding:20px 0;border-top:1px solid ${ink}1a}
.xp-row:first-of-type{border-top:0}
@media(max-width:580px){.xp-row{grid-template-columns:1fr}}
.xp-per{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.18em;color:${muted};padding-top:4px}
.xp-title{font-family:'Syne',sans-serif;font-weight:800;font-size:1.1rem}
.xp-org{color:${accent};font-size:.9rem;margin-bottom:8px;font-weight:500}
.xp-pts{padding-left:0;list-style:none}
.xp-pts li{font-size:.93rem;color:${ink}cc;padding:3px 0 3px 16px;position:relative}
.xp-pts li:before{content:"";position:absolute;left:0;top:12px;width:6px;height:2px;background:${accent}}
/* ---- case-study cards ---- */
.cs-stack{display:flex;flex-direction:column;gap:48px}
.cs-card{background:${panel};border:1px solid ${ink}14;border-radius:6px;overflow:hidden}
.cs-cover{width:100%;aspect-ratio:16/7;object-fit:cover;display:block}
.cs-body{padding:clamp(20px,3.5vw,38px)}
.cs-label{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.3em;text-transform:uppercase;color:${accent};margin-bottom:10px}
.cs-card h3{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(1.3rem,3vw,1.9rem);text-transform:uppercase;letter-spacing:-.01em}
.cs-sum{color:${ink}bb;margin-top:9px;font-size:.97rem;max-width:62ch}
.cs-meta{display:flex;gap:28px;flex-wrap:wrap;margin:18px 0;padding:14px 0;border-top:1px solid ${ink}18;border-bottom:1px solid ${ink}18}
.cs-meta span{font-size:.88rem;color:${ink}cc}
.cs-meta b{display:block;font-family:'IBM Plex Mono',monospace;font-size:8.5px;letter-spacing:.24em;color:${accent};margin-bottom:3px}
.cs-blks{margin-top:20px}
.cs-blks h4{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.28em;text-transform:uppercase;color:${muted};margin-bottom:6px}
.cs-blks p{color:${ink}cc;font-size:.93rem;max-width:68ch}
.cs-blks>div{margin-bottom:18px}
.cs-more{display:inline-block;margin-top:16px;font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:${accent};text-decoration:none;border-bottom:1px solid ${accent}66;padding-bottom:2px}
/* ---- non-case projects grid ---- */
.proj-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}
.proj-card{background:${panel};border:1px solid ${ink}14;border-radius:6px;padding:22px;transition:transform .2s}
.proj-card:hover{transform:translateY(-3px)}
.proj-card b{font-family:'Syne',sans-serif;font-weight:800;font-size:1rem}
.proj-card p{color:${ink}aa;font-size:.9rem;margin-top:7px}
/* ---- metrics (gated) ---- */
${hasMets ? `.met-row{display:flex;gap:16px;flex-wrap:wrap;margin:20px 0 0}
.met-cell{flex:1;min-width:110px;background:${bg};border:1px solid ${accent}44;border-radius:4px;padding:16px 18px;display:flex;flex-direction:column;gap:5px}
.met-val{font-family:'Syne',sans-serif;font-weight:800;font-size:2rem;color:${accent};line-height:1}
.met-lbl{font-family:'IBM Plex Mono',monospace;font-size:8.5px;letter-spacing:.24em;text-transform:uppercase;color:${muted}}
\n` : ""}/* ---- testimonials ---- */
.tst{border-left:3px solid ${accent};padding:6px 0 6px 22px;margin-bottom:24px}
.tst p{font-size:1.15rem;font-style:italic;color:${ink}dd;line-height:1.55}
.tst span{display:block;margin-top:8px;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:${muted}}
/* ---- education / certs ---- */
.edu-list{list-style:none}
.edu-list li{padding:10px 0;border-bottom:1px solid ${ink}14;font-size:.95rem;color:${ink}cc}
.cert-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.cert-card{background:${panel};border:1px solid ${ink}14;border-radius:6px;padding:18px}
.cert-card b{font-family:'Syne',sans-serif;font-weight:800;font-size:.97rem}
.cert-card .cert-m{color:${muted};font-size:.86rem;margin-top:4px}
.cert-card a{color:${accent};font-size:.86rem;text-decoration:none;border-bottom:1px solid ${accent}66}
/* ---- languages ---- */
.lang-row{display:flex;flex-wrap:wrap;gap:10px}
.lang-tag{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.1em;padding:8px 14px;border:1.5px solid ${ink}33;border-radius:2px;color:${ink}bb}
/* ---- footer / contact ---- */
.footer{padding:10vh 0 5vh;text-align:center}
.footer-big{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(1.8rem,5vw,3.4rem);text-transform:uppercase;letter-spacing:-.02em;line-height:1.05}
.footer-links{margin-top:22px}
.footer-links a{color:${accent};text-decoration:none;border-bottom:1px solid ${accent}66}
</style></head><body>
<div class="wrap">
<!-- hero: name is the headline weight because brand communication starts with identity -->
<header class="hero">
<div class="mono">MARKETING STRATEGIST · BRAND CONSULTANT</div>
<div class="hero-inner" style="margin-top:20px">
<div>
<h1>${esc(p.name)}</h1>
${p.headline ? `<p class="hero-hl">${esc(p.headline)}</p>` : ""}
<div class="hero-links">${linkRow(p, ink)}</div>
</div>
<img class="hero-ph" src="${photo}" alt="${esc(p.name)}">
</div>
${channelChips}
</header>
${sec.about && p.summary ? `<section><div class="wrap"><div class="sec-head"><div class="sec-rule" aria-hidden="true"></div><h2>About</h2></div><p class="about-body">${esc(p.summary)}</p></div></section>` : ""}
${sec.experience && exp.length ? `<section><div class="wrap"><div class="sec-head"><div class="sec-rule" aria-hidden="true"></div><h2>Experience</h2></div>${exp.map((x) => `<div class="xp-row">${x.period ? `<div class="xp-per">${esc(x.period)}</div>` : "<div></div>"}<div><div class="xp-title">${esc(x.title)}</div>${x.org ? `<div class="xp-org">${esc(x.org)}</div>` : ""}${x.points.length ? `<ul class="xp-pts">${x.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul>` : ""}</div></div>`).join("")}</div></section>` : ""}
${sec.projects && p.projects.length ? (() => {
  const cases = p.projects.filter(isCaseStudy);
  const plain = p.projects.filter((pr) => !isCaseStudy(pr));
  const caseCards = cases.map((pr) => {
    const href = caseHref(pr);
    const metaHtml = metaRow(pr, "cs-meta");
    // When linking to a standalone page, show name + summary + meta only:
    // the full narrative lives on the case page, keeping the index clean.
    if (href) {
      return `<article class="cs-card"><div class="cs-body"><div class="cs-label">Case Study</div><h3>${esc(pr.name)}</h3>${pr.summary || pr.desc ? `<p class="cs-sum">${esc(pr.summary || pr.desc)}</p>` : ""}${metaHtml}<a class="cs-more" href="${href}">View case study &rarr;</a></div></article>`;
    }
    // Inline expansion: show everything available, metrics first in the body
    // so a reader scans the outcome before the narrative (results-led hierarchy).
    const metsHtml = metricsBlocks(pr, "met-row");
    const blobHtml = csBlocks(pr, "cs-blks");
    return `<article class="cs-card">${pr.cover ? `<img class="cs-cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}<div class="cs-body"><div class="cs-label">Case Study</div><h3>${esc(pr.name)}</h3>${pr.summary || pr.desc ? `<p class="cs-sum">${esc(pr.summary || pr.desc)}</p>` : ""}${metaHtml}${metsHtml}${blobHtml}</div></article>`;
  }).join("");
  const plainCards = plain.length ? `<div class="proj-grid">${plain.map((pr) => `<div class="proj-card"><b>${esc(pr.name)}</b><p>${esc(pr.summary || pr.desc || "")}</p></div>`).join("")}</div>` : "";
  return `<section><div class="wrap"><div class="sec-head"><div class="sec-rule" aria-hidden="true"></div><h2>Work</h2></div><div class="cs-stack">${caseCards}</div>${plainCards}</div></section>`;
})() : ""}
${sec.testimonials && (p.testimonials || []).length ? `<section><div class="wrap"><div class="sec-head"><div class="sec-rule" aria-hidden="true"></div><h2>Testimonials</h2></div>${p.testimonials.map((t) => `<div class="tst"><p>&ldquo;${esc(t.quote)}&rdquo;</p><span>&mdash;&thinsp;${esc(t.who)}</span></div>`).join("")}</div></section>` : ""}
${sec.education && (p.education || []).length ? `<section><div class="wrap"><div class="sec-head"><div class="sec-rule" aria-hidden="true"></div><h2>Education</h2></div><ul class="edu-list">${p.education.map((e) => `<li>${esc(eduLabel(e))}</li>`).join("")}</ul></div></section>` : ""}
${sec.certifications !== false && hasCerts(p) ? `<section><div class="wrap"><div class="sec-head"><div class="sec-rule" aria-hidden="true"></div><h2>Certifications</h2></div><div class="cert-grid">${p.certifications.map((c) => `<div class="cert-card"><b>${esc(c.name)}</b><div class="cert-m">${[c.issuer, c.year].filter(Boolean).map(esc).join(" · ")}</div>${c.url ? `<div style="margin-top:8px"><a href="${/^http/.test(c.url) ? esc(c.url) : "https://" + esc(c.url)}" target="_blank" rel="noopener noreferrer">Credential &nearr;</a></div>` : ""}</div>`).join("")}</div></div></section>` : ""}
${sec.languages !== false && hasLangObjs(p) ? `<section><div class="wrap"><div class="sec-head"><div class="sec-rule" aria-hidden="true"></div><h2>Languages</h2></div><div class="lang-row">${p.languages.map((l) => `<span class="lang-tag">${esc(langLabel(l))}</span>`).join("")}</div></div></section>` : ""}
${sec.contact ? `<div class="footer"><div class="mono">LET&apos;S WORK</div><div class="footer-big">Ready to move<br>the numbers?</div><div class="footer-links">${linkRow(p, ink)}</div>${p.email ? `<div style="margin-top:16px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.12em"><a href="mailto:${esc(p.email)}" style="color:${accent};text-decoration:none;border-bottom:1px solid ${accent}66">${esc(p.email)}</a></div>` : ""}</div>` : ""}
</div>${credit(badge, { fg: ink, accent })}</body></html>`;
}

// Standalone case-study page: results-led layout with metrics at the top of the
// narrative, then the objective-strategy-execution story, so a time-pressed
// reader gets the outcome immediately and chooses how deep to go.
export function campaignCase(p, pal, pr, nav, ctx = {}) {
  const badge = ctx.badge;
  const [bg, ink, accent, muted, panel] = pal.vars;

  // Gate per-project metrics CSS by whether THIS project has any metrics.
  const thisMets = Array.isArray(pr.metrics) && pr.metrics.length > 0;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pr.name)} · ${esc(p.name)}</title><meta name="description" content="${esc(pr.summary || pr.desc || pr.name)}">
${caseHead(p, pal, pr, { bg, panel, accent, accent2: muted, text: ink }, ctx)}
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:${bg};color:${ink};font-family:Inter,sans-serif;line-height:1.65;overflow-x:hidden}
.mono{font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.32em;text-transform:uppercase;color:${muted}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
.wrap{max-width:900px;margin:0 auto;padding:0 clamp(20px,5vw,72px)}
.back{display:inline-block;margin:5vh 0 0;font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.14em;color:${accent};text-decoration:none;border-bottom:1px solid ${accent}66;padding-bottom:2px}
/* ---- hero ---- */
.hero{padding:6vh 0 5vh;border-bottom:3px solid ${ink}}
h1{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(2.2rem,6.5vw,4.4rem);line-height:.98;letter-spacing:-.02em;text-transform:uppercase;margin-top:14px}
.sum{color:${ink}cc;font-size:1.1rem;max-width:60ch;margin-top:14px}
.cs-meta{display:flex;gap:28px;flex-wrap:wrap;margin:22px 0 0;padding:16px 0;border-top:1px solid ${ink}18;border-bottom:1px solid ${ink}18}
.cs-meta span{font-size:.88rem;color:${ink}cc}
.cs-meta b{display:block;font-family:'IBM Plex Mono',monospace;font-size:8.5px;letter-spacing:.24em;color:${accent};margin-bottom:3px}
/* ---- metrics: placed between hero and narrative so the result leads ---- */
${thisMets ? `.met-row{display:flex;gap:16px;flex-wrap:wrap;margin:28px 0 0}
.met-cell{flex:1;min-width:120px;background:${panel};border:1px solid ${accent}44;border-radius:4px;padding:18px 20px;display:flex;flex-direction:column;gap:5px}
.met-val{font-family:'Syne',sans-serif;font-weight:800;font-size:2.2rem;color:${accent};line-height:1}
.met-lbl{font-family:'IBM Plex Mono',monospace;font-size:8.5px;letter-spacing:.24em;text-transform:uppercase;color:${muted}}
\n` : ""}/* ---- cover ---- */
.cover{width:100%;aspect-ratio:16/7;object-fit:cover;border-radius:4px;margin:28px 0 0;display:block;border:1px solid ${ink}10}
/* ---- narrative blocks ---- */
.blk{padding:5vh 0;border-top:1px solid ${ink}14}
.blk:first-of-type{border-top:0}
.blk h2{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(1.3rem,2.8vw,1.8rem);text-transform:uppercase;letter-spacing:-.01em;margin-bottom:16px;display:flex;align-items:center;gap:12px}
.blk h2:before{content:"";display:inline-block;width:30px;height:3px;background:${accent};border-radius:1px;flex-shrink:0}
.blk p{color:${ink}dd;font-size:1.04rem;max-width:68ch}
/* ---- navigation ---- */
.nav{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:6vh 0 3vh;border-top:1px solid ${ink}1a}
.nav a{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:${accent};text-decoration:none;border-bottom:1px solid ${accent}66;padding-bottom:2px}
</style></head><body>
<div class="wrap">
<a class="back" href="../index.html">&larr; Back</a>
<div class="hero">
<div class="mono">Case Study</div>
<h1>${esc(pr.name)}</h1>
${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}
${metaRow(pr, "cs-meta")}
</div>
${metricsBlocks(pr, "met-row")}${projectLinks(pr, "plinks")}
${pr.cover ? `<img class="cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}
<div style="margin-top:5vh">${["problem", "process", "results"].filter((k) => pr[k]).map((k) => {
  const labels = { problem: "The objective", process: "The strategy and execution", results: "The results" };
  return `<div class="blk"><h2>${labels[k]}</h2><p>${esc(pr[k])}</p></div>`;
}).join("")}</div>
<div class="nav">
<a href="../index.html">&larr; All work</a>
${nav && nav.next ? `<a href="${esc(nav.next.slug)}.html">Next: ${esc(nav.next.pr.name)} &rarr;</a>` : ""}
</div>
</div>${credit(badge, { fg: ink, accent })}</body></html>`;
}

// Three palettes with genuine range: neutral command, warm pitch, dark authority.
// "Neutral command" is the default: a neutral off-white field with ink-black
// type and a cherry-red accent that echoes the red rule bar common in brand books.
// "Warm pitch" recalls the warm ivories and ambers of a physical campaign deck.
// "Dark authority" inverts the field to near-black, used when the work itself is
// primarily dark-themed (luxury, entertainment, financial services).
export const campaignPalettes = [
  {
    id: "neutral-command",
    label: "Neutral Command",
    // [bg,         ink,       accent,    muted,     panel]
    vars: ["#F7F7F5", "#111111", "#C0392B", "#888888", "#EFEFED"],
  },
  {
    id: "warm-pitch",
    label: "Warm Pitch",
    // [bg,         ink,       accent,    muted,     panel]
    vars: ["#FBF7F0", "#1A1208", "#B7791F", "#9A8068", "#F2EBE0"],
  },
  {
    id: "dark-authority",
    label: "Dark Authority",
    // [bg,         ink,       accent,    muted,     panel]
    vars: ["#111114", "#F0EEE8", "#7EBDC2", "#7B7A80", "#1C1C20"],
  },
];
