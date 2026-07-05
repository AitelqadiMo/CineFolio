// engine.js — CineFolio's deterministic portfolio engine. No LLM anywhere:
// a parsed profile + a hand-built template + a palette = a finished site, in
// milliseconds, every time. The AI film pipeline is the premium layer ABOVE this.
// Compiled client-side for instant preview; published through the normal
// immutable-release pipeline, so the server never needs to run this code.

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const SKILL_BANK = ["aws","azure","gcp","kubernetes","docker","terraform","terragrunt","ansible","jenkins","github actions","gitlab","ci/cd","python","javascript","typescript","react","node","java","go","rust","sql","figma","photoshop","illustrator","after effects","premiere","blender","ui","ux","product design","branding","marketing","seo","sales","copywriting","analytics","excel","notion","prometheus","grafana","linux","agile","scrum","machine learning","ai","data","mongodb","postgres","redis","graphql","next.js","vue","angular","swift","kotlin","flutter","devops","sre","security","photography","film","editing","helm","spark","tableau","salesforce"];

const SECTION_RE = /^(experience|work experience|employment|professional experience|education|skills|technical skills|projects|selected projects|languages|certifications?|awards|summary|profile|about)\s*:?\s*$/i;
const PERIOD_RE = /((19|20)\d{2})\s*(?:[-–—]|to)\s*((19|20)\d{2}|present|now|current|ongoing)/i;

// ---------- resume text -> structured profile ----------
export function parseProfile(text, overrides = {}) {
  const raw = String(text || "").slice(0, 20000);
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const lower = raw.toLowerCase();

  const email = overrides.email || (raw.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/) || [""])[0];
  const phone = (raw.match(/(\+?\d[\d ().-]{7,}\d)/) || [""])[0].trim();
  const links = {
    github: (raw.match(/github\.com\/[\w.-]+/i) || [""])[0],
    linkedin: (raw.match(/linkedin\.com\/in\/[\w.-]+/i) || [""])[0],
    // NOTE: no lookbehind — Safari < 16.4 throws SyntaxError at parse time and
    // takes the whole bundle down. Group-match with a leading boundary instead.
    website: (raw.match(/\bhttps?:\/\/(?!\S*(github|linkedin))[\w.-]+\.[a-z]{2,}\S*/i) || [""])[0] ||
             ((raw.match(/(^|[\s|,;(])([\w-]+\.(dev|me|site|design|studio))\b/im) || [])[2] || ""),
  };

  // sectionize
  const sections = { _head: [] };
  let cur = "_head";
  for (const l of lines) {
    const m = l.match(SECTION_RE);
    if (m) {
      const k = m[1].toLowerCase();
      cur = /experience|work|employment/.test(k) ? "experience"
        : /education/.test(k) ? "education"
        : /skill/.test(k) ? "skills"
        : /project/.test(k) ? "projects"
        : /language/.test(k) ? "languages"
        : /certif|award/.test(k) ? "certs"
        : /summary|profile|about/.test(k) ? "summary" : cur;
      sections[cur] = sections[cur] || [];
      continue;
    }
    (sections[cur] = sections[cur] || []).push(l);
  }

  const head = sections._head;
  const notNamey = (l) => /@|http|\d{4}|\+\d|linkedin|github/i.test(l) || l.length > 48;
  const name = overrides.name || head.find((l) => !notNamey(l)) || "Your Name";
  const headline = overrides.headline ||
    head.filter((l) => !notNamey(l) && l !== name)[0] ||
    (sections.summary || [])[0]?.slice(0, 90) || "Professional";

  // skills: explicit section + bank scan
  const sectionSkills = (sections.skills || []).join(" ").split(/[,•|·/]+/).map((s) => s.trim().replace(/^[-–—:]\s*/, "")).filter((s) => s && s.length < 28 && !/^skills?$/i.test(s));
  const bankSkills = SKILL_BANK.filter((s) => lower.includes(s));
  const skills = [...new Set([...sectionSkills, ...bankSkills.map(cap)])].slice(0, 14);

  // experience entries
  const experience = [];
  let entry = null;
  for (const l of sections.experience || sections._head || []) {
    const pm = l.match(PERIOD_RE);
    if (pm) {
      if (entry) experience.push(entry);
      const rest = l.replace(PERIOD_RE, "").replace(/^[\s,|·@-]+|[\s,|·-]+$/g, "");
      entry = { period: pm[0].replace(/\s+/g, " "), title: rest.slice(0, 90) || "Role", org: "", points: [] };
      const at = rest.match(/^(.*?)\s+(?:at|@|,|·|\||—|-)\s+(.{2,60})$/i);
      if (at) { entry.title = at[1].trim(); entry.org = at[2].trim(); }
    } else if (entry) {
      const b = l.replace(/^[-•*▪◦→]\s*/, "");
      if (b !== l || (entry.points.length && l.length > 30)) entry.points.push(b.slice(0, 220));
      else if (!entry.org && l.length < 60) entry.org = l;
      if (entry.points.length > 5) entry.points.length = 5;
    }
  }
  if (entry) experience.push(entry);

  const education = (sections.education || []).filter((l) => l.length > 6).slice(0, 3).map((l) => l.slice(0, 120));
  const projects = [];
  let proj = null;
  for (const l of sections.projects || []) {
    const b = l.replace(/^[-•*▪]\s*/, "");
    if (b === l && l.length < 60 && !proj?.desc) { if (proj) projects.push(proj); proj = { name: l.slice(0, 60), desc: "" }; }
    else if (proj) proj.desc = (proj.desc ? proj.desc + " " : "") + b.slice(0, 180);
    else { proj = { name: b.slice(0, 60), desc: "" }; }
  }
  if (proj) projects.push(proj);
  const languages = (sections.languages || []).join(", ").split(/[,•|·]+/).map((s) => s.trim()).filter(Boolean).slice(0, 6);
  const summary = overrides.summary || (sections.summary || []).join(" ").slice(0, 420);

  return {
    name, headline, email, phone, links, summary,
    skills, experience: experience.slice(0, 5), education, projects: projects.slice(0, 4), languages,
    photo: overrides.photo || null,
    ...overrides,
  };
}

function cap(s) { return s.length <= 3 ? s.toUpperCase() : s[0].toUpperCase() + s.slice(1); }

const initialsAvatar = (name, bg, fg) => {
  const ini = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "CF";
  return "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="${bg}"/><text x="60" y="76" font-family="Georgia,serif" font-size="46" fill="${fg}" text-anchor="middle" font-weight="bold">${ini}</text></svg>`
  );
};
const linkRow = (p, color) => {
  const L = [];
  if (p.links.github) L.push(`<a href="https://${p.links.github.replace(/^https?:\/\//, "")}" target="_blank" rel="noopener noreferrer">GitHub</a>`);
  if (p.links.linkedin) L.push(`<a href="https://${p.links.linkedin.replace(/^https?:\/\//, "")}" target="_blank" rel="noopener noreferrer">LinkedIn</a>`);
  if (p.links.website) L.push(`<a href="${/^http/.test(p.links.website) ? p.links.website : "https://" + p.links.website}" target="_blank" rel="noopener noreferrer">Website</a>`);
  if (p.email) L.push(`<a href="mailto:${esc(p.email)}">Email</a>`);
  return L.join(`<span style="opacity:.4;color:${color}"> / </span>`);
};
const CREDIT = `<div style="text-align:center;padding:26px;font-family:monospace;font-size:9px;letter-spacing:.25em;opacity:.45;text-transform:uppercase">Directed with CineFolio Studios</div>`;

// ---------- rich projects / case studies (shared logic, per-template skin) ----------
const isCaseStudy = (pr) => !!(pr.problem || pr.process || pr.results || pr.role || pr.cover);
const metaRow = (pr, cls) => {
  const cells = [["ROLE", pr.role], ["TIMELINE", pr.timeline], ["TOOLS", pr.tools]].filter(([, v]) => v);
  if (!cells.length) return "";
  return `<div class="${cls}">${cells.map(([k, v]) => `<span><b>${k}</b>${esc(v)}</span>`).join("")}</div>`;
};
const csBlocks = (pr, cls) => ["problem", "process", "results"]
  .filter((k) => pr[k])
  .map((k) => `<div class="${cls}"><h4>${k === "problem" ? "The problem" : k === "process" ? "The process" : "The results"}</h4><p>${esc(pr[k])}</p></div>`)
  .join("");

/* ================================================================
   TEMPLATE 01 — THE MONOLITH (cinematic dark)
================================================================ */
function monolith(p, pal, sec) {
  const [bg, panel, accent, accent2, text] = pal.vars;
  const photo = p.photo || initialsAvatar(p.name, panel, accent2);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} — ${esc(p.headline)}</title><meta name="description" content="${esc(p.summary || p.headline)}">
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
</style></head><body>
<header><img class="ph up" src="${photo}" alt="${esc(p.name)}">
<div class="mono up" style="animation-delay:.1s;margin-bottom:14px">FEATURE PRESENTATION</div>
<h1 class="up" style="animation-delay:.18s">${esc(p.name.split(" ")[0])}<br><em>${esc(p.name.split(" ").slice(1).join(" ") || p.headline.split(" ")[0])}</em></h1>
<div class="mono head2 up" style="animation-delay:.3s">${esc(p.headline)}</div>
<div class="links up" style="animation-delay:.4s">${linkRow(p, text)}</div></header>
<div class="marq" aria-hidden="true"><div>${(p.skills.slice(0, 6).map((s) => esc(s.toUpperCase())).join(" ✦ ") + " ✦ ").repeat(3)}</div></div>
${sec.about && p.summary ? `<section><h2>The story</h2><p style="font-size:1.06rem;color:${text}dd;max-width:60ch">${esc(p.summary)}</p></section>` : ""}
${sec.skills && p.skills.length ? `<section><h2>The craft</h2><div class="chips">${p.skills.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div></section>` : ""}
${sec.experience && p.experience.length ? `<section><h2>Selected scenes</h2>${p.experience.map((x) => `<div class="xp"><div class="per">${esc(x.period)}</div><h3>${esc(x.title)}</h3>${x.org ? `<div class="org">${esc(x.org)}</div>` : ""}<ul>${x.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul></div>`).join("")}</section>` : ""}
${sec.projects && p.projects.length ? `<section><h2>Productions</h2>
${p.projects.filter(isCaseStudy).map((pr, i) => `<div class="cs" id="cs${i}">${pr.cover ? `<img class="cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}<div class="body"><h3>${esc(pr.name)}</h3>${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}${metaRow(pr, "csmeta")}${csBlocks(pr, "csb")}</div></div>`).join("")}
${p.projects.filter((pr) => !isCaseStudy(pr)).length ? `<div class="pr">${p.projects.filter((pr) => !isCaseStudy(pr)).map((pr) => `<div class="prc"><b>${esc(pr.name)}</b><p>${esc(pr.summary || pr.desc)}</p></div>`).join("")}</div>` : ""}</section>` : ""}
${sec.services && (p.services || []).length ? `<section><h2>Services</h2><div class="svc">${p.services.map((sv) => `<div><b>${esc(sv.name)}</b><p>${esc(sv.desc)}</p></div>`).join("")}</div></section>` : ""}
${sec.testimonials && (p.testimonials || []).length ? `<section><h2>Word on set</h2>${p.testimonials.map((t) => `<div class="tst"><p>“${esc(t.quote)}”</p><span>— ${esc(t.who)}</span></div>`).join("")}</section>` : ""}
${sec.education && p.education.length ? `<section><h2>Training</h2><ul style="list-style:none">${p.education.map((e) => `<li style="padding:10px 0;border-bottom:1px solid ${text}18">${esc(e)}</li>`).join("")}</ul></section>` : ""}
${sec.contact ? `<footer><div class="mono">CLOSING CREDITS</div><div class="big">Let's make something worth watching.</div><div class="links">${linkRow(p, text)}</div></footer>` : ""}
${CREDIT}</body></html>`;
}

/* ================================================================
   TEMPLATE 02 — THE EDITORIAL (light magazine)
================================================================ */
function editorial(p, pal, sec) {
  const [paper, ink, accent, soft] = pal.vars;
  const photo = p.photo || initialsAvatar(p.name, ink, paper);
  const n = (i) => String(i + 1).padStart(2, "0");
  let ix = 0;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} — ${esc(p.headline)}</title><meta name="description" content="${esc(p.summary || p.headline)}">
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
footer{padding:9vh 0;text-align:center}
footer .big{font-family:'Instrument Serif',serif;font-style:italic;font-size:clamp(1.8rem,4.5vw,3rem)}
.cs2{padding:26px 0;border-top:1px solid ${ink}22}
.cs2 img.cover{width:100%;aspect-ratio:21/9;object-fit:cover;border-radius:2px;margin-bottom:18px}
.cs2 h3{font-family:'Instrument Serif',serif;font-weight:400;font-size:1.6rem}
.cs2 .sum{color:${ink}cc;margin-top:6px;max-width:64ch}
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
@media(max-width:640px){.xp,.pr{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
<header><div class="mono">PORTFOLIO · VOL. I — ${new Date().getFullYear()}</div>
<div class="masth" style="margin-top:22px"><h1>${esc(p.name.split(" ")[0])} <i>${esc(p.name.split(" ").slice(1).join(" "))}</i></h1><img class="ph" src="${photo}" alt="${esc(p.name)}"></div>
<div class="headrow"><div style="font-weight:600">${esc(p.headline)}</div><div class="mono links">${linkRow(p, ink)}</div></div></header>
${sec.about && p.summary ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>In brief</h2></div><p class="lede">${esc(p.summary)}</p></section>` : ""}
${sec.experience && p.experience.length ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>Experience</h2></div>
${p.experience.map((x) => `<div class="xp"><div class="per">${esc(x.period)}</div><div><h3>${esc(x.title)}</h3>${x.org ? `<div class="org">${esc(x.org)}</div>` : ""}<ul>${x.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul></div></div>`).join("")}</section>` : ""}
${sec.skills && p.skills.length ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>Capabilities</h2></div><div class="chips">${p.skills.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div></section>` : ""}
${sec.projects && p.projects.length ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>Selected work</h2></div>
${p.projects.filter(isCaseStudy).map((pr) => `<div class="cs2">${pr.cover ? `<img class="cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}<h3>${esc(pr.name)}</h3>${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}${metaRow(pr, "csmeta2")}${csBlocks(pr, "csb2")}</div>`).join("")}
${p.projects.filter((pr) => !isCaseStudy(pr)).map((pr) => `<div class="pr"><b>${esc(pr.name)}</b><p>${esc(pr.summary || pr.desc)}</p></div>`).join("")}</section>` : ""}
${sec.services && (p.services || []).length ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>Services</h2></div><div class="svc2">${p.services.map((sv) => `<div><b>${esc(sv.name)}</b><p>${esc(sv.desc)}</p></div>`).join("")}</section>` : ""}
${sec.testimonials && (p.testimonials || []).length ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>Kind words</h2></div>${p.testimonials.map((t) => `<div class="tst2"><p>“${esc(t.quote)}”</p><span>— ${esc(t.who)}</span></div>`).join("")}</section>` : ""}
${sec.education && p.education.length ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>Education</h2></div>${p.education.map((e) => `<p style="padding:6px 0">${esc(e)}</p>`).join("")}</section>` : ""}
${sec.contact ? `<footer><div class="mono">CORRESPONDENCE</div><div class="big">Start the conversation.</div><div class="mono links" style="margin-top:16px">${linkRow(p, ink)}</div></footer>` : ""}
</div>${CREDIT}</body></html>`;
}

/* ================================================================
   TEMPLATE 03 — THE TERMINAL (engineer's console)
================================================================ */
function terminal(p, pal, sec) {
  const [bg, green, amber, dim] = pal.vars;
  const bar = (i) => { const f = 9 - (i % 4); return "█".repeat(f) + "░".repeat(10 - f); };
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} — ${esc(p.headline)}</title><meta name="description" content="${esc(p.summary || p.headline)}">
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
<div class="win"><div class="tbar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span class="t">${esc(p.name.toLowerCase().replace(/\s+/g, "-"))} — portfolio.sh</span></div>
<main>
<div><span class="ps">➜ ~</span> <span class="cmd">whoami</span></div>
<h1>${esc(p.name)}</h1>
<div class="out">${esc(p.headline)}${p.phone ? " · " + esc(p.phone) : ""}<br>${linkRow(p, dim)}</div>
${sec.about && p.summary ? `<div><span class="ps">➜ ~</span> <span class="cmd">cat README.md</span></div><div class="out">${esc(p.summary)}</div>` : ""}
${sec.skills && p.skills.length ? `<div><span class="ps">➜ ~</span> <span class="cmd">./skills --graph</span></div>
<div class="grid">${p.skills.map((s, i) => `<span class="sk"><b>${esc(s.toLowerCase().padEnd(2))}</b> ${bar(i)}</span>`).join("")}</div>` : ""}
${sec.experience && p.experience.length ? `<div><span class="ps">➜ ~</span> <span class="cmd">git log --career</span></div>
${p.experience.map((x) => `<div class="xp"><div class="c">* ${esc(x.title)}${x.org ? ` @ ${esc(x.org)}` : ""}</div><div class="d">${esc(x.period)}</div><ul>${x.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul></div>`).join("")}` : ""}
${sec.projects && p.projects.length ? `<div><span class="ps">➜ ~</span> <span class="cmd">ls projects/</span></div>${p.projects.map((pr) => `<div class="xp"><div class="c">${esc(pr.name)}/${isCaseStudy(pr) ? " — case study" : ""}</div><div class="d">${esc(pr.summary || pr.desc)}</div>${pr.cover ? `<img src="${pr.cover}" alt="${esc(pr.name)}" style="max-width:100%;border:1px solid ${green}33;border-radius:6px;margin:8px 0">` : ""}${["role","timeline","tools"].filter((k)=>pr[k]).map((k)=>`<div class="d">${k}: ${esc(pr[k])}</div>`).join("")}${["problem","process","results"].filter((k)=>pr[k]).map((k)=>`<div class="d" style="margin-top:6px"><span style="color:${amber}"># ${k}</span><br>${esc(pr[k])}</div>`).join("")}</div>`).join("")}` : ""}
${sec.services && (p.services || []).length ? `<div><span class="ps">➜ ~</span> <span class="cmd">./services --list</span></div>${p.services.map((sv) => `<div class="xp"><div class="c">${esc(sv.name)}</div><div class="d">${esc(sv.desc)}</div></div>`).join("")}` : ""}
${sec.testimonials && (p.testimonials || []).length ? `<div><span class="ps">➜ ~</span> <span class="cmd">cat reviews.log</span></div>${p.testimonials.map((t) => `<div class="out">"${esc(t.quote)}" — ${esc(t.who)}</div>`).join("")}` : ""}
${sec.education && p.education.length ? `<div><span class="ps">➜ ~</span> <span class="cmd">cat education.txt</span></div><div class="out">${p.education.map(esc).join("<br>")}</div>` : ""}
${sec.contact ? `<div><span class="ps">➜ ~</span> <span class="cmd">contact --now</span> <span class="cur"></span></div>
<div class="out">${p.email ? `mail: <a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : "reach out via the links above"}</div>` : ""}
</main></div>${CREDIT}</body></html>`;
}

// ---------- registry ----------
export const TEMPLATES = [
  {
    id: "monolith", name: "The Monolith", blurb: "Cinematic dark. Kinetic type, marquee, timeline scenes.",
    compile: monolith,
    palettes: [
      { id: "jersey", label: "Jersey", vars: ["#0E1C3F", "#132550", "#C8102E", "#D9A441", "#F4EFE6"] },
      { id: "lavender", label: "Lavender", vars: ["#141126", "#1D1837", "#8B5CF6", "#C4B5FD", "#EFEAFF"] },
      { id: "ember", label: "Ember", vars: ["#160D0B", "#241410", "#E8442E", "#F0A860", "#F5E9DC"] },
    ],
  },
  {
    id: "editorial", name: "The Editorial", blurb: "Light magazine. Serif mastheads, ruled sections, recruiter-calm.",
    compile: editorial,
    palettes: [
      { id: "bone", label: "Bone", vars: ["#F4EFE6", "#1A1712", "#C8102E", "#6E655A"] },
      { id: "sage", label: "Sage", vars: ["#EEF1EA", "#1C221A", "#0E9E62", "#5F6B5C"] },
      { id: "slate", label: "Slate", vars: ["#EDF0F4", "#141A24", "#2557D6", "#5A6678"] },
    ],
  },
  {
    id: "terminal", name: "The Terminal", blurb: "Engineer's console. Prompt, skill bars, git-log career.",
    compile: terminal,
    palettes: [
      { id: "phosphor", label: "Phosphor", vars: ["#07100a", "#33ff88", "#ffc857", "#7ea08b"] },
      { id: "amber", label: "Amber CRT", vars: ["#100b04", "#ffb454", "#7fdb8f", "#a08a6a"] },
      { id: "ice", label: "Ice", vars: ["#070d14", "#6fd3ff", "#ffd166", "#7a93a8"] },
    ],
  },
];

export const DEFAULT_SECTIONS = { about: true, skills: true, experience: true, projects: true, education: true, services: false, testimonials: false, contact: true };

export function compile(templateId, paletteId, profile, opts = {}) {
  const t = TEMPLATES.find((x) => x.id === templateId) || TEMPLATES[0];
  const pal = t.palettes.find((x) => x.id === paletteId) || t.palettes[0];
  const sections = { ...DEFAULT_SECTIONS, ...(opts.sections || {}) };
  return t.compile(profile, pal, sections);
}
