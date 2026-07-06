// profileParse.js: a deterministic, client-side resume reader for the Dossier.
// No AI, no network: plain heuristics over the pasted or extracted CV text.
// It fills a structured profile so the client never types from scratch, and it
// is careful to only ever suggest: mergeProfile fills empty fields and never
// clobbers a manual edit the client already made.

// A compact bank of common skills. Client-side twin of the api SKILL_BANK, kept
// small on purpose: matched case-insensitively as whole-ish tokens in the text.
const SKILL_BANK = [
  "aws", "azure", "gcp", "kubernetes", "docker", "terraform", "ansible", "jenkins",
  "github actions", "ci/cd", "python", "javascript", "typescript", "react", "node",
  "java", "go", "rust", "c++", "c#", "php", "ruby", "sql", "graphql", "rest",
  "figma", "sketch", "photoshop", "illustrator", "after effects", "premiere",
  "blender", "ui", "ux", "product design", "branding", "marketing", "seo",
  "copywriting", "analytics", "excel", "notion", "jira", "prometheus", "grafana",
  "linux", "agile", "scrum", "machine learning", "data", "mongodb", "postgres",
  "redis", "next.js", "vue", "angular", "swift", "kotlin", "flutter", "devops",
  "sre", "security", "photography", "tableau", "salesforce",
];

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const YEAR_RE = /(19|20)\d{2}/;
const GITHUB_RE = /github\.com\/([a-z0-9_.-]+)/i;
const LINKEDIN_RE = /linkedin\.com\/(?:in|pub)\/([a-z0-9_.%-]+)/i;
const URL_RE = /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s,]*)?)\b/i;
const BULLET_RE = /^\s*(?:[-•*·‣▪\u2013]|•)\s+/;
const VERB_START_RE = /^[a-z]/; // lowercase-verb-ish continuation lines
const DEGREE_RE = /\b(bsc|msc|b\.?a\.?|m\.?a\.?|b\.?s\.?|m\.?s\.?|phd|ph\.?d|bachelor|master|mba|engineer's|diploma)\b/i;
const CERT_RE = /\b(certified|certificate|certification|aws|azure|ccna|pmp|scrum|comptia|kubernetes|google cloud)\b/i;
const LANG_LEVEL_RE = /\b(native|fluent|professional|conversational|basic|beginner|intermediate|advanced|c1|c2|b1|b2|a1|a2)\b/i;

export const EMPTY_PROFILE = {
  identity: { name: "", headline: "", location: "", email: "" },
  story: "",
  experience: [],
  projects: [],
  skills: [],
  certifications: [],
  education: [],
  languages: [],
  links: { github: "", linkedin: "", website: "" },
};

const cap = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
const cleanBullet = (s) => clean(String(s).replace(BULLET_RE, ""));

// Split a "role at company" / "role, company" / "role | company" shape.
function splitRoleCompany(line) {
  const withoutYears = line.replace(/\(?\b((19|20)\d{2})\b.*$/, "").trim().replace(/[,|\u2013-]\s*$/, "");
  let m = withoutYears.match(/^(.+?)\s+(?:at|@|for)\s+(.+)$/i);
  if (m) return { role: clean(m[1]), company: clean(m[2]) };
  m = withoutYears.match(/^(.+?)\s*[|]\s*(.+)$/);
  if (m) return { role: clean(m[1]), company: clean(m[2]) };
  m = withoutYears.match(/^(.+?)\s*,\s*(.+)$/);
  if (m) return { role: clean(m[1]), company: clean(m[2]) };
  return { role: clean(withoutYears), company: "" };
}

// Pull start/end years out of a line, e.g. "2019 - 2022", "2020 to Present".
function splitYears(line) {
  const years = line.match(/(19|20)\d{2}/g) || [];
  const present = /\b(present|current|now|today)\b/i.test(line);
  return { start: years[0] || "", end: years[1] || (present ? "Present" : "") };
}

export function parseResumeToProfile(text) {
  const raw = String(text || "");
  const out = JSON.parse(JSON.stringify(EMPTY_PROFILE));
  const lines = raw.split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));
  const nonEmpty = lines.map(clean).filter(Boolean);
  const lower = raw.toLowerCase();

  // identity: first substantial line = name, second = headline
  const substantial = nonEmpty.filter((l) => l.length >= 2 && !EMAIL_RE.test(l) && !URL_RE.test(l));
  if (substantial[0] && substantial[0].length <= 60 && !YEAR_RE.test(substantial[0])) out.identity.name = substantial[0];
  if (substantial[1] && substantial[1].length <= 90 && !YEAR_RE.test(substantial[1])) out.identity.headline = substantial[1];

  // email + links
  const email = raw.match(EMAIL_RE);
  if (email) out.identity.email = email[0];
  const gh = raw.match(GITHUB_RE);
  if (gh) out.links.github = `github.com/${gh[1]}`;
  const li = raw.match(LINKEDIN_RE);
  if (li) out.links.linkedin = `linkedin.com/in/${li[1]}`;
  // website: first bare domain that is not github/linkedin/inside an email
  const emailHost = email ? email[0].toLowerCase().split("@")[1] : "";
  const urlGlobal = new RegExp(URL_RE.source, "gi");
  const found = [];
  let um;
  while ((um = urlGlobal.exec(raw))) found.push(um[1]);
  for (const cand of found) {
    const host = cand.toLowerCase();
    if (/github\.com|linkedin\.com/.test(host)) continue;
    const bareHost = host.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    if (emailHost && emailHost === bareHost) continue;
    if (email && email[0].toLowerCase().includes(bareHost)) continue; // domain is a fragment of the email
    out.links.website = cand.replace(/^https?:\/\//, "").replace(/\/$/, "");
    break;
  }

  // location: a "City, Country" line near the top with no digits/@
  for (const l of nonEmpty.slice(0, 6)) {
    if (/^[A-Za-z .'-]+,\s*[A-Za-z .'-]+$/.test(l) && !EMAIL_RE.test(l) && l.length <= 48 && l !== out.identity.headline) {
      out.location = l; out.identity.location = l; break;
    }
  }

  // skills: bank scan over the whole text
  out.skills = SKILL_BANK.filter((s) => lower.includes(s)).map((s) => (s.length <= 3 ? s.toUpperCase() : cap(s)));
  out.skills = [...new Set(out.skills)].slice(0, 24);

  // section-aware sweep for languages heading proximity
  let inLanguages = false;

  // experience: a line with a year and a role/company shape opens an entry;
  // following bullet-ish or lowercase-verb lines become highlights.
  let cur = null;
  const pushCur = () => { if (cur && (cur.role || cur.company)) out.experience.push(cur); cur = null; };

  for (let i = 0; i < lines.length; i++) {
    const line = clean(lines[i]);
    if (!line) continue;
    const isHeading = /^(languages?|experience|work experience|employment|education|skills|projects|certifications?)\s*:?\s*$/i.test(line);
    if (isHeading) { pushCur(); inLanguages = /^languages?/i.test(line); continue; }

    // languages: "English (fluent)" / "English: C1" near a Languages heading
    if (inLanguages || (LANG_LEVEL_RE.test(line) && /[a-z]+\s*[:(]/i.test(line))) {
      const m = line.match(/^([A-Za-z ]{2,20})\s*[:(]?\s*([A-Za-z12]+)?\)?$/);
      const lvl = line.match(LANG_LEVEL_RE);
      if (m && m[1] && !DEGREE_RE.test(line)) {
        out.languages.push({ name: clean(m[1]), level: lvl ? cap(lvl[1]) : "" });
        continue;
      }
    }

    // education
    if (DEGREE_RE.test(line) && !CERT_RE.test(line)) {
      const yrs = (line.match(/(19|20)\d{2}/g) || []).join(" - ");
      const parts = line.split(/\s*[,|\u2013-]\s*/);
      out.education.push({
        degree: clean(parts[0] || line),
        school: clean(parts.slice(1).find((p) => p && !YEAR_RE.test(p)) || ""),
        years: yrs,
      });
      continue;
    }

    // certifications (checked before experience: cert keyword + year wins)
    if (CERT_RE.test(line) && YEAR_RE.test(line) && !/\b(at|@|for)\b/i.test(line)) {
      const yr = (line.match(YEAR_RE) || [])[0] || "";
      const urlM = line.match(URL_RE);
      const parts = line.replace(YEAR_RE, "").split(/\s*[,|\u2013-]\s*/).map(clean).filter(Boolean);
      out.certifications.push({
        name: parts[0] || clean(line),
        issuer: parts[1] || "",
        year: yr,
        url: urlM ? urlM[1].replace(/^https?:\/\//, "") : "",
      });
      continue;
    }

    // experience entry opener: has a year AND a role/company shape
    if (YEAR_RE.test(line) && /\b(at|@|for)\b|[|,]/.test(line) && line.length <= 120 && !EMAIL_RE.test(line)) {
      pushCur();
      const rc = splitRoleCompany(line);
      const yr = splitYears(line);
      cur = { role: rc.role, company: rc.company, start: yr.start, end: yr.end, highlights: [] };
      continue;
    }

    // highlight continuation for the open entry
    if (cur && (BULLET_RE.test(lines[i]) || VERB_START_RE.test(line)) && cur.highlights.length < 4 && line.length <= 200) {
      out.experience.length < 99 && cur.highlights.push(cleanBullet(line));
      continue;
    }

    // a plain line breaks the current entry's highlight run
    if (cur && cur.highlights.length) pushCur();
  }
  pushCur();

  // story: prefer text under a summary/profile/about heading, else a long para
  const sumIdx = lines.findIndex((l) => /^(summary|profile|about|about me)\s*:?\s*$/i.test(clean(l)));
  if (sumIdx >= 0) {
    const buf = [];
    for (let i = sumIdx + 1; i < lines.length && buf.length < 6; i++) {
      const l = clean(lines[i]);
      if (!l) { if (buf.length) break; else continue; }
      if (/^[a-z ]+:?\s*$/i.test(l) && l.length < 24 && /experience|education|skills|projects/i.test(l)) break;
      buf.push(l);
    }
    out.story = clean(buf.join(" ")).slice(0, 600);
  }

  // caps
  out.experience = out.experience.slice(0, 8);
  out.education = out.education.slice(0, 4);
  out.certifications = out.certifications.slice(0, 8);
  out.languages = out.languages.slice(0, 6);
  delete out.location; // location lives inside identity only
  return out;
}

// deep-merge: incoming fills only empty fields/empty arrays on base, so a manual
// edit the client already made is never overwritten by a re-parse.
const isEmptyVal = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

export function mergeProfile(base, incoming) {
  const b = base ? JSON.parse(JSON.stringify(base)) : JSON.parse(JSON.stringify(EMPTY_PROFILE));
  const inc = incoming || {};
  const mergeObj = (bo, io) => {
    for (const k of Object.keys(io || {})) {
      if (isEmptyVal(bo[k]) && !isEmptyVal(io[k])) bo[k] = io[k];
    }
    return bo;
  };
  b.identity = mergeObj({ ...EMPTY_PROFILE.identity, ...b.identity }, inc.identity || {});
  b.links = mergeObj({ ...EMPTY_PROFILE.links, ...b.links }, inc.links || {});
  if (isEmptyVal(b.story) && !isEmptyVal(inc.story)) b.story = inc.story;
  for (const key of ["experience", "projects", "skills", "certifications", "education", "languages"]) {
    const arr = Array.isArray(b[key]) ? b[key] : [];
    if (arr.length === 0 && Array.isArray(inc[key]) && inc[key].length) b[key] = inc[key];
    else b[key] = arr;
  }
  return b;
}
