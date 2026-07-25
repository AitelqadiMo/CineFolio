// The bento family. Moved verbatim out of engine.js so each family can be
// edited without contending on one module. Behaviour is unchanged.
import { esc, indexHead, caseHead, cap, initialsAvatar, linkRow, credit, normExperience, hasCerts, hasLangObjs, eduLabel, langLabel, isCaseStudy, noHref, metricsBlocks, METRICS_CAP, hasMetrics } from "../shared.js";

export function bento(p, pal, sec, ctx = {}) {
  const [canvas, tile, accent, ink, muted] = pal.vars;
  const caseHref = ctx.caseHref || noHref;
  const badge = ctx.badge; // undefined -> on by default; false -> owner removed it
  const exp = normExperience(p);
  const hasPhoto = !!p.photo;
  const photo = p.photo || initialsAvatar(p.name, accent, canvas);
  const csProjects = p.projects.filter(isCaseStudy);
  const plainProjects = p.projects.filter((pr) => !isCaseStudy(pr));
  const links = p.links || {};
  const linkTiles = [];
  if (links.github) linkTiles.push(["GitHub", "https://" + links.github.replace(/^https?:\/\//, "")]);
  if (links.linkedin) linkTiles.push(["LinkedIn", "https://" + links.linkedin.replace(/^https?:\/\//, "")]);
  if (links.website) linkTiles.push(["Website", /^http/.test(links.website) ? links.website : "https://" + links.website]);
  if (p.email) linkTiles.push(["Email", "mailto:" + p.email]);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} · ${esc(p.headline)}</title><meta name="description" content="${esc(p.summary || p.headline)}">
${indexHead(p, pal, { bg: canvas, panel: tile, accent, accent2: muted, text: ink })}
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}
body{background:${canvas};color:${ink};font-family:Inter,sans-serif;line-height:1.55;padding:5vh 5vw 3vh}
h1,h2,h3,.dsp{font-family:'Space Grotesk',sans-serif}
.cap{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:${muted}}
a{color:${accent}}
.grid{max-width:1080px;margin:0 auto;display:grid;grid-template-columns:repeat(6,1fr);gap:16px;grid-auto-flow:dense}
.t{background:${tile};border-radius:20px;padding:26px;box-shadow:0 1px 2px rgba(0,0,0,.06),0 8px 24px rgba(0,0,0,.05);transition:transform .28s cubic-bezier(.22,1,.36,1),box-shadow .28s;position:relative;overflow:hidden}
.t.lift:hover{transform:translateY(-6px);box-shadow:0 2px 4px rgba(0,0,0,.08),0 16px 40px rgba(0,0,0,.1)}
@media(prefers-reduced-motion:reduce){.t{transition:none}.t.lift:hover{transform:none}}
a.t{text-decoration:none;color:inherit;display:block}
a.t:focus-visible,a:focus-visible{outline:2px solid ${accent};outline-offset:3px}
.span2{grid-column:span 2}.span3{grid-column:span 3}.span4{grid-column:span 4}.span6{grid-column:span 6}
.rowspan2{grid-row:span 2}
.identity{display:flex;flex-direction:column;justify-content:center;gap:16px;background:linear-gradient(140deg,${tile},${accent}22)}
.identity img{width:82px;height:82px;border-radius:22px;object-fit:cover}
.identity h1{font-size:clamp(1.8rem,4vw,2.8rem);font-weight:700;line-height:1.02;letter-spacing:-.02em}
.identity .hl{font-size:1.05rem;color:${muted}}
.stat .n{font-family:'Space Grotesk',sans-serif;font-size:2.6rem;font-weight:700;color:${accent};line-height:1}
.stat .l{margin-top:6px}
.tile-h{font-size:1.15rem;font-weight:600;margin-bottom:12px}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chips span{font-size:11px;letter-spacing:.06em;padding:7px 12px;border-radius:99px;background:${accent}1f;color:${ink}}
.proj{min-height:200px;display:flex;flex-direction:column;justify-content:flex-end}
.proj.cover{color:#fff}
.proj.cover:before{content:"";position:absolute;inset:0;background-size:cover;background-position:center;z-index:0}
.proj.cover:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.72));z-index:1}
.proj .inner{position:relative;z-index:2}
.proj h3{font-size:1.35rem;font-weight:700;letter-spacing:-.01em}
.proj p{font-size:.95rem;margin-top:6px;opacity:.9}
.proj .tag{display:inline-block;margin-bottom:10px;font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;opacity:.85}
.xp{padding:16px 0;border-bottom:1px solid ${ink}14}
.xp:last-child{border-bottom:0}
.xp .per{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:${muted}}
.xp h3{font-size:1.1rem;font-weight:600;margin:4px 0 2px}
.xp .org{color:${accent};font-size:.9rem;margin-bottom:8px}
.xp li{margin:0 0 6px 18px;font-size:.92rem;color:${ink}cc}
.link .tile-h{margin-bottom:4px}.link .go{color:${accent};font-size:.9rem}
.mini{font-size:.95rem;color:${ink}cc}.mini b{color:${ink}}
footer{max-width:1080px;margin:18px auto 0;text-align:center}
@media(max-width:820px){.grid{grid-template-columns:repeat(2,1fr)}.span3,.span4,.span6{grid-column:span 2}.rowspan2{grid-row:auto}}
@media(max-width:520px){.grid{grid-template-columns:1fr}.span2,.span3,.span4,.span6{grid-column:span 1}}
</style></head><body>
<div class="grid">
<div class="t span4 rowspan2 identity">${hasPhoto ? `<img src="${photo}" alt="${esc(p.name)}">` : ""}<h1>${esc(p.name)}</h1><div class="hl">${esc(p.headline)}</div></div>
${sec.skills && p.skills.length ? `<div class="t span2"><div class="cap">Stat</div><div class="stat" style="margin-top:8px"><div class="n">${p.skills.length}</div><div class="l cap">Skills</div></div></div>` : `<div class="t span2"><div class="cap">Profile</div><div class="stat" style="margin-top:8px"><div class="n">${p.projects.length}</div><div class="l cap">Projects</div></div></div>`}
${sec.skills && p.skills.length ? `<div class="t span2"><div class="tile-h">Skills</div><div class="chips">${p.skills.map((s) => `<span>${esc(s)}</span>`).join("")}</div></div>` : ""}
${sec.about && p.summary ? `<div class="t span4"><div class="cap">About</div><p class="mini" style="margin-top:10px;font-size:1.05rem">${esc(p.summary)}</p></div>` : ""}
${sec.projects && csProjects.map((pr) => { const href = caseHref(pr); const inner = `<div class="inner">${isCaseStudy(pr) ? `<span class="tag">Case study</span>` : ""}<h3>${esc(pr.name)}</h3>${pr.summary || pr.desc ? `<p>${esc(pr.summary || pr.desc)}</p>` : ""}</div>`;
  const cls = "t span3 proj lift" + (pr.cover ? " cover" : "");
  const style = pr.cover ? ` style="background-color:${accent}"` : "";
  const bgdiv = pr.cover ? `<div style="position:absolute;inset:0;background-image:url('${pr.cover}');background-size:cover;background-position:center;z-index:0"></div>` : "";
  // metrics tiles: each metric becomes its own "stat" tile alongside the project tile in the grid
  const metTiles = (Array.isArray(pr.metrics) ? pr.metrics.slice(0, METRICS_CAP) : []).map((m) => { const glyph = { up: "↑", down: "↓" }[m.direction] || ""; return `<div class="t span2 lift"><div class="cap">Outcome</div><div class="stat" style="margin-top:8px"><div class="n" style="font-size:2rem">${esc(m.value)}${glyph ? `<span aria-hidden="true" style="font-size:1.2rem">${glyph}</span>` : ""}</div><div class="l cap" style="margin-top:5px">${esc(m.label || "")}</div></div></div>`; }).join("");
  return (href ? `<a class="${cls}" href="${href}"${style}>${bgdiv}${inner}</a>` : `<div class="${cls}"${style}>${bgdiv}${inner}</div>`) + metTiles; }).join("") || ""}
${sec.projects && plainProjects.map((pr) => `<div class="t span2 lift"><div class="cap">Project</div><div class="tile-h" style="margin-top:8px">${esc(pr.name)}</div><p class="mini">${esc(pr.summary || pr.desc)}</p></div>`).join("") || ""}
${sec.experience && exp.length ? `<div class="t span6"><div class="tile-h">Experience</div>${exp.map((x) => `<div class="xp">${x.period ? `<div class="per">${esc(x.period)}</div>` : ""}<h3>${esc(x.title)}</h3>${x.org ? `<div class="org">${esc(x.org)}</div>` : ""}<ul style="list-style:disc">${x.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul></div>`).join("")}</div>` : ""}
${linkTiles.map(([label, url]) => `<a class="t span2 link lift" href="${esc(url)}"${/^mailto/.test(url) ? "" : ` target="_blank" rel="noopener noreferrer"`}><div class="cap">Link</div><div class="tile-h" style="margin-top:6px">${esc(label)}</div><div class="go">Open</div></a>`).join("")}
${sec.services && (p.services || []).length ? (p.services || []).map((sv) => `<div class="t span2 lift"><div class="cap">Service</div><div class="tile-h" style="margin-top:6px">${esc(sv.name)}</div><p class="mini">${esc(sv.desc)}</p></div>`).join("") : ""}
${sec.testimonials && (p.testimonials || []).length ? (p.testimonials || []).map((t) => `<div class="t span3"><div class="cap">Kind words</div><p class="mini" style="margin-top:10px;font-size:1.05rem">“${esc(t.quote)}”</p><div class="cap" style="margin-top:10px">${esc(t.who)}</div></div>`).join("") : ""}
${sec.certifications !== false && hasCerts(p) ? p.certifications.map((c) => `<div class="t span2"><div class="cap">Certification</div><div class="tile-h" style="margin-top:6px">${esc(c.name)}</div><p class="mini">${[c.issuer, c.year].filter(Boolean).map(esc).join(" · ")}</p>${c.url ? `<div style="margin-top:8px"><a href="${/^http/.test(c.url) ? esc(c.url) : "https://" + esc(c.url)}" target="_blank" rel="noopener noreferrer">Credential</a></div>` : ""}</div>`).join("") : ""}
${sec.education && (p.education || []).length ? `<div class="t span3"><div class="tile-h">Education</div>${p.education.map((e) => `<p class="mini" style="padding:6px 0"><b>${esc(eduLabel(e))}</b></p>`).join("")}</div>` : ""}
${sec.languages !== false && hasLangObjs(p) ? `<div class="t span3"><div class="tile-h">Languages</div><div class="chips">${p.languages.map((l) => `<span>${esc(langLabel(l))}</span>`).join("")}</div></div>` : ""}
${sec.contact ? `<div class="t span6" style="text-align:center;background:linear-gradient(140deg,${tile},${accent}22)"><div class="cap">Get in touch</div><div class="dsp" style="font-size:clamp(1.5rem,4vw,2.4rem);font-weight:700;margin:10px 0 4px">Let's build something.</div><div style="margin-top:8px">${linkRow(p, ink)}</div></div>` : ""}
</div>
${credit(badge, { fg: ink, accent })}</body></html>`;
}

// standalone case-study page in the Bento skin
export function bentoCase(p, pal, pr, nav, ctx = {}) {
  const badge = ctx.badge;
  const [canvas, tile, accent, ink, muted] = pal.vars;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pr.name)} · ${esc(p.name)}</title><meta name="description" content="${esc(pr.summary || pr.desc || pr.name)}">
${caseHead(p, pal, pr, { bg: canvas, panel: tile, accent, accent2: muted, text: ink }, ctx)}
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}
body{background:${canvas};color:${ink};font-family:Inter,sans-serif;line-height:1.6;padding:5vh 5vw}
h1,h2,h3{font-family:'Space Grotesk',sans-serif}
.cap{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:${muted}}
a{color:${accent}}
a:focus-visible{outline:2px solid ${accent};outline-offset:3px}
.shell{max-width:900px;margin:0 auto}
.back{display:inline-block;margin-bottom:16px;font-size:11px;letter-spacing:.14em;color:${accent};text-decoration:none}
.card{background:${tile};border-radius:24px;padding:clamp(22px,4vw,48px);box-shadow:0 1px 2px rgba(0,0,0,.06),0 12px 40px rgba(0,0,0,.07)}
h1{font-size:clamp(2rem,6vw,3.6rem);font-weight:700;letter-spacing:-.02em;line-height:1.03}
.sum{font-size:1.15rem;color:${ink}cc;max-width:60ch;margin-top:14px}
.chiprow{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}
.chiprow span{font-size:11px;letter-spacing:.06em;padding:8px 14px;border-radius:99px;background:${accent}1f;color:${ink}}
.chiprow span b{color:${accent};font-weight:600;margin-right:5px}
.cover{width:100%;border-radius:18px;aspect-ratio:16/9;object-fit:cover;margin:26px 0 8px;display:block;background:${canvas}}
.blk{background:${canvas};border-radius:18px;padding:24px;margin-top:16px}
.blk h2{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:${accent};margin-bottom:10px}
.blk p{font-size:1.08rem;color:${ink}}
.next{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:26px}
.pill{padding:12px 20px;border-radius:99px;background:${tile};color:${accent};text-decoration:none;font-size:12px;letter-spacing:.08em;box-shadow:0 6px 18px rgba(0,0,0,.06)}
${Array.isArray(pr.metrics) && pr.metrics.length ? `.metgrid{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px}
.metgrid div{flex:1;min-width:100px;background:${accent}10;border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:5px}
.metgrid div span:first-child{font-family:'Space Grotesk',sans-serif;font-size:2rem;font-weight:700;color:${accent};line-height:1}
.metgrid div span:last-child{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:${muted}}
\n` : ""}</style></head><body>
<div class="shell">
<a class="back" href="../index.html">Back to the grid</a>
<div class="card">
<div class="cap">Case study</div>
<h1 style="margin-top:10px">${esc(pr.name)}</h1>
${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}
${["role", "timeline", "tools"].filter((k) => pr[k]).length ? `<div class="chiprow">${["role", "timeline", "tools"].filter((k) => pr[k]).map((k) => `<span><b>${k.toUpperCase()}</b>${esc(pr[k])}</span>`).join("")}</div>` : ""}
${metricsBlocks(pr, "metgrid")}${pr.cover ? `<img class="cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}
${["problem", "process", "results"].filter((k) => pr[k]).map((k) => `<div class="blk"><h2>${k === "problem" ? "The problem" : k === "process" ? "The process" : "The results"}</h2><p>${esc(pr[k])}</p></div>`).join("")}
</div>
<div class="next"><a class="pill" href="../index.html">All projects</a>${nav && nav.next ? `<a class="pill" href="${esc(nav.next.slug)}.html">Next: ${esc(nav.next.pr.name)}</a>` : ""}</div>
</div>${credit(badge, { fg: ink, accent })}</body></html>`;
}

// ---------- registry ----------
