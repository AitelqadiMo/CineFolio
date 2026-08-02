// The room family. For interior designers, whose subject is a SPACE and whose
// audience is a prospective client imagining themselves inside it, not an employer
// assessing technique. That is the whole reason this is not the gallery family:
// gallery is a photographer's exhibition wall, a curated sequence at controlled
// scale, where the composition is the work. Here the room is the work, so a project
// is entered through a full-bleed threshold and the caption follows underneath the
// way a shelter magazine sets a caption under its photograph. Chrome gets out of
// the way; the imagery carries the page.
import { esc, indexHead, caseHead, initialsAvatar, linkRow, credit, normExperience, hasCerts, hasLangObjs, eduLabel, langLabel, isCaseStudy, metaRow, noHref, metricsBlocks, projectLinks, hasMetrics } from "../shared.js";

export function room(p, pal, sec, ctx = {}) {
  const badge = ctx.badge;
  const [substrate, ink, umber, mist, rule] = pal.vars;
  const caseHref = ctx.caseHref || noHref;
  const projects = p.projects || [];
  // The opening image sets atmosphere before a single word. A designer's first
  // cover is their strongest room, so it leads. Falls back to the headshot, and if
  // there is no imagery at all the threshold is omitted rather than left as an
  // empty band, because an empty hero on a design portfolio reads as broken.
  const opener = projects.find((pr) => pr.cover)?.cover || p.photo || "";

  return `<!DOCTYPE html><html lang="en"><head>
${indexHead(p, pal, { bg: substrate, panel: mist, accent: umber, accent2: umber, text: ink })}
<link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:${substrate};color:${ink};font-family:'Jost',sans-serif;font-weight:300;line-height:1.75;-webkit-font-smoothing:antialiased}
img{display:block;width:100%;height:auto}
a{color:inherit}
.wrap{max-width:1180px;margin:0 auto;padding:0 6vw}
.thresh{width:100%;height:78vh;overflow:hidden;background:${mist}}
.thresh img{width:100%;height:100%;object-fit:cover}
.plate{padding:9vh 0 2vh}
h1{font-family:'Libre Baskerville',serif;font-weight:400;font-size:clamp(2.1rem,4.6vw,3.4rem);line-height:1.15;letter-spacing:-.01em}
.role{font-size:.74rem;letter-spacing:.3em;text-transform:uppercase;color:${umber};margin-top:20px;font-weight:400}
.phil{font-family:'Libre Baskerville',serif;font-style:italic;font-size:clamp(1.15rem,2.1vw,1.5rem);line-height:1.62;max-width:36em;margin:7vh 0;color:${ink}}
.rule{height:1px;background:${rule};margin:8vh 0;border:0}
.lbl{font-size:.68rem;letter-spacing:.32em;text-transform:uppercase;color:${umber};margin-bottom:34px;font-weight:500}
/* Each project is a place: image at full bleed, caption plate beneath. Deliberately
   unhurried spacing so scrolling feels considered rather than fast. */
.space{margin:0 0 12vh}
.space .img{width:100%;aspect-ratio:3/2;overflow:hidden;background:${mist}}
.space .img img{width:100%;height:100%;object-fit:cover}
.space .cap{padding:34px 0 0;max-width:44em}
.space h2{font-family:'Libre Baskerville',serif;font-weight:400;font-size:clamp(1.35rem,2.5vw,1.9rem);line-height:1.25}
.space .one{margin-top:12px;color:${ink};opacity:.72;font-size:1.02rem}
.space .nar{margin-top:26px}
.space .nar p{margin-bottom:14px;max-width:40em}
.space .nar b{display:block;font-family:'Jost',sans-serif;font-size:.66rem;letter-spacing:.3em;text-transform:uppercase;color:${umber};margin-bottom:5px;font-weight:500}
.space .more{display:inline-block;margin-top:24px;font-size:.7rem;letter-spacing:.26em;text-transform:uppercase;color:${umber};text-decoration:none;border-bottom:1px solid ${umber}66;padding-bottom:3px}
.quote{font-family:'Libre Baskerville',serif;font-style:italic;font-size:1.08rem;line-height:1.6;margin-top:26px;padding-left:22px;border-left:2px solid ${umber};max-width:34em}
.quote span{display:block;font-family:'Jost',sans-serif;font-style:normal;font-size:.68rem;letter-spacing:.22em;text-transform:uppercase;color:${umber};margin-top:12px}
.tworow{display:grid;grid-template-columns:1fr;gap:2px}
.ent{padding:22px 0;border-top:1px solid ${rule}}
.ent .per{font-size:.68rem;letter-spacing:.24em;text-transform:uppercase;color:${umber}}
.ent h3{font-family:'Libre Baskerville',serif;font-weight:400;font-size:1.08rem;margin-top:6px}
.ent .org{opacity:.68;font-size:.95rem}
.ent ul{margin:12px 0 0 18px}
.ent li{margin-bottom:5px;opacity:.78;font-size:.96rem}
.inline{opacity:.78;max-width:40em}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:26px 40px}
.mini b{display:block;font-family:'Libre Baskerville',serif;font-weight:400;font-size:1.02rem}
.mini span{font-size:.86rem;opacity:.66}
.avatar{width:96px;height:96px;border-radius:50%;overflow:hidden;background:${mist};margin-bottom:26px}
.links{margin-top:34px;display:flex;gap:24px;flex-wrap:wrap}
.links a{font-size:.7rem;letter-spacing:.2em;text-transform:uppercase;color:${umber};text-decoration:none;border-bottom:1px solid ${umber}55;padding-bottom:2px}
footer{padding:12vh 0 9vh;border-top:1px solid ${rule};margin-top:6vh}
footer p{font-family:'Libre Baskerville',serif;font-style:italic;font-size:1.15rem;max-width:28em}
${hasMetrics(projects) ? `.rmet{display:flex;gap:34px;flex-wrap:wrap;margin-top:28px;padding-top:22px;border-top:1px solid ${rule}}
.rmet div{display:flex;flex-direction:column;gap:4px}
.rmet div span:first-child{font-family:'Libre Baskerville',serif;font-size:1.7rem;color:${umber};line-height:1}
.rmet div span:last-child{font-size:.66rem;letter-spacing:.2em;text-transform:uppercase;opacity:.6}
` : ""}@media (max-width:720px){.thresh{height:52vh}.space .img{aspect-ratio:4/3}}
@media (prefers-reduced-motion:no-preference){.space,.plate{animation:rise .8s ease both}@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}}
a:focus-visible{outline:2px solid ${umber};outline-offset:3px}
</style></head><body>
${opener ? `<div class="thresh"><img src="${esc(opener)}" alt=""></div>` : ""}
<div class="wrap">
<div class="plate">
${!opener && p.photo ? `<div class="avatar">${initialsAvatar(p.name)}</div>` : ""}
<h1>${esc(p.name)}</h1>
${p.headline ? `<div class="role">${esc(p.headline)}</div>` : ""}
</div>
${(p.story || p.summary) ? `<p class="phil">${esc(p.story || p.summary)}</p>` : ""}
${projects.length ? `<hr class="rule"><div class="lbl">Spaces</div>
${projects.map((pr) => {
  const href = isCaseStudy(pr) ? caseHref(pr) : "";
  return `<article class="space">
${pr.cover ? `<div class="img"><img src="${esc(pr.cover)}" alt="${esc(pr.name)}"></div>` : ""}
<div class="cap">
<h2>${esc(pr.name)}</h2>
${(pr.summary || pr.desc) ? `<div class="one">${esc(pr.summary || pr.desc)}</div>` : ""}
${metaRow(pr, "meta")}
<div class="nar">
${pr.problem ? `<p><b>The brief</b>${esc(pr.problem)}</p>` : ""}
${pr.process ? `<p><b>The approach</b>${esc(pr.process)}</p>` : ""}
${pr.results ? `<p><b>The outcome</b>${esc(pr.results)}</p>` : ""}
</div>
${metricsBlocks(pr, "rmet")}${projectLinks(pr, "plinks")}
${href ? `<a class="more" href="${esc(href)}">See the full project</a>` : ""}
</div></article>`;
}).join("")}` : ""}
${(p.experience || []).length ? `<hr class="rule"><div class="lbl">Practice</div><div class="tworow">
${normExperience(p.experience).map((e) => `<div class="ent">
<div class="per">${esc(e.period || "")}</div><h3>${esc(e.title || e.role || "")}</h3>
${(e.org || e.company) ? `<div class="org">${esc(e.org || e.company)}</div>` : ""}
${(e.points || e.highlights || []).length ? `<ul>${(e.points || e.highlights).map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
</div>`).join("")}</div>` : ""}
${(p.skills || []).length ? `<hr class="rule"><div class="lbl">Disciplines</div><p class="inline">${(p.skills).map((s) => esc(s)).join(" &middot; ")}</p>` : ""}
${(p.education || []).length ? `<hr class="rule"><div class="lbl">Training</div><div class="grid2">
${p.education.map((e) => `<div class="mini"><b>${esc(eduLabel(e))}</b>${e.school ? `<span>${esc(e.school)}</span>` : ""}</div>`).join("")}</div>` : ""}
${hasCerts(p) ? `<hr class="rule"><div class="lbl">Accreditation</div><div class="grid2">
${p.certifications.map((c) => `<div class="mini"><b>${c.url ? `<a href="${esc(c.url)}">${esc(c.name)}</a>` : esc(c.name)}</b>${(c.issuer || c.year) ? `<span>${esc([c.issuer, c.year].filter(Boolean).join(", "))}</span>` : ""}</div>`).join("")}</div>` : ""}
${hasLangObjs(p) ? `<hr class="rule"><div class="lbl">Languages</div><p class="inline">${p.languages.map((l) => esc(langLabel(l))).join(" &middot; ")}</p>` : ""}
<footer>
<p>Let's talk about your space.</p>
<div class="links">${linkRow(p, ink)}</div>
</footer>
</div>${credit(badge, { fg: ink, accent: umber })}</body></html>`;
}

export function roomCase(p, pal, pr, nav, ctx = {}) {
  const badge = ctx.badge;
  const [substrate, ink, umber, mist, rule] = pal.vars;
  const has = Array.isArray(pr.metrics) && pr.metrics.length;

  return `<!DOCTYPE html><html lang="en"><head>
${caseHead(p, pal, pr, { bg: substrate, panel: mist, accent: umber, accent2: umber, text: ink }, ctx)}
<link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:${substrate};color:${ink};font-family:'Jost',sans-serif;font-weight:300;line-height:1.78}
img{display:block;width:100%;height:auto}
a{color:inherit}
.thresh{width:100%;height:72vh;overflow:hidden;background:${mist}}
.thresh img{width:100%;height:100%;object-fit:cover}
.wrap{max-width:760px;margin:0 auto;padding:0 6vw}
.back{display:inline-block;margin:44px 0 0;font-size:.68rem;letter-spacing:.26em;text-transform:uppercase;color:${umber};text-decoration:none}
h1{font-family:'Libre Baskerville',serif;font-weight:400;font-size:clamp(1.9rem,4vw,2.8rem);line-height:1.18;margin-top:26px}
.one{margin-top:16px;font-size:1.1rem;opacity:.74;max-width:34em}
.blk{margin-top:44px}
.blk b{display:block;font-size:.66rem;letter-spacing:.3em;text-transform:uppercase;color:${umber};margin-bottom:9px;font-weight:500}
.blk p{max-width:36em}
.quote{font-family:'Libre Baskerville',serif;font-style:italic;font-size:1.08rem;line-height:1.6;margin-top:44px;padding-left:22px;border-left:2px solid ${umber};max-width:34em}
.quote span{display:block;font-family:'Jost',sans-serif;font-style:normal;font-size:.68rem;letter-spacing:.22em;text-transform:uppercase;color:${umber};margin-top:12px}
.next{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;margin:9vh 0 7vh;padding-top:26px;border-top:1px solid ${rule}}
.next a{font-size:.7rem;letter-spacing:.22em;text-transform:uppercase;color:${umber};text-decoration:none}
${has ? `.rmet{display:flex;gap:34px;flex-wrap:wrap;margin-top:44px;padding-top:24px;border-top:1px solid ${rule}}
.rmet div{display:flex;flex-direction:column;gap:4px}
.rmet div span:first-child{font-family:'Libre Baskerville',serif;font-size:1.8rem;color:${umber};line-height:1}
.rmet div span:last-child{font-size:.66rem;letter-spacing:.2em;text-transform:uppercase;opacity:.6}
` : ""}@media (max-width:720px){.thresh{height:48vh}}
a:focus-visible{outline:2px solid ${umber};outline-offset:3px}
</style></head><body>
${pr.cover ? `<div class="thresh"><img src="${esc(pr.cover)}" alt="${esc(pr.name)}"></div>` : ""}
<div class="wrap">
<a class="back" href="../index.html">Back to all spaces</a>
<h1>${esc(pr.name)}</h1>
${(pr.summary || pr.desc) ? `<div class="one">${esc(pr.summary || pr.desc)}</div>` : ""}
${metaRow(pr, "meta")}
${pr.problem ? `<div class="blk"><b>The brief</b><p>${esc(pr.problem)}</p></div>` : ""}
${pr.process ? `<div class="blk"><b>The approach</b><p>${esc(pr.process)}</p></div>` : ""}
${pr.results ? `<div class="blk"><b>The outcome</b><p>${esc(pr.results)}</p></div>` : ""}
${metricsBlocks(pr, "rmet")}${projectLinks(pr, "plinks")}
${nav ? `<div class="next"><a href="../index.html">All spaces</a>${nav.next ? `<a href="${esc(nav.next.slug)}.html">Next: ${esc(nav.next.pr.name)}</a>` : ""}</div>` : ""}
</div>${credit(badge, { fg: ink, accent: umber })}</body></html>`;
}

// Three stocks with a real range rather than three warm creams: a bright plastered
// wall, a dark evening interior, and an aged linen. Vars are
// [substrate, ink, umber, mist, rule].
export const roomPalettes = [
  { id: "plaster", label: "Plaster", vars: ["#FBF9F5", "#1C1A17", "#A8643C", "#EDE7DE", "#DDD5C9"] },
  { id: "evening", label: "Evening", vars: ["#14120F", "#F0EAE0", "#C79A5B", "#221E19", "#302A23"] },
  { id: "linen", label: "Linen", vars: ["#F2EDE4", "#26221C", "#7C6A52", "#E4DCCE", "#D2C8B6"] },
];
