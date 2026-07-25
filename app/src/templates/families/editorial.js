// The editorial family. Moved verbatim out of engine.js so each family can be
// edited without contending on one module. Behaviour is unchanged.
import { esc, indexHead, caseHead, initialsAvatar, linkRow, credit, normExperience, hasCerts, hasLangObjs, eduLabel, langLabel, isCaseStudy, metaRow, csBlocks, noHref, metricsBlocks, hasMetrics } from "../shared.js";

export function editorial(p, pal, sec, ctx = {}) {
  const [paper, ink, accent, soft] = pal.vars;
  const caseHref = ctx.caseHref || noHref;
  const badge = ctx.badge; // undefined -> on by default; false -> owner removed it
  const exp = normExperience(p);
  const photo = p.photo || initialsAvatar(p.name, ink, paper);
  const n = (i) => String(i + 1).padStart(2, "0");
  let ix = 0;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} · ${esc(p.headline)}</title><meta name="description" content="${esc(p.summary || p.headline)}">
${indexHead(p, pal, { bg: paper, panel: ink, accent, accent2: soft, text: ink })}
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:${paper};color:${ink};font-family:Inter,sans-serif;line-height:1.65}
.mono{font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.3em;text-transform:uppercase;color:${soft}}
.wrap{max-width:860px;margin:0 auto;padding:0 6vw}
header{padding:12vh 0 7vh;border-bottom:2px solid ${ink}}
.masth{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap}
h1{font-family:'Instrument Serif',serif;font-weight:400;font-size:clamp(2.8rem,8vw,5.4rem);line-height:1.02}
h1 i{color:${accent}}
.ph{width:108px;height:108px;object-fit:cover;border-radius:2px;filter:grayscale(20%)}
.headrow{margin-top:18px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:baseline}
.links a{color:${accent};text-decoration:none;border-bottom:1px solid ${accent}}
section{padding:7vh 0;border-bottom:1px solid ${ink}22}
.sechead{display:flex;align-items:baseline;gap:18px;margin-bottom:30px}
.no{font-family:'Instrument Serif',serif;font-style:italic;font-size:2.2rem;color:${accent}}
h2{font-family:'Instrument Serif',serif;font-weight:400;font-size:clamp(1.6rem,3.6vw,2.4rem)}
.lede{font-size:1.12rem;max-width:58ch;color:${ink}dd}
.xp{display:grid;grid-template-columns:150px 1fr;gap:22px;padding:22px 0;border-top:1px solid ${ink}22}
.xp:first-of-type{border-top:0}
.xp .per{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.14em;color:${soft};padding-top:5px}
.xp h3{font-size:1.08rem;font-weight:600}
.xp .org{color:${accent};font-size:.9rem;margin-bottom:8px}
.xp li{margin:0 0 6px 16px;color:${ink}bb;font-size:.93rem}
.chips{display:flex;flex-wrap:wrap;gap:8px 18px}
.chip{font-size:.95rem;border-bottom:1.5px solid ${accent}66;padding-bottom:2px}
.pr{padding:16px 0;border-top:1px solid ${ink}22;display:grid;grid-template-columns:1fr 2fr;gap:18px}
.pr b{font-weight:600}
.pr a{color:${accent};text-decoration:none;border-bottom:1px solid ${accent}}
footer{padding:9vh 0;text-align:center}
footer .big{font-family:'Instrument Serif',serif;font-style:italic;font-size:clamp(1.8rem,4.5vw,3rem)}
.cs2{padding:26px 0;border-top:1px solid ${ink}22}
.cs2 img.cover{width:100%;aspect-ratio:21/9;object-fit:cover;border-radius:2px;margin-bottom:18px}
.cs2 h3{font-family:'Instrument Serif',serif;font-weight:400;font-size:1.6rem}
.cs2 h3 a{color:inherit;text-decoration:none}
.cs2 .sum{color:${ink}cc;margin-top:6px;max-width:64ch}
.cs2 a.more{display:inline-block;margin-top:14px;font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:${accent};text-decoration:none;border-bottom:1px solid ${accent}}
.csmeta2{display:flex;gap:26px;flex-wrap:wrap;margin:16px 0;padding:12px 0;border-top:1px solid ${ink}22;border-bottom:1px solid ${ink}22}
.csmeta2 span{font-size:.88rem}
.csmeta2 b{display:block;font-family:'IBM Plex Mono',monospace;font-size:8.5px;letter-spacing:.22em;color:${accent};margin-bottom:2px}
.csb2{margin-top:18px}
.csb2 h4{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.26em;text-transform:uppercase;color:${accent};margin-bottom:6px}
.csb2 p{color:${ink}cc;max-width:70ch}
.svc2{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 30px}
.svc2 div{border-top:1.5px solid ${ink};padding:14px 0}
.svc2 b{font-weight:600}
.svc2 p{color:${soft};font-size:.9rem;margin-top:5px}
.tst2{padding:18px 0;border-top:1px solid ${ink}22}
.tst2 p{font-family:'Instrument Serif',serif;font-style:italic;font-size:1.3rem;line-height:1.55}
.tst2 span{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.2em;color:${soft};text-transform:uppercase}
.rr2{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 30px}
.rr2 div{border-top:1.5px solid ${ink};padding:14px 0}
.rr2 b{font-weight:600}
.rr2 .m{color:${soft};font-size:.88rem;margin-top:4px}
.rr2 a{color:${accent};text-decoration:none;border-bottom:1px solid ${accent}}
.lang2{display:flex;flex-wrap:wrap;gap:8px 24px}
.lang2 span{font-size:.98rem;border-bottom:1.5px solid ${accent}66;padding-bottom:2px}
@media(max-width:640px){.xp,.pr{grid-template-columns:1fr}}
${hasMetrics(p.projects) ? `.csmet2{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0 30px;margin-top:20px}
.csmet2 div{border-top:1.5px solid ${ink};padding:14px 0;display:flex;flex-direction:column;gap:3px}
.csmet2 div span:first-child{font-family:'Instrument Serif',serif;font-size:2rem;color:${accent}}
.csmet2 div span:last-child{font-family:'IBM Plex Mono',monospace;font-size:8.5px;letter-spacing:.22em;text-transform:uppercase;color:${soft}}
\n` : ""}</style></head><body><div class="wrap">
<header><div class="mono">PORTFOLIO · VOL. I · ${new Date().getFullYear()}</div>
<div class="masth" style="margin-top:22px"><h1>${esc(p.name.split(" ")[0])} <i>${esc(p.name.split(" ").slice(1).join(" "))}</i></h1><img class="ph" src="${photo}" alt="${esc(p.name)}"></div>
<div class="headrow"><div style="font-weight:600">${esc(p.headline)}</div><div class="mono links">${linkRow(p, ink)}</div></div></header>
${sec.about && p.summary ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>In brief</h2></div><p class="lede">${esc(p.summary)}</p></section>` : ""}
${sec.experience && exp.length ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>Experience</h2></div>
${exp.map((x) => `<div class="xp"><div class="per">${esc(x.period)}</div><div><h3>${esc(x.title)}</h3>${x.org ? `<div class="org">${esc(x.org)}</div>` : ""}<ul>${x.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul></div></div>`).join("")}</section>` : ""}
${sec.skills && p.skills.length ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>Capabilities</h2></div><div class="chips">${p.skills.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div></section>` : ""}
${sec.projects && p.projects.length ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>Selected work</h2></div>
${p.projects.filter(isCaseStudy).map((pr) => { const href = caseHref(pr); return href
  ? `<div class="cs2"><h3><a href="${href}">${esc(pr.name)}</a></h3>${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}${metaRow(pr, "csmeta2")}<a class="more" href="${href}">Read the case study →</a></div>`
  : `<div class="cs2">${pr.cover ? `<img class="cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}<h3>${esc(pr.name)}</h3>${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}${metaRow(pr, "csmeta2")}${csBlocks(pr, "csb2")}${metricsBlocks(pr, "csmet2")}</div>`; }).join("")}
${p.projects.filter((pr) => !isCaseStudy(pr)).map((pr) => `<div class="pr"><b>${esc(pr.name)}</b><p>${esc(pr.summary || pr.desc)}</p></div>`).join("")}</section>` : ""}
${sec.services && (p.services || []).length ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>Services</h2></div><div class="svc2">${p.services.map((sv) => `<div><b>${esc(sv.name)}</b><p>${esc(sv.desc)}</p></div>`).join("")}</section>` : ""}
${sec.testimonials && (p.testimonials || []).length ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>Kind words</h2></div>${p.testimonials.map((t) => `<div class="tst2"><p>“${esc(t.quote)}”</p><span>· ${esc(t.who)}</span></div>`).join("")}</section>` : ""}
${sec.education && (p.education || []).length ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>Education</h2></div>${p.education.map((e) => `<p style="padding:6px 0">${esc(eduLabel(e))}</p>`).join("")}</section>` : ""}
${sec.certifications !== false && hasCerts(p) ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>Certifications</h2></div><div class="rr2">${p.certifications.map((c) => `<div><b>${esc(c.name)}</b><div class="m">${[c.issuer, c.year].filter(Boolean).map(esc).join(" · ")}</div>${c.url ? `<div style="margin-top:6px"><a href="${/^http/.test(c.url) ? esc(c.url) : "https://" + esc(c.url)}" target="_blank" rel="noopener noreferrer">Credential ↗</a></div>` : ""}</div>`).join("")}</div></section>` : ""}
${sec.languages !== false && hasLangObjs(p) ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>Languages</h2></div><div class="lang2">${p.languages.map((l) => `<span>${esc(langLabel(l))}</span>`).join("")}</div></section>` : ""}
${sec.contact ? `<footer><div class="mono">CORRESPONDENCE</div><div class="big">Start the conversation.</div><div class="mono links" style="margin-top:16px">${linkRow(p, ink)}</div></footer>` : ""}
</div>${credit(badge, { fg: ink, accent })}</body></html>`;
}

// standalone case-study page in the Editorial skin
export function editorialCase(p, pal, pr, nav, ctx = {}) {
  const badge = ctx.badge;
  const [paper, ink, accent, soft] = pal.vars;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pr.name)} · ${esc(p.name)}</title><meta name="description" content="${esc(pr.summary || pr.desc || pr.name)}">
${caseHead(p, pal, pr, { bg: paper, panel: ink, accent, accent2: soft, text: ink }, ctx)}
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:${paper};color:${ink};font-family:Inter,sans-serif;line-height:1.7}
.mono{font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.3em;text-transform:uppercase;color:${soft}}
.wrap{max-width:820px;margin:0 auto;padding:0 6vw}
.back{display:inline-block;margin:6vh 0 0;color:${accent};text-decoration:none;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.16em;border-bottom:1px solid ${accent}}
header{padding:5vh 0 6vh;border-bottom:2px solid ${ink}}
h1{font-family:'Instrument Serif',serif;font-weight:400;font-size:clamp(2.4rem,7vw,4.6rem);line-height:1.03;margin-top:16px}
.sum{font-size:1.14rem;max-width:60ch;color:${ink}dd;margin-top:14px}
.meta{display:flex;gap:34px;flex-wrap:wrap;margin-top:24px;padding-top:18px;border-top:1px solid ${ink}22}
.meta span{font-size:.9rem}
.meta b{display:block;font-family:'IBM Plex Mono',monospace;font-size:8.5px;letter-spacing:.22em;color:${accent};margin-bottom:3px}
.cover{width:100%;aspect-ratio:21/9;object-fit:cover;border-radius:2px;margin:5vh 0 0;display:block;filter:grayscale(10%)}
.blk{padding:6vh 0;border-bottom:1px solid ${ink}22}
.blk h2{font-family:'Instrument Serif',serif;font-weight:400;font-size:clamp(1.5rem,3.4vw,2.2rem);color:${accent};margin-bottom:14px}
.blk p{font-size:1.1rem;max-width:66ch;color:${ink}ee}
.next{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:6vh 0}
.next a{color:${accent};text-decoration:none;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.16em;border-bottom:1px solid ${accent}}
${Array.isArray(pr.metrics) && pr.metrics.length ? `.csmet2{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0 30px;margin-top:22px}
.csmet2 div{border-top:1.5px solid ${ink};padding:14px 0;display:flex;flex-direction:column;gap:3px}
.csmet2 div span:first-child{font-family:'Instrument Serif',serif;font-size:2rem;color:${accent}}
.csmet2 div span:last-child{font-family:'IBM Plex Mono',monospace;font-size:8.5px;letter-spacing:.22em;text-transform:uppercase;color:${soft}}
\n` : ""}</style></head><body><div class="wrap">
<a class="back" href="../index.html">← Back to the film</a>
<header><div class="mono">Case Study</div><h1>${esc(pr.name)}</h1>${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}${metaRow(pr, "meta")}</header>
${pr.cover ? `<img class="cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}
${["problem", "process", "results"].filter((k) => pr[k]).map((k) => `<div class="blk"><h2>${k === "problem" ? "The problem" : k === "process" ? "The process" : "The results"}</h2><p>${esc(pr[k])}</p></div>`).join("")}${metricsBlocks(pr, "csmet2")}
${nav ? `<div class="next"><a href="../index.html">← All work</a>${nav.next ? `<a href="${esc(nav.next.slug)}.html">Next: ${esc(nav.next.pr.name)} →</a>` : ""}</div>` : ""}
</div>${credit(badge, { fg: ink, accent })}</body></html>`;
}

/* ================================================================
   TEMPLATE 03 · THE TERMINAL (engineer's console)
================================================================ */
