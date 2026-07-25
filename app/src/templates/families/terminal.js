// The terminal family. Moved verbatim out of engine.js so each family can be
// edited without contending on one module. Behaviour is unchanged.
import { esc, indexHead, caseHead, linkRow, credit, normExperience, hasCerts, hasLangObjs, eduLabel, langLabel, slugify, isCaseStudy, noHref } from "../shared.js";

export function terminal(p, pal, sec, ctx = {}) {
  const [bg, green, amber, dim] = pal.vars;
  const caseHref = ctx.caseHref || noHref;
  const badge = ctx.badge; // undefined -> on by default; false -> owner removed it
  const exp = normExperience(p);
  const bar = (i) => { const f = 9 - (i % 4); return "█".repeat(f) + "░".repeat(10 - f); };
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} · ${esc(p.headline)}</title><meta name="description" content="${esc(p.summary || p.headline)}">
${indexHead(p, pal, { bg, panel: bg, accent: green, accent2: amber, text: green })}
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:${bg};color:${green};font-family:'IBM Plex Mono',monospace;font-size:14px;line-height:1.7;padding:5vh 5vw}
.win{max-width:880px;margin:0 auto;border:1px solid ${green}44;border-radius:10px;overflow:hidden;box-shadow:0 0 60px ${green}18}
.tbar{background:${green}14;padding:10px 16px;display:flex;gap:8px;align-items:center;border-bottom:1px solid ${green}33}
.tbar i{width:11px;height:11px;border-radius:50%;display:inline-block}
.tbar .t{margin-left:10px;font-size:11px;color:${dim};letter-spacing:.08em}
main{padding:28px clamp(16px,4vw,44px) 40px}
.ps{color:${amber}}
.cmd{color:#fff}
.out{color:${dim};margin:4px 0 22px}
h1{font-size:clamp(1.5rem,5vw,2.4rem);color:#fff;font-weight:600;letter-spacing:-.01em}
a{color:${amber};text-decoration:none;border-bottom:1px dashed ${amber}88}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:4px 26px;margin:6px 0 22px}
.sk{white-space:nowrap;color:${dim}}.sk b{color:${green};font-weight:400}
.xp{margin:0 0 18px;padding-left:18px;border-left:1px solid ${green}33}
.xp .c{color:${amber}}
.xp .d{color:${dim};font-size:12.5px}
.xp li{list-style:none;color:${dim}}.xp li:before{content:"·  ";color:${green}}
.cur{display:inline-block;width:9px;height:17px;background:${green};animation:bl 1.1s steps(2) infinite;vertical-align:-3px}
@keyframes bl{50%{opacity:0}}
@media(prefers-reduced-motion:reduce){.cur{animation:none}}
</style></head><body>
<div class="win"><div class="tbar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span class="t">${esc(p.name.toLowerCase().replace(/\s+/g, "-"))} · portfolio.sh</span></div>
<main>
<div><span class="ps">➜ ~</span> <span class="cmd">whoami</span></div>
<h1>${esc(p.name)}</h1>
<div class="out">${esc(p.headline)}${p.phone ? " · " + esc(p.phone) : ""}<br>${linkRow(p, dim)}</div>
${sec.about && p.summary ? `<div><span class="ps">➜ ~</span> <span class="cmd">cat README.md</span></div><div class="out">${esc(p.summary)}</div>` : ""}
${sec.skills && p.skills.length ? `<div><span class="ps">➜ ~</span> <span class="cmd">./skills --graph</span></div>
<div class="grid">${p.skills.map((s, i) => `<span class="sk"><b>${esc(s.toLowerCase().padEnd(2))}</b> ${bar(i)}</span>`).join("")}</div>` : ""}
${sec.experience && exp.length ? `<div><span class="ps">➜ ~</span> <span class="cmd">git log --career</span></div>
${exp.map((x) => `<div class="xp"><div class="c">* ${esc(x.title)}${x.org ? ` @ ${esc(x.org)}` : ""}</div>${x.period ? `<div class="d">${esc(x.period)}</div>` : ""}<ul>${x.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul></div>`).join("")}` : ""}
${sec.projects && p.projects.length ? `<div><span class="ps">➜ ~</span> <span class="cmd">ls projects/</span></div>${p.projects.map((pr) => { const href = caseHref(pr); return `<div class="xp"><div class="c">${href ? `<a href="${href}">${esc(pr.name)}/</a>` : `${esc(pr.name)}/`}${isCaseStudy(pr) ? " · case study" : ""}</div><div class="d">${esc(pr.summary || pr.desc)}</div>${href ? `<div class="d" style="margin-top:6px"><a href="${href}">cat projects/${esc(href.replace(/^projects\//, ""))}</a></div>` : `${pr.cover ? `<img src="${pr.cover}" alt="${esc(pr.name)}" style="max-width:100%;border:1px solid ${green}33;border-radius:6px;margin:8px 0">` : ""}${["role","timeline","tools"].filter((k)=>pr[k]).map((k)=>`<div class="d">${k}: ${esc(pr[k])}</div>`).join("")}${["problem","process","results"].filter((k)=>pr[k]).map((k)=>`<div class="d" style="margin-top:6px"><span style="color:${amber}"># ${k}</span><br>${esc(pr[k])}</div>`).join("")}`}</div>`; }).join("")}` : ""}
${sec.services && (p.services || []).length ? `<div><span class="ps">➜ ~</span> <span class="cmd">./services --list</span></div>${p.services.map((sv) => `<div class="xp"><div class="c">${esc(sv.name)}</div><div class="d">${esc(sv.desc)}</div></div>`).join("")}` : ""}
${sec.testimonials && (p.testimonials || []).length ? `<div><span class="ps">➜ ~</span> <span class="cmd">cat reviews.log</span></div>${p.testimonials.map((t) => `<div class="out">"${esc(t.quote)}" · ${esc(t.who)}</div>`).join("")}` : ""}
${sec.education && (p.education || []).length ? `<div><span class="ps">➜ ~</span> <span class="cmd">cat education.txt</span></div><div class="out">${p.education.map((e) => esc(eduLabel(e))).join("<br>")}</div>` : ""}
${sec.certifications !== false && hasCerts(p) ? `<div><span class="ps">➜ ~</span> <span class="cmd">cat certs.txt</span></div><div class="out">${p.certifications.map((c) => `${esc(c.name)}${[c.issuer, c.year].filter(Boolean).length ? " · " + [c.issuer, c.year].filter(Boolean).map(esc).join(" · ") : ""}${c.url ? ` · <a href="${/^http/.test(c.url) ? esc(c.url) : "https://" + esc(c.url)}" target="_blank" rel="noopener noreferrer">link</a>` : ""}`).join("<br>")}</div>` : ""}
${sec.languages !== false && hasLangObjs(p) ? `<div><span class="ps">➜ ~</span> <span class="cmd">locale -a</span></div><div class="out">${p.languages.map((l) => esc(langLabel(l))).join("<br>")}</div>` : ""}
${sec.contact ? `<div><span class="ps">➜ ~</span> <span class="cmd">contact --now</span> <span class="cur"></span></div>
<div class="out">${p.email ? `mail: <a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : "reach out via the links above"}</div>` : ""}
</main></div>${credit(badge, { fg: green, accent: amber })}</body></html>`;
}

// standalone case-study page in the Terminal skin
export function terminalCase(p, pal, pr, nav, ctx = {}) {
  const badge = ctx.badge;
  const [bg, green, amber, dim] = pal.vars;
  const file = "projects/" + (nav ? nav.slug : slugify(pr.name)) + ".md";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pr.name)} · ${esc(p.name)}</title><meta name="description" content="${esc(pr.summary || pr.desc || pr.name)}">
${caseHead(p, pal, pr, { bg, panel: bg, accent: green, accent2: amber, text: green }, ctx)}
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:${bg};color:${green};font-family:'IBM Plex Mono',monospace;font-size:14px;line-height:1.75;padding:5vh 5vw}
.win{max-width:880px;margin:0 auto;border:1px solid ${green}44;border-radius:10px;overflow:hidden;box-shadow:0 0 60px ${green}18}
.tbar{background:${green}14;padding:10px 16px;display:flex;gap:8px;align-items:center;border-bottom:1px solid ${green}33}
.tbar i{width:11px;height:11px;border-radius:50%;display:inline-block}
.tbar .t{margin-left:10px;font-size:11px;color:${dim};letter-spacing:.08em}
main{padding:28px clamp(16px,4vw,44px) 40px}
.ps{color:${amber}}.cmd{color:#fff}.out{color:${dim};margin:4px 0 22px}
h1{font-size:clamp(1.4rem,4.6vw,2.2rem);color:#fff;font-weight:600;margin:4px 0 6px}
a{color:${amber};text-decoration:none;border-bottom:1px dashed ${amber}88}
.meta{display:flex;gap:26px;flex-wrap:wrap;margin:10px 0 18px;color:${dim}}
.meta b{color:${amber};font-weight:400;margin-right:6px}
.cover{max-width:100%;border:1px solid ${green}33;border-radius:6px;margin:6px 0 20px;display:block}
.blk{margin:0 0 22px}
.blk h2{color:${amber};font-size:14px;font-weight:600;margin-bottom:4px}.blk h2:before{content:"## "}
.blk p{color:${dim}}
.next{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:26px;padding-top:18px;border-top:1px solid ${green}33}
</style></head><body>
<div class="win"><div class="tbar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span class="t">${esc(file)}</span></div>
<main>
<div><span class="ps">➜ ~</span> <span class="cmd">cat ${esc(file)}</span></div>
<h1># ${esc(pr.name)}</h1>
${pr.summary || pr.desc ? `<div class="out">${esc(pr.summary || pr.desc)}</div>` : ""}
${["role","timeline","tools"].filter((k)=>pr[k]).length ? `<div class="meta">${["role","timeline","tools"].filter((k)=>pr[k]).map((k)=>`<span><b>${k}:</b>${esc(pr[k])}</span>`).join("")}</div>` : ""}
${pr.cover ? `<img class="cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}
${["problem", "process", "results"].filter((k) => pr[k]).map((k) => `<div class="blk"><h2>${k === "problem" ? "problem" : k === "process" ? "process" : "results"}</h2><p>${esc(pr[k])}</p></div>`).join("")}
<div class="next"><a href="../index.html">← Back to the film</a>${nav && nav.next ? `<a href="${esc(nav.next.slug)}.html">next: ${esc(nav.next.pr.name)} →</a>` : ""}</div>
</main></div>${credit(badge, { fg: green, accent: amber })}</body></html>`;
}

/* ================================================================
   TEMPLATE 04 · THE GALLERY (luminous fine-photography)
================================================================ */
