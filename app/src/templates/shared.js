// engine.js · CineFolio's deterministic portfolio engine. No LLM anywhere:
// a parsed profile + a hand-built template + a palette = a finished site, in
// milliseconds, every time. The AI film pipeline is the premium layer ABOVE this.
// Compiled client-side for instant preview; published through the normal
// immutable-release pipeline, so the server never needs to run this code.
// compile() emits one self-contained page (inline case-study expanders, used by
// the Studio live preview). compileBundle() emits a multi-page site: an index
// whose case-study cards link out, plus one standalone page per case study.

import { buildShareHead, shareAssets, paletteColors } from "./head.js";
import {
  SECTION_RE as HEURISTIC_SECTION_RE, sectionKey,
  EMAIL_RE as H_EMAIL_RE,
  URL_RE_PROTOCOL, URL_RE_BARE, KNOWN_NON_TLD,
  PRESENT_RE, NAME_STOPLIST,
  ROLE_CONNECTOR_RE,
  cleanWS, splitRoleCompany as hSplitRoleCompany, splitYears as hSplitYears, looksLikePublication,
} from "./resumeHeuristics.js";

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The share/SEO head an index (home) page carries. WHY a helper: every template
// emits its own <head> in its own skin, so each calls this with its own palette
// colours and its own share title/description built from the SAME real user data
// that fills the visible page. Absolute origin comes from head.js's ORIGIN_TOKEN,
// rewritten by the publisher at publish time (the one place that knows the real
// address). og:title/description mirror the page's own <title>/description so the
// card sells exactly what the page shows.
export const indexHead = (p, pal, colors) => buildShareHead(p, pal, {
  path: "",
  title: `${p.name} · ${p.headline}`,
  description: p.summary || p.headline,
  type: "profile",
  colors,
  person: true,
});

// The share/SEO head a standalone CASE STUDY page carries. WHY separate: a case
// study must describe ITSELF, not the home page: its own name and its own
// summary become the card, and og:type is "article". The canonical path is the
// project's own page so a shared case study previews as that project.
export const caseHead = (p, pal, pr, colors, ctx = {}) => buildShareHead(p, pal, {
  path: ctx.path || "",
  title: `${pr.name} · ${p.name}`,
  description: pr.summary || pr.desc || pr.name,
  type: "article",
  colors,
  person: false,
});

export const SKILL_BANK = ["aws","azure","gcp","kubernetes","docker","terraform","terragrunt","ansible","jenkins","github actions","gitlab","ci/cd","python","javascript","typescript","react","node","java","go","rust","sql","figma","photoshop","illustrator","after effects","premiere","blender","ui","ux","product design","branding","marketing","seo","sales","copywriting","analytics","excel","notion","prometheus","grafana","linux","agile","scrum","machine learning","ai","data","mongodb","postgres","redis","graphql","next.js","vue","angular","swift","kotlin","flutter","devops","sre","security","photography","film","editing","helm","spark","tableau","salesforce"];

export const SECTION_RE = HEURISTIC_SECTION_RE;
export const PERIOD_RE = /((19|20)\d{2})\s*(?:[-\u2013\u2014]|to|bis|au)\s*((19|20)\d{2}|present|current|now|today|pr[e\u00e9]sent|actuellement|heute|aktuell|ongoing)/i;

// ---------- resume text -> structured profile ----------
export function parseProfile(text, overrides = {}) {
  const raw = String(text || "").slice(0, 20000);
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const lower = raw.toLowerCase();

  const email = overrides.email || (raw.match(H_EMAIL_RE) || [""])[0];
  const emailHost = email ? email.toLowerCase().split("@")[1] : "";
  const phone = (raw.match(/(\+?\d[\d ().-]{7,}\d)/) || [""])[0].trim();

  // website: use the shared URL guards so "Node.js" and "Next.js" do not become
  // the website field. Require a protocol or a well-known personal-site TLD.
  let website = "";
  const protoM = URL_RE_PROTOCOL.exec(raw);
  if (protoM) {
    const cand = protoM[0].replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!/github\.com|linkedin\.com/.test(cand)) {
      const bareHost = cand.replace(/^www\./, "").split("/")[0];
      if (!emailHost || emailHost !== bareHost) website = cand;
    }
  }
  if (!website) {
    const bareM = URL_RE_BARE.exec(raw);
    if (bareM) {
      const cand = bareM[2];
      if (!KNOWN_NON_TLD.test(cand) && !/github\.com|linkedin\.com/.test(cand)) {
        const bareHost = cand.replace(/^www\./, "").split("/")[0];
        if (!emailHost || emailHost !== bareHost) website = cand;
      }
    }
  }
  const links = {
    github: (raw.match(/github\.com\/[\w.-]+/i) || [""])[0],
    linkedin: (raw.match(/linkedin\.com\/in\/[\w.-]+/i) || [""])[0],
    website,
  };

  // sectionize: use sectionKey from the shared heuristics so French and German
  // headings route to the right bucket alongside English ones.
  const sections = { _head: [] };
  let cur = "_head";
  for (const l of lines) {
    if (SECTION_RE.test(l)) {
      const k = sectionKey(l) || cur;
      cur = k === "certs" ? "certs" : k;
      sections[cur] = sections[cur] || [];
      continue;
    }
    (sections[cur] = sections[cur] || []).push(l);
  }

  const head = sections._head;
  // notNamey: skip emails, URLs, years, phone-ish numbers, long lines.
  // Also skip document-header stoplisted words (Curriculum Vitae, Resume, CV).
  const notNamey = (l) =>
    /@|http|\d{4}|\+\d|linkedin|github/i.test(l) ||
    l.length > 48 ||
    NAME_STOPLIST.test(l);
  const name = overrides.name || head.find((l) => !notNamey(l)) || "Your Name";
  const headline = overrides.headline ||
    head.filter((l) => !notNamey(l) && l !== name)[0] ||
    (sections.summary || [])[0]?.slice(0, 90) || "Professional";

  // skills: explicit section + bank scan
  const sectionSkills = (sections.skills || []).join(" ").split(/[,•|·/]+/).map((s) => s.trim().replace(/^[-\u2013\u2014:]\s*/, "")).filter((s) => s && s.length < 28 && !/^skills?$/i.test(s));
  const bankSkills = SKILL_BANK.filter((s) => lower.includes(s));
  const skills = [...new Set([...sectionSkills, ...bankSkills.map(cap)])].slice(0, 14);

  // experience entries: use hSplitRoleCompany (which strips month names before
  // the year) so "DataCorp, Jan 2020" yields company "DataCorp" not "DataCorp, Jan".
  // Publication lines ("Author et al. (2022)") are filtered before opening entries.
  const experience = [];
  let entry = null;
  for (const l of sections.experience || sections._head || []) {
    if (looksLikePublication(l)) continue;
    const pm = l.match(PERIOD_RE);
    if (pm) {
      if (entry) experience.push(entry);
      const rc = hSplitRoleCompany(l);
      const yr = hSplitYears(l);
      const period = [yr.start, yr.end].filter(Boolean).join(" - ");
      entry = { period, title: rc.role.slice(0, 90) || "Role", org: rc.company.slice(0, 80), points: [] };
    } else if (entry) {
      // em-dash (U+2014) is now included so "— Built X" yields a highlight.
      const b = l.replace(/^[-\u2013\u2014*•\u25aa◦→]\s*/, "");
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

export function cap(s) { return s.length <= 3 ? s.toUpperCase() : s[0].toUpperCase() + s.slice(1); }

export const initialsAvatar = (name, bg, fg) => {
  const ini = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "CF";
  return "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="${bg}"/><text x="60" y="76" font-family="Georgia,serif" font-size="46" fill="${fg}" text-anchor="middle" font-weight="bold">${ini}</text></svg>`
  );
};
export const linkRow = (p, color) => {
  const links = p.links || {};
  const L = [];
  if (links.github) L.push(`<a href="https://${links.github.replace(/^https?:\/\//, "")}" target="_blank" rel="noopener noreferrer">GitHub</a>`);
  if (links.linkedin) L.push(`<a href="https://${links.linkedin.replace(/^https?:\/\//, "")}" target="_blank" rel="noopener noreferrer">LinkedIn</a>`);
  if (links.website) L.push(`<a href="${/^http/.test(links.website) ? links.website : "https://" + links.website}" target="_blank" rel="noopener noreferrer">Website</a>`);
  if (p.email) L.push(`<a href="mailto:${esc(p.email)}">Email</a>`);
  return L.join(`<span style="opacity:.4;color:${color}"> / </span>`);
};
// ---------- the end credit (the "Made with CineFolio" badge) ----------
// A portfolio is a piece of craft, so its footer badge reads like an END CREDIT,
// not an ad: a hairline rule, then one small, letter-spaced, monospaced line, the
// way a film closes on a single card. It is ON by default and removable for free
// in one click (see Films.jsx); when the owner turns it off, on() is false and
// this emits nothing at all. Never a paywall, never a nag.
//
// It adapts to every film stock: each template passes its OWN resolved text and
// accent colors (fg, accent), so the credit borrows the page's palette instead of
// a fixed color that would clash on a light stock or a dark one. The link opens
// cinefolio.dev with rel="noopener". The mark is muted (low opacity) so it sits
// under the work, and the accent shows only on the small diamond and on hover.
export const creditBadge = (opts = {}) => {
  const fg = opts.fg || "currentColor";
  const accent = opts.accent || fg;
  return `<footer data-cf-credit style="margin:0;padding:30px 24px;text-align:center;background:transparent">
<div aria-hidden="true" style="width:38px;height:1px;margin:0 auto 16px;background:${accent};opacity:.5"></div>
<a href="https://cinefolio.dev/?ref=made-with" target="_blank" rel="noopener" style="display:inline-block;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:9.5px;letter-spacing:.28em;text-transform:uppercase;color:${fg};opacity:.5;text-decoration:none">
<span style="color:${accent};opacity:.85">&#9672;</span>&nbsp; Made with CineFolio</a>
</footer>`;
};
// credit(on, opts): the badge when the owner leaves it on (the default), or an
// empty string when they have turned it off. Every template calls this exactly
// where its page ends, so a disabled badge leaves no trace in the markup.
export const credit = (on, opts) => (on === false ? "" : creditBadge(opts));

// ---------- normalizers: richer optional fields, both new and legacy shapes ----------
// experience may arrive as parsed {period,title,org,points}, structured
// {role,company,start,end,highlights[]}, or legacy expLines strings. Fold every
// form into the internal {period,title,org,points} the templates already draw.
export const normExperience = (p) => {
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
export const hasCerts = (p) => Array.isArray(p.certifications) && p.certifications.length;
export const hasEduObjs = (p) => Array.isArray(p.education) && p.education.some((e) => e && typeof e === "object");
export const hasLangObjs = (p) => Array.isArray(p.languages) && p.languages.some((l) => l && typeof l === "object");
export const eduLabel = (e) => typeof e === "string" ? e : [e.degree, e.school, e.years].filter(Boolean).join(", ");
export const langLabel = (l) => typeof l === "string" ? l : [l.name, l.level].filter(Boolean).join(": ");

// ---------- slugs ----------
export const slugify = (name, seen) => {
  let base = String(name || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!base) base = "project";
  let slug = base, n = 2;
  while (seen && seen.has(slug)) { slug = base + "-" + n; n++; }
  if (seen) seen.add(slug);
  return slug;
};
// build the ordered list of case-study projects (capped at 12) with stable slugs
export const caseStudyList = (projects) => {
  const seen = new Set();
  return (projects || []).filter(isCaseStudy).slice(0, 12).map((pr) => ({ pr, slug: slugify(pr.name, seen) }));
};

// ---------- rich projects / case studies (shared logic, per-template skin) ----------
export const isCaseStudy = (pr) => !!(pr.problem || pr.process || pr.results || pr.role || pr.cover);
export const metaRow = (pr, cls) => {
  const cells = [["ROLE", pr.role], ["TIMELINE", pr.timeline], ["TOOLS", pr.tools]].filter(([, v]) => v);
  if (!cells.length) return "";
  return `<div class="${cls}">${cells.map(([k, v]) => `<span><b>${k}</b>${esc(v)}</span>`).join("")}</div>`;
};
export const csBlocks = (pr, cls) => ["problem", "process", "results"]
  .filter((k) => pr[k])
  .map((k) => `<div class="${cls}"><h4>${k === "problem" ? "The problem" : k === "process" ? "The process" : "The results"}</h4><p>${esc(pr[k])}</p></div>`)
  .join("");

// metricsBlocks: render up to METRICS_CAP outcome metrics from a project, each as
// a large value + label cell, returning empty string when the array is absent or
// empty. Direction is explicit: the author knows whether "40% fewer support tickets"
// is a win; an inference rule cannot. Arrow glyphs ("up" = up-arrow, "down" =
// down-arrow, "neutral" or absent = no arrow) are rendered as aria-hidden spans so
// screen readers see only the value and label text, not the glyph character.
// Each template supplies a container CSS class; child element styling is delegated
// to CSS via the container class selector so no palette colours are inlined here.
// This means: add a CSS rule for `.yourClass div span:first-child` in your template.
// The cap exists so one over-zealous project cannot stretch a layout that
// a designer tuned for 4 cells maximum.
export const METRICS_CAP = 4;
export const DIRECTION_GLYPH = { up: "↑", down: "↓" };
// metricsBlocks(pr, wrapperClass):
//   pr            the project object (metrics may be absent: returns "" immediately)
//   wrapperClass  outer container class (each template passes its own, see CSS above)
// The common path (no metrics) must produce exactly "" with no trailing whitespace
// or newline: that is the byte-identical guarantee for existing projects.
// True when at least one project carries a metric, used to gate the metrics
// stylesheet. Without this the rules ship to every portfolio, including the
// overwhelming majority that have no metrics at all.
export const hasMetrics = (projects) =>
  (projects || []).some((pr) => Array.isArray(pr?.metrics) && pr.metrics.length > 0);

export const metricsBlocks = (pr, wrapperClass) => {
  const metrics = Array.isArray(pr.metrics) ? pr.metrics.slice(0, METRICS_CAP) : [];
  // no metrics: exactly empty string, no container, no whitespace
  if (!metrics.length) return "";
  const cells = metrics.map((m) => {
    const glyph = DIRECTION_GLYPH[m.direction] || "";
    const glyphHtml = glyph ? `<span aria-hidden="true">${glyph}</span>` : "";
    return `<div><span>${glyphHtml}${esc(m.value)}</span><span>${esc(m.label || "")}</span></div>`;
  });
  return `<div class="${wrapperClass}">${cells.join("")}</div>`;
};

// caseHref(pr): given a project, return the relative page path when a bundle is
// being built, or "" for the single-page compile() (inline expanders stay).
export const noHref = () => "";

/* ================================================================
   TEMPLATE 01 · THE MONOLITH (cinematic dark)
================================================================ */
