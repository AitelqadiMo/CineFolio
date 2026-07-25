// The gallery family. Moved verbatim out of engine.js so each family can be
// edited without contending on one module. Behaviour is unchanged.
import { esc, indexHead, caseHead, cap, initialsAvatar, linkRow, credit, normExperience, hasCerts, hasLangObjs, eduLabel, langLabel, isCaseStudy, metaRow, noHref, metricsBlocks, hasMetrics } from "../shared.js";

export function gallery(p, pal, sec, ctx = {}) {
  const [canvas, ink, accent, soft, rule] = pal.vars;
  const caseHref = ctx.caseHref || noHref;
  const badge = ctx.badge; // undefined -> on by default; false -> owner removed it
  const exp = normExperience(p);
  const hasPhoto = !!p.photo;
  const photo = p.photo || initialsAvatar(p.name, ink, canvas);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} · ${esc(p.headline)}</title><meta name="description" content="${esc(p.summary || p.headline)}">
${indexHead(p, pal, { bg: canvas, panel: ink, accent, accent2: soft, text: ink })}
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Fraunces:opsz,wght@9..144,300;9..144,500&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}
body{background:${canvas};color:${ink};font-family:'Cormorant Garamond',Georgia,serif;line-height:1.55;-webkit-font-smoothing:antialiased}
.cap{font-family:Inter,sans-serif;font-size:10.5px;letter-spacing:.26em;text-transform:uppercase;color:${soft}}
a{color:${ink}}
a:focus-visible,.cover:focus-visible{outline:2px solid ${accent};outline-offset:3px}
.fade{opacity:0;transform:translateY(20px);animation:fade 1.1s cubic-bezier(.22,1,.36,1) forwards}
@keyframes fade{to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.fade{animation:none;opacity:1;transform:none}}
.wrap{max-width:1120px;margin:0 auto;padding:0 7vw}
header{padding:16vh 0 9vh;text-align:center}
h1{font-family:'Fraunces',serif;font-weight:300;font-size:clamp(3rem,10vw,7rem);line-height:1;letter-spacing:-.015em}
h1 em{font-style:italic;color:${accent}}
.head2{margin-top:22px}
.links{margin-top:26px;font-family:Inter,sans-serif;font-size:12px;letter-spacing:.12em}
.links a{color:${ink};text-decoration:none;border-bottom:1px solid ${rule}}
.links a:hover{border-color:${accent}}
.hair{height:1px;background:${rule};margin:0 7vw}
.portrait{margin:9vh 0 0;position:relative}
.portrait img{width:100%;max-height:78vh;object-fit:cover;display:block;filter:grayscale(6%)}
.portrait figcaption{margin-top:12px;text-align:center}
section{padding:9vh 0}
.shead{text-align:center;margin-bottom:5vh}
h2{font-family:'Fraunces',serif;font-weight:300;font-size:clamp(1.7rem,4vw,2.8rem);letter-spacing:-.01em}
.lede{font-size:clamp(1.25rem,2.4vw,1.7rem);max-width:34ch;margin:0 auto;text-align:center;color:${ink}}
.skl{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 28px;max-width:52ch;margin:0 auto}
.skl span{font-family:Inter,sans-serif;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${soft}}
.xp{max-width:60ch;margin:0 auto 4vh;padding-bottom:4vh;border-bottom:1px solid ${rule}}
.xp:last-child{border-bottom:0}
.xp .per{font-family:Inter,sans-serif;font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:${soft}}
.xp h3{font-family:'Fraunces',serif;font-weight:500;font-size:1.55rem;margin:8px 0 2px}
.xp .org{color:${accent};font-size:1.15rem;margin-bottom:12px}
.xp li{margin:0 0 8px 20px;font-size:1.2rem;color:${ink}}
figure.work{margin:0 0 11vh}
figure.work .cover{display:block;width:100vw;position:relative;left:50%;transform:translateX(-50%);max-height:82vh;object-fit:cover;background:${rule}}
figure.work .plaque{max-width:60ch;margin:26px auto 0;text-align:center}
figure.work h3{font-family:'Fraunces',serif;font-weight:400;font-size:clamp(1.6rem,3.2vw,2.4rem)}
figure.work h3 a{color:inherit;text-decoration:none}
figure.work h3 a:hover{color:${accent}}
figure.work .sum{font-size:1.25rem;color:${ink};margin-top:10px}
.wmeta{display:flex;justify-content:center;gap:30px;flex-wrap:wrap;margin:16px 0;font-family:Inter,sans-serif}
.wmeta span{font-size:.8rem;color:${soft}}
.wmeta b{display:block;font-size:8.5px;letter-spacing:.22em;color:${accent};margin-bottom:3px}
.wblk{max-width:60ch;margin:20px auto 0;text-align:left}
.wblk h4{font-family:Inter,sans-serif;font-size:9.5px;letter-spacing:.26em;text-transform:uppercase;color:${accent};margin:22px 0 6px;padding-top:22px;border-top:1px solid ${rule}}
.wblk p{font-size:1.2rem;color:${ink}}
.more{display:inline-block;margin-top:16px;font-family:Inter,sans-serif;font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:${accent};text-decoration:none;border-bottom:1px solid ${accent}66}
.plain{max-width:60ch;margin:0 auto}
.plain .row{padding:22px 0;border-top:1px solid ${rule};text-align:center}
.plain .row:first-child{border-top:0}
.plain b{font-family:'Fraunces',serif;font-weight:500;font-size:1.4rem}
.plain p{font-size:1.15rem;color:${soft};margin-top:5px}
.rr{max-width:60ch;margin:0 auto}
.rr .row{padding:18px 0;border-top:1px solid ${rule};text-align:center}
.rr .row:first-child{border-top:0}
.rr b{font-family:'Fraunces',serif;font-weight:500;font-size:1.3rem}
.rr .m{font-family:Inter,sans-serif;font-size:11px;letter-spacing:.1em;color:${soft};margin-top:5px;text-transform:uppercase}
.rr a{color:${accent};text-decoration:none;border-bottom:1px solid ${accent}66}
footer{padding:14vh 0 6vh;text-align:center}
footer .big{font-family:'Fraunces',serif;font-style:italic;font-weight:300;font-size:clamp(2rem,5vw,3.4rem)}
footer .links{margin-top:26px}
${hasMetrics(p.projects) ? `.wmet{display:flex;justify-content:center;gap:0;flex-wrap:wrap;margin:20px auto 0;max-width:58ch}
.wmet div{flex:1;min-width:90px;text-align:center;padding:14px 10px;border-left:1px solid ${rule};display:flex;flex-direction:column;gap:5px}
.wmet div:first-child{border-left:0}
.wmet div span:first-child{font-family:'Fraunces',serif;font-weight:500;font-size:1.8rem;color:${accent};line-height:1}
.wmet div span:last-child{font-family:Inter,sans-serif;font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:${soft}}
\n` : ""}</style></head><body>
<header class="wrap">
<div class="cap fade">Portfolio</div>
<h1 class="fade" style="animation-delay:.1s;margin-top:18px">${esc(p.name.split(" ")[0])} <em>${esc(p.name.split(" ").slice(1).join(" ") || "")}</em></h1>
<div class="cap head2 fade" style="animation-delay:.24s">${esc(p.headline)}</div>
<div class="links fade" style="animation-delay:.34s">${linkRow(p, ink)}</div>
</header>
${hasPhoto ? `<figure class="portrait fade wrap"><img src="${photo}" alt="Portrait of ${esc(p.name)}"><figcaption class="cap">${esc(p.name)} · ${esc(p.headline)}</figcaption></figure>` : ""}
<div class="hair"></div>
${sec.about && p.summary ? `<section class="wrap"><p class="lede">${esc(p.summary)}</p></section><div class="hair"></div>` : ""}
${sec.projects && p.projects.length ? `<section class="wrap"><div class="shead"><h2>Selected work</h2></div>
${p.projects.filter(isCaseStudy).map((pr) => { const href = caseHref(pr); return href
  ? `<figure class="work">${pr.cover ? `<a href="${href}"><img class="cover" src="${pr.cover}" alt="${esc(pr.name)}"></a>` : ""}<div class="plaque"><h3><a href="${href}">${esc(pr.name)}</a></h3>${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}${metaRow(pr, "wmeta")}<a class="more" href="${href}">View the case study</a></div></figure>`
  : `<figure class="work">${pr.cover ? `<img class="cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}<div class="plaque"><h3>${esc(pr.name)}</h3>${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}${metaRow(pr, "wmeta")}</div>${["problem", "process", "results"].filter((k) => pr[k]).length ? `<div class="wblk">${["problem", "process", "results"].filter((k) => pr[k]).map((k) => `<h4>${k === "problem" ? "The problem" : k === "process" ? "The process" : "The results"}</h4><p>${esc(pr[k])}</p>`).join("")}</div>` : ""}${metricsBlocks(pr, "wmet")}</figure>`; }).join("")}
${p.projects.filter((pr) => !isCaseStudy(pr)).length ? `<div class="plain">${p.projects.filter((pr) => !isCaseStudy(pr)).map((pr) => `<div class="row"><b>${esc(pr.name)}</b><p>${esc(pr.summary || pr.desc)}</p></div>`).join("")}</div>` : ""}</section><div class="hair"></div>` : ""}
${sec.experience && exp.length ? `<section class="wrap"><div class="shead"><h2>Experience</h2></div>${exp.map((x) => `<div class="xp">${x.period ? `<div class="per">${esc(x.period)}</div>` : ""}<h3>${esc(x.title)}</h3>${x.org ? `<div class="org">${esc(x.org)}</div>` : ""}<ul style="list-style:none">${x.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul></div>`).join("")}</section><div class="hair"></div>` : ""}
${sec.skills && p.skills.length ? `<section class="wrap"><div class="shead"><h2>Practice</h2></div><div class="skl">${p.skills.map((s) => `<span>${esc(s)}</span>`).join("")}</div></section><div class="hair"></div>` : ""}
${sec.services && (p.services || []).length ? `<section class="wrap"><div class="shead"><h2>Services</h2></div><div class="plain">${p.services.map((sv) => `<div class="row"><b>${esc(sv.name)}</b><p>${esc(sv.desc)}</p></div>`).join("")}</div></section><div class="hair"></div>` : ""}
${sec.testimonials && (p.testimonials || []).length ? `<section class="wrap"><div class="shead"><h2>In their words</h2></div><div class="plain">${p.testimonials.map((t) => `<div class="row"><b style="font-style:italic;font-weight:400">“${esc(t.quote)}”</b><p>${esc(t.who)}</p></div>`).join("")}</div></section><div class="hair"></div>` : ""}
${sec.education && (p.education || []).length ? `<section class="wrap"><div class="shead"><h2>Education</h2></div><div class="plain">${p.education.map((e) => `<div class="row"><b>${esc(eduLabel(e))}</b></div>`).join("")}</div></section><div class="hair"></div>` : ""}
${sec.certifications !== false && hasCerts(p) ? `<section class="wrap"><div class="shead"><h2>Certifications</h2></div><div class="rr">${p.certifications.map((c) => `<div class="row"><b>${esc(c.name)}</b><div class="m">${[c.issuer, c.year].filter(Boolean).map(esc).join(" · ")}</div>${c.url ? `<div style="margin-top:8px"><a href="${/^http/.test(c.url) ? esc(c.url) : "https://" + esc(c.url)}" target="_blank" rel="noopener noreferrer">Credential</a></div>` : ""}</div>`).join("")}</div></section><div class="hair"></div>` : ""}
${sec.languages !== false && hasLangObjs(p) ? `<section class="wrap"><div class="shead"><h2>Languages</h2></div><div class="skl">${p.languages.map((l) => `<span>${esc(langLabel(l))}</span>`).join("")}</div></section><div class="hair"></div>` : ""}
${sec.contact ? `<footer class="wrap"><div class="cap">Get in touch</div><div class="big">Let's make something beautiful.</div><div class="links">${linkRow(p, ink)}</div></footer>` : ""}
${credit(badge, { fg: ink, accent })}</body></html>`;
}

// standalone case-study page in the Gallery skin
export function galleryCase(p, pal, pr, nav, ctx = {}) {
  const badge = ctx.badge;
  const [canvas, ink, accent, soft, rule] = pal.vars;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pr.name)} · ${esc(p.name)}</title><meta name="description" content="${esc(pr.summary || pr.desc || pr.name)}">
${caseHead(p, pal, pr, { bg: canvas, panel: ink, accent, accent2: soft, text: ink }, ctx)}
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Fraunces:opsz,wght@9..144,300;9..144,500&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}
body{background:${canvas};color:${ink};font-family:'Cormorant Garamond',Georgia,serif;line-height:1.6}
.cap{font-family:Inter,sans-serif;font-size:10.5px;letter-spacing:.26em;text-transform:uppercase;color:${soft}}
a:focus-visible{outline:2px solid ${accent};outline-offset:3px}
.wrap{max-width:820px;margin:0 auto;padding:0 7vw}
.back{display:inline-block;margin:6vh 0 0;font-family:Inter,sans-serif;font-size:11px;letter-spacing:.14em;color:${ink};text-decoration:none;border-bottom:1px solid ${rule}}
.back:hover{border-color:${accent}}
.plaque{text-align:center;padding:6vh 0 5vh}
h1{font-family:'Fraunces',serif;font-weight:300;font-size:clamp(2.4rem,7vw,4.8rem);line-height:1.03;letter-spacing:-.015em;margin-top:16px}
.meta{display:flex;justify-content:center;gap:34px;flex-wrap:wrap;margin-top:24px}
.meta span{font-family:Inter,sans-serif;font-size:.82rem;color:${soft}}
.meta b{display:block;font-size:8.5px;letter-spacing:.22em;color:${accent};margin-bottom:4px}
.cover{width:100vw;position:relative;left:50%;transform:translateX(-50%);max-height:86vh;object-fit:cover;display:block;background:${rule}}
.blk{max-width:62ch;margin:0 auto;padding:6vh 0;border-top:1px solid ${rule}}
.blk:first-of-type{border-top:0}
.blk h2{font-family:Inter,sans-serif;font-size:10px;letter-spacing:.26em;text-transform:uppercase;color:${accent};margin-bottom:14px}
.blk p{font-size:1.3rem;color:${ink}}
.next{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:7vh 0;border-top:1px solid ${rule};font-family:Inter,sans-serif}
.next a{color:${ink};text-decoration:none;font-size:11px;letter-spacing:.14em;border-bottom:1px solid ${rule}}
.next a:hover{border-color:${accent}}
${Array.isArray(pr.metrics) && pr.metrics.length ? `.csmet{display:flex;justify-content:center;gap:0;flex-wrap:wrap;margin:28px auto 0;max-width:60ch}
.csmet div{flex:1;min-width:90px;text-align:center;padding:14px 10px;border-left:1px solid ${rule};display:flex;flex-direction:column;gap:5px}
.csmet div:first-child{border-left:0}
.csmet div span:first-child{font-family:'Fraunces',serif;font-weight:500;font-size:1.9rem;color:${accent};line-height:1}
.csmet div span:last-child{font-family:Inter,sans-serif;font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:${soft}}
\n` : ""}</style></head><body>
<div class="wrap"><a class="back" href="../index.html">Back to the portfolio</a>
<div class="plaque"><div class="cap">Case study</div><h1>${esc(pr.name)}</h1>${pr.summary || pr.desc ? `<p style="font-size:1.35rem;max-width:44ch;margin:16px auto 0;color:${ink}">${esc(pr.summary || pr.desc)}</p>` : ""}${metaRow(pr, "meta")}${metricsBlocks(pr, "csmet")}</div></div>
${pr.cover ? `<img class="cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}
<div class="wrap">
${["problem", "process", "results"].filter((k) => pr[k]).map((k) => `<div class="blk"><h2>${k === "problem" ? "The problem" : k === "process" ? "The process" : "The results"}</h2><p>${esc(pr[k])}</p></div>`).join("")}
${nav ? `<div class="next"><a href="../index.html">All work</a>${nav.next ? `<a href="${esc(nav.next.slug)}.html">Next: ${esc(nav.next.pr.name)}</a>` : ""}</div>` : ""}
</div>${credit(badge, { fg: ink, accent })}</body></html>`;
}

/* ================================================================
   TEMPLATE 05 · THE BENTO (rounded-tile grid)
================================================================ */
