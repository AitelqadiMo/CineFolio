// The monolith family. Moved verbatim out of engine.js so each family can be
// edited without contending on one module. Behaviour is unchanged.
import { esc, indexHead, caseHead, initialsAvatar, linkRow, credit, normExperience, hasCerts, hasLangObjs, eduLabel, langLabel, isCaseStudy, metaRow, csBlocks, noHref, metricsBlocks, hasMetrics } from "../shared.js";

export function monolith(p, pal, sec, ctx = {}) {
  const [bg, panel, accent, accent2, text] = pal.vars;
  const caseHref = ctx.caseHref || noHref;
  const badge = ctx.badge; // undefined -> on by default; false -> owner removed it
  const exp = normExperience(p);
  const photo = p.photo || initialsAvatar(p.name, panel, accent2);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} · ${esc(p.headline)}</title><meta name="description" content="${esc(p.summary || p.headline)}">
${indexHead(p, pal, { bg, panel, accent, accent2, text })}
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Instrument+Serif:ital@1&family=IBM+Plex+Mono:wght@400;600&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}
body{background:${bg};color:${text};font-family:Inter,sans-serif;line-height:1.6;overflow-x:hidden}
.mono{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:${accent2}}
.up{opacity:0;transform:translateY(26px);animation:up .9s cubic-bezier(.22,1,.36,1) forwards}
@keyframes up{to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.up{animation:none;opacity:1;transform:none}}
header{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:8vh 6vw;position:relative}
header:before{content:"";position:absolute;inset:0;background:radial-gradient(55% 45% at 50% 35%,${accent}22,transparent 70%)}
.ph{width:132px;height:132px;border-radius:50%;object-fit:cover;border:3px solid ${accent2};box-shadow:0 0 60px ${accent2}44;margin-bottom:26px;position:relative}
h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(2.6rem,9vw,5.8rem);line-height:.98;text-transform:uppercase;letter-spacing:-.02em;position:relative}
h1 em{font-family:'Instrument Serif',serif;font-style:italic;font-weight:400;text-transform:none;background:linear-gradient(90deg,${accent},${accent2});-webkit-background-clip:text;background-clip:text;color:transparent}
.head2{margin-top:16px;position:relative}.links{margin-top:22px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;position:relative}
.links a{color:${accent2};text-decoration:none;border-bottom:1px solid ${accent2}66}
.marq{overflow:hidden;background:${accent2};padding:12px 0}
.marq div{display:flex;gap:34px;width:max-content;animation:mq 24s linear infinite;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:15px;text-transform:uppercase;color:${bg};white-space:nowrap}
@keyframes mq{to{transform:translateX(-33.33%)}}
section{max-width:920px;margin:0 auto;padding:9vh 6vw}
h2{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(1.5rem,3.4vw,2.3rem);text-transform:uppercase;margin-bottom:30px}
h2:before{content:"";display:inline-block;width:30px;height:3px;background:linear-gradient(90deg,${accent},${accent2});margin-right:14px;vertical-align:middle;border-radius:2px}
.chips{display:flex;flex-wrap:wrap;gap:9px}
.chip{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;padding:9px 14px;border:1px solid ${text}33;border-radius:99px}
.chip:nth-child(3n){border-color:${accent};color:${accent === "#C8102E" ? "#ff8d96" : accent}}
.chip:nth-child(4n){border-color:${accent2};color:${accent2}}
.xp{border-left:2px solid ${text}22;padding-left:26px;position:relative;margin-bottom:34px}
.xp:before{content:"";position:absolute;left:-7px;top:6px;width:12px;height:12px;background:${accent2};transform:rotate(45deg)}
.xp .per{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.22em;color:${accent2}}
.xp h3{font-family:'Bricolage Grotesque',sans-serif;font-size:1.2rem;margin:6px 0 2px}
.xp .org{color:${text}99;font-size:.92rem;margin-bottom:9px}
.xp li{margin:0 0 7px 17px;color:${text}cc;font-size:.94rem}
.pr{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.prc{background:${panel};border:1px solid ${text}1c;border-radius:14px;padding:22px;transition:transform .25s}
.prc:hover{transform:translateY(-5px)}
.prc b{font-family:'Bricolage Grotesque',sans-serif;font-size:1.05rem}
.prc p{color:${text}aa;font-size:.9rem;margin-top:7px}
.prc a.more{display:inline-block;margin-top:12px;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:${accent2};text-decoration:none;border-bottom:1px solid ${accent2}66}
.prc.link{cursor:pointer}
footer{text-align:center;padding:10vh 6vw 4vh}
footer .big{font-family:'Instrument Serif',serif;font-style:italic;font-size:clamp(1.6rem,4.5vw,2.8rem)}
footer .links{margin-top:20px}
.cs{margin:0 0 8vh;border:1px solid ${text}1c;border-radius:18px;overflow:hidden;background:${panel}}
.cs img.cover{width:100%;aspect-ratio:21/9;object-fit:cover;display:block}
.cs .body{padding:clamp(1.4rem,3.5vw,2.6rem)}
.cs h3{font-family:'Bricolage Grotesque',sans-serif;font-size:clamp(1.3rem,3vw,1.9rem);text-transform:uppercase}
.cs .sum{color:${text}bb;margin-top:8px;max-width:62ch}
.csmeta{display:flex;gap:26px;flex-wrap:wrap;margin:18px 0 4px;padding:14px 0;border-top:1px solid ${text}1c;border-bottom:1px solid ${text}1c}
.csmeta span{font-size:.85rem;color:${text}cc}
.csmeta b{display:block;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.24em;color:${accent2};margin-bottom:3px}
.csb{margin-top:22px}
.csb h4{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:${accent2};margin-bottom:8px}
.csb p{color:${text}cc;max-width:68ch}
.svc{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.svc div{border:1px solid ${text}1c;border-radius:14px;padding:20px;background:${panel}}
.svc b{font-family:'Bricolage Grotesque',sans-serif}
.svc p{color:${text}aa;font-size:.9rem;margin-top:6px}
.tst{border-left:3px solid ${accent2};padding:6px 0 6px 22px;margin-bottom:22px}
.tst p{font-family:'Instrument Serif',serif;font-style:italic;font-size:1.25rem;line-height:1.55}
.tst span{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.2em;color:${text}99;text-transform:uppercase}
.rr{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.rr div{border:1px solid ${text}1c;border-radius:14px;padding:18px;background:${panel}}
.rr b{font-family:'Bricolage Grotesque',sans-serif;font-size:1rem}
.rr .m{color:${text}99;font-size:.85rem;margin-top:5px}
.rr a{color:${accent2};text-decoration:none;border-bottom:1px solid ${accent2}66}
.lang{display:flex;flex-wrap:wrap;gap:10px}
.lang span{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.08em;padding:8px 14px;border:1px solid ${text}33;border-radius:99px}
${hasMetrics(p.projects) ? `.csmet{display:flex;gap:14px;flex-wrap:wrap;margin:20px 0 0}
.csmet div{flex:1;min-width:100px;background:${bg};border:1px solid ${accent2}33;border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:4px}
.csmet div span:first-child{font-family:'Bricolage Grotesque',sans-serif;font-size:1.9rem;font-weight:800;color:${accent2};line-height:1}
.csmet div span:last-child{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:${text}88}
\n` : ""}</style></head><body>
<header><img class="ph up" src="${photo}" alt="${esc(p.name)}">
<div class="mono up" style="animation-delay:.1s;margin-bottom:14px">FEATURE PRESENTATION</div>
<h1 class="up" style="animation-delay:.18s">${esc(p.name.split(" ")[0])}<br><em>${esc(p.name.split(" ").slice(1).join(" ") || p.headline.split(" ")[0])}</em></h1>
<div class="mono head2 up" style="animation-delay:.3s">${esc(p.headline)}</div>
<div class="links up" style="animation-delay:.4s">${linkRow(p, text)}</div></header>
<div class="marq" aria-hidden="true"><div>${(p.skills.slice(0, 6).map((s) => esc(s.toUpperCase())).join(" ✦ ") + " ✦ ").repeat(3)}</div></div>
${sec.about && p.summary ? `<section><h2>The story</h2><p style="font-size:1.06rem;color:${text}dd;max-width:60ch">${esc(p.summary)}</p></section>` : ""}
${sec.skills && p.skills.length ? `<section><h2>The craft</h2><div class="chips">${p.skills.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div></section>` : ""}
${sec.experience && exp.length ? `<section><h2>Selected scenes</h2>${exp.map((x) => `<div class="xp">${x.period ? `<div class="per">${esc(x.period)}</div>` : ""}<h3>${esc(x.title)}</h3>${x.org ? `<div class="org">${esc(x.org)}</div>` : ""}<ul>${x.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul></div>`).join("")}</section>` : ""}
${sec.projects && p.projects.length ? `<section><h2>Productions</h2>
${p.projects.filter(isCaseStudy).map((pr, i) => { const href = caseHref(pr); return href
  ? `<div class="cs" id="cs${i}"><div class="body"><h3>${esc(pr.name)}</h3>${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}${metaRow(pr, "csmeta")}<a class="prc-more" style="display:inline-block;margin-top:18px;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:${accent2};text-decoration:none;border-bottom:1px solid ${accent2}66" href="${href}">View the full case study →</a></div></div>`
  : `<div class="cs" id="cs${i}">${pr.cover ? `<img class="cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}<div class="body"><h3>${esc(pr.name)}</h3>${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}${metaRow(pr, "csmeta")}${csBlocks(pr, "csb")}${metricsBlocks(pr, "csmet")}</div></div>`; }).join("")}
${p.projects.filter((pr) => !isCaseStudy(pr)).length ? `<div class="pr">${p.projects.filter((pr) => !isCaseStudy(pr)).map((pr) => `<div class="prc"><b>${esc(pr.name)}</b><p>${esc(pr.summary || pr.desc)}</p></div>`).join("")}</div>` : ""}</section>` : ""}
${sec.services && (p.services || []).length ? `<section><h2>Services</h2><div class="svc">${p.services.map((sv) => `<div><b>${esc(sv.name)}</b><p>${esc(sv.desc)}</p></div>`).join("")}</div></section>` : ""}
${sec.testimonials && (p.testimonials || []).length ? `<section><h2>Word on set</h2>${p.testimonials.map((t) => `<div class="tst"><p>“${esc(t.quote)}”</p><span>· ${esc(t.who)}</span></div>`).join("")}</section>` : ""}
${sec.education && (p.education || []).length ? `<section><h2>Training</h2><ul style="list-style:none">${p.education.map((e) => `<li style="padding:10px 0;border-bottom:1px solid ${text}18">${esc(eduLabel(e))}</li>`).join("")}</ul></section>` : ""}
${sec.certifications !== false && hasCerts(p) ? `<section><h2>Certifications</h2><div class="rr">${p.certifications.map((c) => `<div><b>${esc(c.name)}</b><div class="m">${[c.issuer, c.year].filter(Boolean).map(esc).join(" · ")}</div>${c.url ? `<div style="margin-top:8px"><a href="${/^http/.test(c.url) ? esc(c.url) : "https://" + esc(c.url)}" target="_blank" rel="noopener noreferrer">Credential ↗</a></div>` : ""}</div>`).join("")}</div></section>` : ""}
${sec.languages !== false && hasLangObjs(p) ? `<section><h2>Languages</h2><div class="lang">${p.languages.map((l) => `<span>${esc(langLabel(l))}</span>`).join("")}</div></section>` : ""}
${sec.contact ? `<footer><div class="mono">CLOSING CREDITS</div><div class="big">Let's make something worth watching.</div><div class="links">${linkRow(p, text)}</div></footer>` : ""}
${credit(badge, { fg: text, accent: accent2 })}</body></html>`;
}

// standalone case-study page in the Monolith skin
export function monolithCase(p, pal, pr, nav, ctx = {}) {
  const badge = ctx.badge;
  const [bg, panel, accent, accent2, text] = pal.vars;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pr.name)} · ${esc(p.name)}</title><meta name="description" content="${esc(pr.summary || pr.desc || pr.name)}">
${caseHead(p, pal, pr, { bg, panel, accent, accent2, text }, ctx)}
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Instrument+Serif:ital@1&family=IBM+Plex+Mono:wght@400;600&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}
body{background:${bg};color:${text};font-family:Inter,sans-serif;line-height:1.65;overflow-x:hidden}
.mono{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:${accent2}}
.wrap{max-width:920px;margin:0 auto;padding:0 6vw}
.back{display:inline-block;margin:5vh 0 0;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;color:${accent2};text-decoration:none;border-bottom:1px solid ${accent2}66}
.hero{padding:6vh 0 5vh;position:relative}
.hero:before{content:"";position:absolute;inset:-6vh -6vw auto;height:60vh;background:radial-gradient(55% 60% at 30% 20%,${accent}22,transparent 70%);pointer-events:none}
h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(2.2rem,7vw,4.6rem);line-height:1;text-transform:uppercase;letter-spacing:-.02em;position:relative}
.sum{color:${text}cc;font-size:1.12rem;max-width:60ch;margin-top:16px;position:relative}
.meta{display:flex;gap:34px;flex-wrap:wrap;margin:26px 0 0;padding:18px 0;border-top:1px solid ${text}1c;border-bottom:1px solid ${text}1c;position:relative}
.meta span{font-size:.9rem;color:${text}dd}
.meta b{display:block;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.24em;color:${accent2};margin-bottom:4px}
.cover{width:100%;aspect-ratio:21/9;object-fit:cover;border-radius:16px;margin:0 0 2vh;display:block;border:1px solid ${text}1c}
.blk{padding:6vh 0;border-top:1px solid ${text}14}
.blk:first-of-type{border-top:0}
.blk h2{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(1.4rem,3.4vw,2.1rem);text-transform:uppercase;margin-bottom:18px}
.blk h2:before{content:"";display:inline-block;width:30px;height:3px;background:linear-gradient(90deg,${accent},${accent2});margin-right:14px;vertical-align:middle;border-radius:2px}
.blk p{color:${text}dd;font-size:1.06rem;max-width:70ch}
.next{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:7vh 0 3vh;border-top:1px solid ${text}1c}
.next a{color:${accent2};text-decoration:none;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;border-bottom:1px solid ${accent2}66}
${Array.isArray(pr.metrics) && pr.metrics.length ? `.csmet{display:flex;gap:14px;flex-wrap:wrap;margin:26px 0 0}
.csmet div{flex:1;min-width:110px;background:${bg};border:1px solid ${accent2}33;border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:4px}
.csmet div span:first-child{font-family:'Bricolage Grotesque',sans-serif;font-size:2rem;font-weight:800;color:${accent2};line-height:1}
.csmet div span:last-child{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:${text}88}
\n` : ""}</style></head><body>
<div class="wrap">
<a class="back" href="../index.html">← Back to the film</a>
<div class="hero"><div class="mono" style="margin-bottom:14px">CASE STUDY</div><h1>${esc(pr.name)}</h1>${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}${metaRow(pr, "meta")}</div>
${pr.cover ? `<img class="cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}
${["problem", "process", "results"].filter((k) => pr[k]).map((k) => `<div class="blk"><h2>${k === "problem" ? "The problem" : k === "process" ? "The process" : "The results"}</h2><p>${esc(pr[k])}</p></div>`).join("")}${metricsBlocks(pr, "csmet")}
${nav ? `<div class="next"><a href="../index.html">← All productions</a>${nav.next ? `<a href="${esc(nav.next.slug)}.html">Next: ${esc(nav.next.pr.name)} →</a>` : ""}</div>` : ""}
</div>${credit(badge, { fg: text, accent: accent2 })}</body></html>`;
}

/* ================================================================
   TEMPLATE 02 · THE EDITORIAL (light magazine)
================================================================ */
