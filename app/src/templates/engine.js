// engine.js · CineFolio's deterministic portfolio engine. No LLM anywhere:
// a parsed profile + a hand-built template + a palette = a finished site, in
// milliseconds, every time. The AI film pipeline is the premium layer ABOVE this.
// Compiled client-side for instant preview; published through the normal
// immutable-release pipeline, so the server never needs to run this code.
// compile() emits one self-contained page (inline case-study expanders, used by
// the Studio live preview). compileBundle() emits a multi-page site: an index
// whose case-study cards link out, plus one standalone page per case study.

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const SKILL_BANK = ["aws","azure","gcp","kubernetes","docker","terraform","terragrunt","ansible","jenkins","github actions","gitlab","ci/cd","python","javascript","typescript","react","node","java","go","rust","sql","figma","photoshop","illustrator","after effects","premiere","blender","ui","ux","product design","branding","marketing","seo","sales","copywriting","analytics","excel","notion","prometheus","grafana","linux","agile","scrum","machine learning","ai","data","mongodb","postgres","redis","graphql","next.js","vue","angular","swift","kotlin","flutter","devops","sre","security","photography","film","editing","helm","spark","tableau","salesforce"];

const SECTION_RE = /^(experience|work experience|employment|professional experience|education|skills|technical skills|projects|selected projects|languages|certifications?|awards|summary|profile|about)\s*:?\s*$/i;
const PERIOD_RE = /((19|20)\d{2})\s*(?:[-\u2013\u2014]|to)\s*((19|20)\d{2}|present|now|current|ongoing)/i;

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
    // NOTE: no lookbehind. Safari < 16.4 throws SyntaxError at parse time and
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
  const sectionSkills = (sections.skills || []).join(" ").split(/[,•|·/]+/).map((s) => s.trim().replace(/^[-\u2013\u2014:]\s*/, "")).filter((s) => s && s.length < 28 && !/^skills?$/i.test(s));
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
      const at = rest.match(/^(.*?)\s+(?:at|@|,|·|\||\u2014|-)\s+(.{2,60})$/i);
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
  const links = p.links || {};
  const L = [];
  if (links.github) L.push(`<a href="https://${links.github.replace(/^https?:\/\//, "")}" target="_blank" rel="noopener noreferrer">GitHub</a>`);
  if (links.linkedin) L.push(`<a href="https://${links.linkedin.replace(/^https?:\/\//, "")}" target="_blank" rel="noopener noreferrer">LinkedIn</a>`);
  if (links.website) L.push(`<a href="${/^http/.test(links.website) ? links.website : "https://" + links.website}" target="_blank" rel="noopener noreferrer">Website</a>`);
  if (p.email) L.push(`<a href="mailto:${esc(p.email)}">Email</a>`);
  return L.join(`<span style="opacity:.4;color:${color}"> / </span>`);
};
const CREDIT = `<div style="text-align:center;padding:26px;font-family:monospace;font-size:9px;letter-spacing:.25em;opacity:.55;text-transform:uppercase"><a href="https://cine-folio.vercel.app/?ref=film-badge" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">◈ Cut with CineFolio Studios · Get this look</a></div>`;

// ---------- normalizers: richer optional fields, both new and legacy shapes ----------
// experience may arrive as parsed {period,title,org,points}, structured
// {role,company,start,end,highlights[]}, or legacy expLines strings. Fold every
// form into the internal {period,title,org,points} the templates already draw.
const normExperience = (p) => {
  const src = Array.isArray(p.experience) && p.experience.length ? p.experience
    : Array.isArray(p.expLines) && p.expLines.length ? p.expLines : [];
  return src.map((x) => {
    if (typeof x === "string") return { period: "", title: x, org: "", points: [] };
    if (x && (x.role || x.company || x.start || x.end || Array.isArray(x.highlights))) {
      const period = [x.start, x.end].filter(Boolean).join(" · ");
      return { period, title: x.role || x.title || "Role", org: x.company || x.org || "", points: Array.isArray(x.highlights) ? x.highlights.slice(0, 6) : (x.points || []) };
    }
    return { period: x.period || "", title: x.title || "Role", org: x.org || "", points: Array.isArray(x.points) ? x.points : [] };
  });
};
const hasCerts = (p) => Array.isArray(p.certifications) && p.certifications.length;
const hasEduObjs = (p) => Array.isArray(p.education) && p.education.some((e) => e && typeof e === "object");
const hasLangObjs = (p) => Array.isArray(p.languages) && p.languages.some((l) => l && typeof l === "object");
const eduLabel = (e) => typeof e === "string" ? e : [e.degree, e.school, e.years].filter(Boolean).join(", ");
const langLabel = (l) => typeof l === "string" ? l : [l.name, l.level].filter(Boolean).join(": ");

// ---------- slugs ----------
const slugify = (name, seen) => {
  let base = String(name || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!base) base = "project";
  let slug = base, n = 2;
  while (seen && seen.has(slug)) { slug = base + "-" + n; n++; }
  if (seen) seen.add(slug);
  return slug;
};
// build the ordered list of case-study projects (capped at 12) with stable slugs
const caseStudyList = (projects) => {
  const seen = new Set();
  return (projects || []).filter(isCaseStudy).slice(0, 12).map((pr) => ({ pr, slug: slugify(pr.name, seen) }));
};

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

// caseHref(pr): given a project, return the relative page path when a bundle is
// being built, or "" for the single-page compile() (inline expanders stay).
const noHref = () => "";

/* ================================================================
   TEMPLATE 01 · THE MONOLITH (cinematic dark)
================================================================ */
function monolith(p, pal, sec, ctx = {}) {
  const [bg, panel, accent, accent2, text] = pal.vars;
  const caseHref = ctx.caseHref || noHref;
  const exp = normExperience(p);
  const photo = p.photo || initialsAvatar(p.name, panel, accent2);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} · ${esc(p.headline)}</title><meta name="description" content="${esc(p.summary || p.headline)}">
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
</style></head><body>
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
  : `<div class="cs" id="cs${i}">${pr.cover ? `<img class="cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}<div class="body"><h3>${esc(pr.name)}</h3>${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}${metaRow(pr, "csmeta")}${csBlocks(pr, "csb")}</div></div>`; }).join("")}
${p.projects.filter((pr) => !isCaseStudy(pr)).length ? `<div class="pr">${p.projects.filter((pr) => !isCaseStudy(pr)).map((pr) => `<div class="prc"><b>${esc(pr.name)}</b><p>${esc(pr.summary || pr.desc)}</p></div>`).join("")}</div>` : ""}</section>` : ""}
${sec.services && (p.services || []).length ? `<section><h2>Services</h2><div class="svc">${p.services.map((sv) => `<div><b>${esc(sv.name)}</b><p>${esc(sv.desc)}</p></div>`).join("")}</div></section>` : ""}
${sec.testimonials && (p.testimonials || []).length ? `<section><h2>Word on set</h2>${p.testimonials.map((t) => `<div class="tst"><p>“${esc(t.quote)}”</p><span>· ${esc(t.who)}</span></div>`).join("")}</section>` : ""}
${sec.education && (p.education || []).length ? `<section><h2>Training</h2><ul style="list-style:none">${p.education.map((e) => `<li style="padding:10px 0;border-bottom:1px solid ${text}18">${esc(eduLabel(e))}</li>`).join("")}</ul></section>` : ""}
${sec.certifications !== false && hasCerts(p) ? `<section><h2>Certifications</h2><div class="rr">${p.certifications.map((c) => `<div><b>${esc(c.name)}</b><div class="m">${[c.issuer, c.year].filter(Boolean).map(esc).join(" · ")}</div>${c.url ? `<div style="margin-top:8px"><a href="${/^http/.test(c.url) ? esc(c.url) : "https://" + esc(c.url)}" target="_blank" rel="noopener noreferrer">Credential ↗</a></div>` : ""}</div>`).join("")}</div></section>` : ""}
${sec.languages !== false && hasLangObjs(p) ? `<section><h2>Languages</h2><div class="lang">${p.languages.map((l) => `<span>${esc(langLabel(l))}</span>`).join("")}</div></section>` : ""}
${sec.contact ? `<footer><div class="mono">CLOSING CREDITS</div><div class="big">Let's make something worth watching.</div><div class="links">${linkRow(p, text)}</div></footer>` : ""}
${CREDIT}</body></html>`;
}

// standalone case-study page in the Monolith skin
function monolithCase(p, pal, pr, nav) {
  const [bg, panel, accent, accent2, text] = pal.vars;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pr.name)} · ${esc(p.name)}</title><meta name="description" content="${esc(pr.summary || pr.desc || pr.name)}">
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
</style></head><body>
<div class="wrap">
<a class="back" href="../index.html">← Back to the film</a>
<div class="hero"><div class="mono" style="margin-bottom:14px">CASE STUDY</div><h1>${esc(pr.name)}</h1>${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}${metaRow(pr, "meta")}</div>
${pr.cover ? `<img class="cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}
${["problem", "process", "results"].filter((k) => pr[k]).map((k) => `<div class="blk"><h2>${k === "problem" ? "The problem" : k === "process" ? "The process" : "The results"}</h2><p>${esc(pr[k])}</p></div>`).join("")}
${nav ? `<div class="next"><a href="../index.html">← All productions</a>${nav.next ? `<a href="${esc(nav.next.slug)}.html">Next: ${esc(nav.next.pr.name)} →</a>` : ""}</div>` : ""}
</div>${CREDIT}</body></html>`;
}

/* ================================================================
   TEMPLATE 02 · THE EDITORIAL (light magazine)
================================================================ */
function editorial(p, pal, sec, ctx = {}) {
  const [paper, ink, accent, soft] = pal.vars;
  const caseHref = ctx.caseHref || noHref;
  const exp = normExperience(p);
  const photo = p.photo || initialsAvatar(p.name, ink, paper);
  const n = (i) => String(i + 1).padStart(2, "0");
  let ix = 0;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} · ${esc(p.headline)}</title><meta name="description" content="${esc(p.summary || p.headline)}">
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
</style></head><body><div class="wrap">
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
  : `<div class="cs2">${pr.cover ? `<img class="cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}<h3>${esc(pr.name)}</h3>${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}${metaRow(pr, "csmeta2")}${csBlocks(pr, "csb2")}</div>`; }).join("")}
${p.projects.filter((pr) => !isCaseStudy(pr)).map((pr) => `<div class="pr"><b>${esc(pr.name)}</b><p>${esc(pr.summary || pr.desc)}</p></div>`).join("")}</section>` : ""}
${sec.services && (p.services || []).length ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>Services</h2></div><div class="svc2">${p.services.map((sv) => `<div><b>${esc(sv.name)}</b><p>${esc(sv.desc)}</p></div>`).join("")}</section>` : ""}
${sec.testimonials && (p.testimonials || []).length ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>Kind words</h2></div>${p.testimonials.map((t) => `<div class="tst2"><p>“${esc(t.quote)}”</p><span>· ${esc(t.who)}</span></div>`).join("")}</section>` : ""}
${sec.education && (p.education || []).length ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>Education</h2></div>${p.education.map((e) => `<p style="padding:6px 0">${esc(eduLabel(e))}</p>`).join("")}</section>` : ""}
${sec.certifications !== false && hasCerts(p) ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>Certifications</h2></div><div class="rr2">${p.certifications.map((c) => `<div><b>${esc(c.name)}</b><div class="m">${[c.issuer, c.year].filter(Boolean).map(esc).join(" · ")}</div>${c.url ? `<div style="margin-top:6px"><a href="${/^http/.test(c.url) ? esc(c.url) : "https://" + esc(c.url)}" target="_blank" rel="noopener noreferrer">Credential ↗</a></div>` : ""}</div>`).join("")}</div></section>` : ""}
${sec.languages !== false && hasLangObjs(p) ? `<section><div class="sechead"><span class="no">${n(ix++)}</span><h2>Languages</h2></div><div class="lang2">${p.languages.map((l) => `<span>${esc(langLabel(l))}</span>`).join("")}</div></section>` : ""}
${sec.contact ? `<footer><div class="mono">CORRESPONDENCE</div><div class="big">Start the conversation.</div><div class="mono links" style="margin-top:16px">${linkRow(p, ink)}</div></footer>` : ""}
</div>${CREDIT}</body></html>`;
}

// standalone case-study page in the Editorial skin
function editorialCase(p, pal, pr, nav) {
  const [paper, ink, accent, soft] = pal.vars;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pr.name)} · ${esc(p.name)}</title><meta name="description" content="${esc(pr.summary || pr.desc || pr.name)}">
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
</style></head><body><div class="wrap">
<a class="back" href="../index.html">← Back to the film</a>
<header><div class="mono">Case Study</div><h1>${esc(pr.name)}</h1>${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}${metaRow(pr, "meta")}</header>
${pr.cover ? `<img class="cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}
${["problem", "process", "results"].filter((k) => pr[k]).map((k) => `<div class="blk"><h2>${k === "problem" ? "The problem" : k === "process" ? "The process" : "The results"}</h2><p>${esc(pr[k])}</p></div>`).join("")}
${nav ? `<div class="next"><a href="../index.html">← All work</a>${nav.next ? `<a href="${esc(nav.next.slug)}.html">Next: ${esc(nav.next.pr.name)} →</a>` : ""}</div>` : ""}
</div>${CREDIT}</body></html>`;
}

/* ================================================================
   TEMPLATE 03 · THE TERMINAL (engineer's console)
================================================================ */
function terminal(p, pal, sec, ctx = {}) {
  const [bg, green, amber, dim] = pal.vars;
  const caseHref = ctx.caseHref || noHref;
  const exp = normExperience(p);
  const bar = (i) => { const f = 9 - (i % 4); return "█".repeat(f) + "░".repeat(10 - f); };
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} · ${esc(p.headline)}</title><meta name="description" content="${esc(p.summary || p.headline)}">
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
</main></div>${CREDIT}</body></html>`;
}

// standalone case-study page in the Terminal skin
function terminalCase(p, pal, pr, nav) {
  const [bg, green, amber, dim] = pal.vars;
  const file = "projects/" + (nav ? nav.slug : slugify(pr.name)) + ".md";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pr.name)} · ${esc(p.name)}</title><meta name="description" content="${esc(pr.summary || pr.desc || pr.name)}">
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
</main></div>${CREDIT}</body></html>`;
}

/* ================================================================
   TEMPLATE 04 · THE GALLERY (luminous fine-photography)
================================================================ */
function gallery(p, pal, sec, ctx = {}) {
  const [canvas, ink, accent, soft, rule] = pal.vars;
  const caseHref = ctx.caseHref || noHref;
  const exp = normExperience(p);
  const hasPhoto = !!p.photo;
  const photo = p.photo || initialsAvatar(p.name, ink, canvas);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} · ${esc(p.headline)}</title><meta name="description" content="${esc(p.summary || p.headline)}">
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
</style></head><body>
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
  : `<figure class="work">${pr.cover ? `<img class="cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}<div class="plaque"><h3>${esc(pr.name)}</h3>${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}${metaRow(pr, "wmeta")}</div>${["problem", "process", "results"].filter((k) => pr[k]).length ? `<div class="wblk">${["problem", "process", "results"].filter((k) => pr[k]).map((k) => `<h4>${k === "problem" ? "The problem" : k === "process" ? "The process" : "The results"}</h4><p>${esc(pr[k])}</p>`).join("")}</div>` : ""}</figure>`; }).join("")}
${p.projects.filter((pr) => !isCaseStudy(pr)).length ? `<div class="plain">${p.projects.filter((pr) => !isCaseStudy(pr)).map((pr) => `<div class="row"><b>${esc(pr.name)}</b><p>${esc(pr.summary || pr.desc)}</p></div>`).join("")}</div>` : ""}</section><div class="hair"></div>` : ""}
${sec.experience && exp.length ? `<section class="wrap"><div class="shead"><h2>Experience</h2></div>${exp.map((x) => `<div class="xp">${x.period ? `<div class="per">${esc(x.period)}</div>` : ""}<h3>${esc(x.title)}</h3>${x.org ? `<div class="org">${esc(x.org)}</div>` : ""}<ul style="list-style:none">${x.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul></div>`).join("")}</section><div class="hair"></div>` : ""}
${sec.skills && p.skills.length ? `<section class="wrap"><div class="shead"><h2>Practice</h2></div><div class="skl">${p.skills.map((s) => `<span>${esc(s)}</span>`).join("")}</div></section><div class="hair"></div>` : ""}
${sec.services && (p.services || []).length ? `<section class="wrap"><div class="shead"><h2>Services</h2></div><div class="plain">${p.services.map((sv) => `<div class="row"><b>${esc(sv.name)}</b><p>${esc(sv.desc)}</p></div>`).join("")}</div></section><div class="hair"></div>` : ""}
${sec.testimonials && (p.testimonials || []).length ? `<section class="wrap"><div class="shead"><h2>In their words</h2></div><div class="plain">${p.testimonials.map((t) => `<div class="row"><b style="font-style:italic;font-weight:400">“${esc(t.quote)}”</b><p>${esc(t.who)}</p></div>`).join("")}</div></section><div class="hair"></div>` : ""}
${sec.education && (p.education || []).length ? `<section class="wrap"><div class="shead"><h2>Education</h2></div><div class="plain">${p.education.map((e) => `<div class="row"><b>${esc(eduLabel(e))}</b></div>`).join("")}</div></section><div class="hair"></div>` : ""}
${sec.certifications !== false && hasCerts(p) ? `<section class="wrap"><div class="shead"><h2>Certifications</h2></div><div class="rr">${p.certifications.map((c) => `<div class="row"><b>${esc(c.name)}</b><div class="m">${[c.issuer, c.year].filter(Boolean).map(esc).join(" · ")}</div>${c.url ? `<div style="margin-top:8px"><a href="${/^http/.test(c.url) ? esc(c.url) : "https://" + esc(c.url)}" target="_blank" rel="noopener noreferrer">Credential</a></div>` : ""}</div>`).join("")}</div></section><div class="hair"></div>` : ""}
${sec.languages !== false && hasLangObjs(p) ? `<section class="wrap"><div class="shead"><h2>Languages</h2></div><div class="skl">${p.languages.map((l) => `<span>${esc(langLabel(l))}</span>`).join("")}</div></section><div class="hair"></div>` : ""}
${sec.contact ? `<footer class="wrap"><div class="cap">Get in touch</div><div class="big">Let's make something beautiful.</div><div class="links">${linkRow(p, ink)}</div></footer>` : ""}
${CREDIT}</body></html>`;
}

// standalone case-study page in the Gallery skin
function galleryCase(p, pal, pr, nav) {
  const [canvas, ink, accent, soft, rule] = pal.vars;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pr.name)} · ${esc(p.name)}</title><meta name="description" content="${esc(pr.summary || pr.desc || pr.name)}">
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
</style></head><body>
<div class="wrap"><a class="back" href="../index.html">Back to the portfolio</a>
<div class="plaque"><div class="cap">Case study</div><h1>${esc(pr.name)}</h1>${pr.summary || pr.desc ? `<p style="font-size:1.35rem;max-width:44ch;margin:16px auto 0;color:${ink}">${esc(pr.summary || pr.desc)}</p>` : ""}${metaRow(pr, "meta")}</div></div>
${pr.cover ? `<img class="cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}
<div class="wrap">
${["problem", "process", "results"].filter((k) => pr[k]).map((k) => `<div class="blk"><h2>${k === "problem" ? "The problem" : k === "process" ? "The process" : "The results"}</h2><p>${esc(pr[k])}</p></div>`).join("")}
${nav ? `<div class="next"><a href="../index.html">All work</a>${nav.next ? `<a href="${esc(nav.next.slug)}.html">Next: ${esc(nav.next.pr.name)}</a>` : ""}</div>` : ""}
</div>${CREDIT}</body></html>`;
}

/* ================================================================
   TEMPLATE 05 · THE BENTO (rounded-tile grid)
================================================================ */
function bento(p, pal, sec, ctx = {}) {
  const [canvas, tile, accent, ink, muted] = pal.vars;
  const caseHref = ctx.caseHref || noHref;
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
  return href ? `<a class="${cls}" href="${href}"${style}>${bgdiv}${inner}</a>` : `<div class="${cls}"${style}>${bgdiv}${inner}</div>`; }).join("") || ""}
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
<footer>${CREDIT}</footer></body></html>`;
}

// standalone case-study page in the Bento skin
function bentoCase(p, pal, pr, nav) {
  const [canvas, tile, accent, ink, muted] = pal.vars;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pr.name)} · ${esc(p.name)}</title><meta name="description" content="${esc(pr.summary || pr.desc || pr.name)}">
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
</style></head><body>
<div class="shell">
<a class="back" href="../index.html">Back to the grid</a>
<div class="card">
<div class="cap">Case study</div>
<h1 style="margin-top:10px">${esc(pr.name)}</h1>
${pr.summary || pr.desc ? `<p class="sum">${esc(pr.summary || pr.desc)}</p>` : ""}
${["role", "timeline", "tools"].filter((k) => pr[k]).length ? `<div class="chiprow">${["role", "timeline", "tools"].filter((k) => pr[k]).map((k) => `<span><b>${k.toUpperCase()}</b>${esc(pr[k])}</span>`).join("")}</div>` : ""}
${pr.cover ? `<img class="cover" src="${pr.cover}" alt="${esc(pr.name)}">` : ""}
${["problem", "process", "results"].filter((k) => pr[k]).map((k) => `<div class="blk"><h2>${k === "problem" ? "The problem" : k === "process" ? "The process" : "The results"}</h2><p>${esc(pr[k])}</p></div>`).join("")}
</div>
<div class="next"><a class="pill" href="../index.html">All projects</a>${nav && nav.next ? `<a class="pill" href="${esc(nav.next.slug)}.html">Next: ${esc(nav.next.pr.name)}</a>` : ""}</div>
</div>${CREDIT}</body></html>`;
}

// ---------- registry ----------
export const TEMPLATES = [
  {
    id: "monolith", name: "The Monolith", blurb: "Cinematic dark. Kinetic type, marquee, timeline scenes.",
    compile: monolith, caseCompile: monolithCase,
    palettes: [
      { id: "jersey", label: "Jersey", vars: ["#0E1C3F", "#132550", "#C8102E", "#D9A441", "#F4EFE6"] },
      { id: "lavender", label: "Lavender", vars: ["#141126", "#1D1837", "#8B5CF6", "#C4B5FD", "#EFEAFF"] },
      { id: "ember", label: "Ember", vars: ["#160D0B", "#241410", "#E8442E", "#F0A860", "#F5E9DC"] },
    ],
  },
  {
    id: "editorial", name: "The Editorial", blurb: "Light magazine. Serif mastheads, ruled sections, recruiter-calm.",
    compile: editorial, caseCompile: editorialCase,
    palettes: [
      { id: "bone", label: "Bone", vars: ["#F4EFE6", "#1A1712", "#C8102E", "#6E655A"] },
      { id: "sage", label: "Sage", vars: ["#EEF1EA", "#1C221A", "#0E9E62", "#5F6B5C"] },
      { id: "slate", label: "Slate", vars: ["#EDF0F4", "#141A24", "#2557D6", "#5A6678"] },
    ],
  },
  {
    id: "terminal", name: "The Terminal", blurb: "Engineer's console. Prompt, skill bars, git-log career.",
    compile: terminal, caseCompile: terminalCase,
    palettes: [
      { id: "phosphor", label: "Phosphor", vars: ["#07100a", "#33ff88", "#ffc857", "#7ea08b"] },
      { id: "amber", label: "Amber CRT", vars: ["#100b04", "#ffb454", "#7fdb8f", "#a08a6a"] },
      { id: "ice", label: "Ice", vars: ["#070d14", "#6fd3ff", "#ffd166", "#7a93a8"] },
    ],
  },
  {
    id: "gallery", name: "The Gallery", blurb: "Luminous fine-photography. Serif display, hairline rules, edge-to-edge covers.",
    compile: gallery, caseCompile: galleryCase,
    palettes: [
      { id: "porcelain", label: "Porcelain", vars: ["#F6F2EA", "#1C1A17", "#9A6A3C", "#8A8378", "#DFD8CC"] },
      { id: "silver", label: "Silver", vars: ["#ECEDEF", "#16181B", "#4A5B6E", "#6D7681", "#D2D5DA"] },
      { id: "sepia", label: "Sepia", vars: ["#F3E9D8", "#2A2117", "#9C5A2C", "#8A7355", "#DFCFB4"] },
    ],
  },
  {
    id: "bento", name: "The Bento", blurb: "Rounded-tile grid. Identity tile, project tiles, link-in-bio grown up.",
    compile: bento, caseCompile: bentoCase,
    palettes: [
      { id: "sorbet", label: "Sorbet", vars: ["#FBF3EC", "#FFFFFF", "#E0607E", "#2C2530", "#7A7280"] },
      { id: "graphite", label: "Graphite", vars: ["#0D0F12", "#191C21", "#5EC8C0", "#EDEFF2", "#9AA3AD"] },
      { id: "citrus", label: "Citrus", vars: ["#FFFFFF", "#F5F6F8", "#F2591E", "#181A1D", "#6C727A"] },
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

// ---------- multi-page bundle compiler ----------
// files[0] is always index.html: the compile() output, except case-study cards
// link out to projects/{slug}.html (relative). Then one standalone page per
// case study (capped at 12), each in its template family's own skin.
export function compileBundle(templateId, paletteId, profile, opts = {}) {
  const t = TEMPLATES.find((x) => x.id === templateId) || TEMPLATES[0];
  const pal = t.palettes.find((x) => x.id === paletteId) || t.palettes[0];
  const sections = { ...DEFAULT_SECTIONS, ...(opts.sections || {}) };

  const cases = caseStudyList(profile.projects);
  const slugFor = new Map(cases.map(({ pr, slug }) => [pr, slug]));
  const caseHref = (pr) => { const s = slugFor.get(pr); return s ? "projects/" + s + ".html" : ""; };

  const files = [];
  files.push({ path: "index.html", html: t.compile(profile, pal, sections, { caseHref }) });

  cases.forEach(({ pr, slug }, i) => {
    const nav = { slug, prev: cases[i - 1] || null, next: cases[i + 1] || null };
    files.push({ path: "projects/" + slug + ".html", html: t.caseCompile(profile, pal, pr, cases.length > 1 ? nav : { slug }) });
  });

  return { files };
}
