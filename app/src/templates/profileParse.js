// profileParse.js: a deterministic, client-side resume reader for the Dossier.
// No AI, no network: plain heuristics over the pasted or extracted CV text.
// It fills a structured profile so the client never types from scratch, and it
// is careful to only ever suggest: mergeProfile fills empty fields and never
// clobbers a manual edit the client already made.
//
// All detection primitives (regexes, splitters, guards) live in resumeHeuristics.js,
// which is the single source of truth shared with engine.js parseProfile. This
// file owns only the Dossier (nested) output shape and the section-sweep logic.
import {
  SECTION_RE, sectionKey,
  EMAIL_RE, YEAR_RE, YEAR_RE_G,
  DEGREE_RE, CERT_RE, LANG_LEVEL_RE,
  BULLET_RE, URL_RE_PROTOCOL, URL_RE_BARE, KNOWN_NON_TLD,
  PRESENT_RE, PERIOD_RE,
  NAME_STOPLIST,
  ROLE_CONNECTOR_RE,
  cleanWS, splitRoleCompany, splitYears, looksLikePublication,
} from "./resumeHeuristics.js";

// A compact bank of common skills, matched case-insensitively across the raw text.
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
const clean = cleanWS;
const cleanBullet = (s) => clean(String(s).replace(BULLET_RE, ""));

export function parseResumeToProfile(text) {
  const raw = String(text || "");
  const out = JSON.parse(JSON.stringify(EMPTY_PROFILE));
  const lines = raw.split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));
  const nonEmpty = lines.map(clean).filter(Boolean);
  const lower = raw.toLowerCase();

  // identity: first substantial line = name, skip document-header stoplisted lines.
  // Also handles "Name: Sophie Dubois" labelled fields.
  const substantial = nonEmpty.filter(
    (l) => l.length >= 2 && !EMAIL_RE.test(l) && !URL_RE_PROTOCOL.test(l)
  );
  // Try to extract a name from a "Name: ..." labelled field anywhere in the first 8 lines.
  const labelledName = nonEmpty.slice(0, 8).find((l) => /^name\s*:/i.test(l));
  if (labelledName) {
    out.identity.name = clean(labelledName.replace(/^name\s*:\s*/i, "")).slice(0, 60);
  } else {
    // Skip lines that are document headers ("Curriculum Vitae", "Resume", etc.)
    const nameCandidate = substantial.find(
      (l) => !NAME_STOPLIST.test(l) && l.length <= 60 && !YEAR_RE.test(l)
    );
    if (nameCandidate) out.identity.name = nameCandidate;
  }
  // Headline: the next substantial non-name, non-header line.
  const headlineCandidate = substantial.find(
    (l) => l !== out.identity.name && !NAME_STOPLIST.test(l) && l.length <= 90 && !YEAR_RE.test(l) && !EMAIL_RE.test(l)
  );
  if (headlineCandidate && !/^(name|email|title|headline)\s*:/i.test(headlineCandidate)) {
    out.identity.headline = headlineCandidate;
  }

  // email + links
  const emailM = raw.match(EMAIL_RE);
  if (emailM) out.identity.email = emailM[0];
  const emailHost = emailM ? emailM[0].toLowerCase().split("@")[1] : "";

  const ghM = raw.match(/github\.com\/([a-z0-9_.-]+)/i);
  if (ghM) out.links.github = `github.com/${ghM[1]}`;
  const liM = raw.match(/linkedin\.com\/(?:in|pub)\/([a-z0-9_.%-]+)/i);
  if (liM) out.links.linkedin = `linkedin.com/in/${liM[1]}`;

  // website: require a protocol OR a well-known personal-site TLD.
  // Deliberately does NOT match bare ".js", ".ts", ".py" etc. so technology
  // names like "Node.js" and "Next.js" are not promoted to websites.
  const protocolMatch = URL_RE_PROTOCOL.exec(raw);
  if (protocolMatch) {
    const candidate = protocolMatch[0].replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!/github\.com|linkedin\.com/.test(candidate)) {
      const bareHost = candidate.replace(/^www\./, "").split("/")[0];
      if (!emailHost || emailHost !== bareHost) {
        out.links.website = candidate;
      }
    }
  }
  if (!out.links.website) {
    // Bare domain with a known personal-site TLD (dev, me, site, design, studio, io).
    const bareM = URL_RE_BARE.exec(raw);
    if (bareM) {
      const cand = bareM[2];
      if (!KNOWN_NON_TLD.test(cand) && !/github\.com|linkedin\.com/.test(cand)) {
        const bareHost = cand.replace(/^www\./, "").split("/")[0];
        if (!emailHost || emailHost !== bareHost) {
          out.links.website = cand;
        }
      }
    }
  }

  // location: a "City, Country" line near the top with no digits/@
  for (const l of nonEmpty.slice(0, 8)) {
    if (
      /^[A-Za-zÀ-ÿ .'-]+,\s*[A-Za-zÀ-ÿ .'-]+$/.test(l) &&
      !EMAIL_RE.test(l) &&
      l.length <= 48 &&
      l !== out.identity.name &&
      l !== out.identity.headline
    ) {
      out.identity.location = l;
      break;
    }
  }

  // skills: bank scan over the whole text
  out.skills = SKILL_BANK.filter((s) => lower.includes(s)).map(
    (s) => (s.length <= 3 ? s.toUpperCase() : cap(s))
  );
  out.skills = [...new Set(out.skills)].slice(0, 24);

  // Section-aware sweep: route lines to experience, education, certifications,
  // languages, or story by the section heading above them.
  let inSection = null; // "experience" | "education" | "skills" | "projects" | "languages" | "certs" | "summary"
  let inLanguages = false;

  // experience: an open entry accumulates highlights
  let cur = null;
  const pushCur = () => {
    if (cur && (cur.role || cur.company)) out.experience.push(cur);
    cur = null;
  };

  // education look-ahead: after we push a DEGREE_RE line as education, the next
  // non-empty line (up to 2 ahead) that has no year and length <= 80 is the school.
  let eduLookaheadIdx = -1; // index into `lines` of a just-pushed education entry

  for (let i = 0; i < lines.length; i++) {
    const line = clean(lines[i]);
    if (!line) continue;

    // Section heading detection (English + French + German)
    if (SECTION_RE.test(line)) {
      pushCur();
      inSection = sectionKey(line);
      inLanguages = (inSection === "languages");
      eduLookaheadIdx = -1;
      continue;
    }

    // education look-ahead: up to 2 non-empty lines after the degree header can
    // be the school name and/or the year range. The look-ahead stays open as long
    // as at least one of school or years is still missing. A line that qualifies
    // as neither (too long, or a heading) terminates the look-ahead.
    if (eduLookaheadIdx >= 0 && out.education.length > 0) {
      const entry = out.education[out.education.length - 1];
      const needsSchool = !entry.school;
      const needsYears = !entry.years;

      // A short year-only line (e.g. "2015 - 2018") fills years.
      if (needsYears && YEAR_RE.test(line) && line.length <= 24) {
        const yrs = (line.match(YEAR_RE_G) || []).join(" - ");
        entry.years = yrs;
        // Keep looking if school is still missing (e.g. year came before school).
        if (!needsSchool) eduLookaheadIdx = -1;
        continue;
      }
      // A plain text line with no year fills school.
      if (needsSchool && !YEAR_RE.test(line) && line.length <= 80 && !EMAIL_RE.test(line)) {
        entry.school = line;
        // Keep looking if years still needed.
        if (!needsYears) eduLookaheadIdx = -1;
        continue;
      }
      // Line qualifies as neither: stop looking.
      eduLookaheadIdx = -1;
    }

    // languages: near a Languages heading or carrying a proficiency keyword
    if (
      inLanguages ||
      (inSection !== "experience" && LANG_LEVEL_RE.test(line) && /[a-z]+\s*[:(]/i.test(line))
    ) {
      const m = line.match(/^([A-Za-zÀ-ÿ ]{2,28})\s*[:(]?\s*([A-Za-z12À-ÿ]+)?\)?$/);
      const lvl = line.match(LANG_LEVEL_RE);
      if (m && m[1] && !DEGREE_RE.test(line) && !EMAIL_RE.test(line)) {
        out.languages.push({ name: clean(m[1]), level: lvl ? cap(lvl[0]) : "" });
        continue;
      }
    }

    // Academic publication guard: "Author et al. (2022)" should not become an
    // experience entry. Check before the experience opener.
    if (looksLikePublication(line)) continue;

    // Inside an education section, any line with a year is treated as an education
    // entry even if it also has commas (e.g. "Licence en Informatique, Univ, 2015-2018").
    // This prevents the experience opener from stealing education-section lines.
    if (inSection === "education" && YEAR_RE.test(line) && !EMAIL_RE.test(line)) {
      pushCur();
      eduLookaheadIdx = i;
      const yrs = (line.match(YEAR_RE_G) || []).join(" - ");
      const parts = line.split(/\s*[,|–-]\s*/);
      out.education.push({
        degree: clean(parts[0] || line),
        school: clean(parts.slice(1).find((p) => p && !YEAR_RE.test(p)) || ""),
        years: yrs,
      });
      continue;
    }

    // Experience opener: has a year AND (role connector OR pipe/comma) AND no email.
    // Checked BEFORE the cert check: a comma-separated job title like
    // "Azure DevOps Engineer, Microsoft, 2022 - Present" should route as experience.
    // Skipped when we are inside an education or certifications section.
    const isExpOpener =
      inSection !== "education" &&
      inSection !== "certs" &&
      YEAR_RE.test(line) &&
      (ROLE_CONNECTOR_RE.test(line) || /[|,]/.test(line)) &&
      line.length <= 140 &&
      !EMAIL_RE.test(line) &&
      !looksLikePublication(line);

    if (isExpOpener) {
      pushCur();
      eduLookaheadIdx = -1;
      const rc = splitRoleCompany(line);
      const yr = splitYears(line);
      cur = { role: rc.role, company: rc.company, start: yr.start, end: yr.end, highlights: [] };
      continue;
    }

    // Highlight continuation for the open experience entry.
    // Check BEFORE education so a PhD bullet inside an experience entry does not
    // get consumed as an education entry.
    if (
      cur &&
      (BULLET_RE.test(lines[i]) || /^[a-z]/.test(line)) &&
      cur.highlights.length < 4 &&
      line.length <= 200
    ) {
      cur.highlights.push(cleanBullet(line));
      continue;
    }

    // education: guard against email addresses (.ma / .ms / .ba / .bs match DEGREE_RE)
    if (DEGREE_RE.test(line) && !CERT_RE.test(line) && !EMAIL_RE.test(line)) {
      pushCur();
      eduLookaheadIdx = i;
      const yrs = (line.match(YEAR_RE_G) || []).join(" - ");
      const parts = line.split(/\s*[,|–-]\s*/);
      out.education.push({
        degree: clean(parts[0] || line),
        school: clean(parts.slice(1).find((p) => p && !YEAR_RE.test(p)) || ""),
        years: yrs,
      });
      continue;
    }

    // certifications: run AFTER the experience opener so a job title with a cert
    // keyword does not get misrouted here.
    if (
      CERT_RE.test(line) &&
      YEAR_RE.test(line) &&
      !ROLE_CONNECTOR_RE.test(line) &&
      !isExpOpener
    ) {
      pushCur();
      eduLookaheadIdx = -1;
      const yr = (line.match(YEAR_RE) || [])[0] || "";
      const urlM = URL_RE_PROTOCOL.exec(line);
      const parts = line.replace(YEAR_RE, "").split(/\s*[,|–-]\s*/).map(clean).filter(Boolean);
      out.certifications.push({
        name: parts[0] || clean(line),
        issuer: parts[1] || "",
        year: yr,
        url: urlM ? urlM[0].replace(/^https?:\/\//, "") : "",
      });
      continue;
    }

    // A plain line that is not a bullet breaks the current entry's highlight run.
    if (cur && cur.highlights.length) pushCur();
  }
  pushCur();

  // story: prefer text under a summary/profile/about heading, else a long para
  const sumIdx = lines.findIndex((l) =>
    /^(summary|profile|about|about me|résumé|profil)\s*:?\s*$/i.test(clean(l))
  );
  if (sumIdx >= 0) {
    const buf = [];
    for (let i = sumIdx + 1; i < lines.length && buf.length < 6; i++) {
      const l = clean(lines[i]);
      if (!l) { if (buf.length) break; else continue; }
      if (/^[a-zÀ-ÿ ]+:?\s*$/i.test(l) && l.length < 30 && SECTION_RE.test(l)) break;
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
const isEmptyVal = (v) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "");

export function mergeProfile(base, incoming) {
  const b = base
    ? JSON.parse(JSON.stringify(base))
    : JSON.parse(JSON.stringify(EMPTY_PROFILE));
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
