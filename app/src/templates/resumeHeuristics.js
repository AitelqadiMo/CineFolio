// resumeHeuristics.js: shared detection primitives used by BOTH resume parsers.
//
// WHY a separate module: profileParse.js (the Dossier, nested shape) and
// engine.js parseProfile (the flat shape for templates) were independent copies
// of the same heuristics. Any bug fixed in one did not fix the other, so the
// two parsers diverged on every edge case. This module is the single source of
// truth for every regex, guard, and splitter both parsers rely on; each parser
// imports from here and adds only the shape-specific wiring it needs.

// ----- section headings: English + French + German -----

// Why list all three languages: CineFolio has real users submitting French CVs
// (the owner confirmed a live case at abdelhamid-chouraichi.cinefolio.dev).
// German is included because the same platform audience reaches DACH markets.
// The regex is anchored to the full line (callers pass a trimmed line) so
// "Professional Experience" inside a sentence body does not fire.
export const SECTION_RE = new RegExp(
  "^(" +
  // English
  "experience|work experience|employment|professional experience|work history|" +
  "education|academic background|" +
  "skills?|technical skills?|core competencies|competencies|" +
  "projects?|selected projects?|" +
  "languages?|" +
  "certifications?|certificates?|awards?|" +
  "summary|profile|about|about me|" +
  // French
  "expérience professionnelle|expériences?|" +
  "formation|diplômes?|études?|" +
  "compétences?|" +
  "langues?|" +
  "certifications?|" +
  "résumé|profil|" +
  // German
  "berufserfahrung|erfahrung|" +
  "ausbildung|bildung|" +
  "kenntnisse|fähigkeiten|" +
  "sprachen|" +
  "zertifizierungen?|" +
  "zusammenfassung|profil" +
  ")\\s*:?\\s*$",
  "i"
);

// Section-to-canonical-key mapping. Returns one of the canonical keys or null.
export function sectionKey(heading) {
  const h = heading.toLowerCase().replace(/\s+/g, " ").trim();
  if (/^(experience|work experience|employment|professional experience|work history|expérience professionnelle|expériences?|berufserfahrung|erfahrung)$/.test(h))
    return "experience";
  if (/^(education|academic background|formation|diplômes?|études?|ausbildung|bildung)$/.test(h))
    return "education";
  if (/^(skills?|technical skills?|core competencies|competencies|compétences?|kenntnisse|fähigkeiten)$/.test(h))
    return "skills";
  if (/^(projects?|selected projects?)$/.test(h)) return "projects";
  if (/^(languages?|langues?|sprachen)$/.test(h)) return "languages";
  if (/^(certifications?|certificates?|awards?|zertifizierungen?)$/.test(h)) return "certs";
  if (/^(summary|profile|about|about me|résumé|profil|zusammenfassung)$/.test(h)) return "summary";
  return null;
}

// ----- shared regular expressions -----

export const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
export const YEAR_RE = /(19|20)\d{2}/;
export const YEAR_RE_G = /(19|20)\d{2}/g;

// DEGREE_RE: matches academic degree abbreviations and full words.
// The two-letter forms (b.a., m.a., b.s., m.s.) also match TLD fragments in
// email addresses (.ma, .ms, .ba, .bs). The guard EMAIL_RE must be applied
// BEFORE this test, and any caller must check !EMAIL_RE.test(line) first.
// "Licence" is the French bachelor (licence en informatique, licence es sciences).
export const DEGREE_RE = /\b(bsc|msc|b\.?a\.?|m\.?a\.?|b\.?s\.?|m\.?s\.?|phd|ph\.?d|bachelor|master|mba|engineer's|diploma|licence|bachelor's|master's|llb|llm|meng|beng)\b/i;

// CERT_RE: certification and vendor-cert keywords. Checked AFTER the experience
// opener so a job title that contains a cert keyword routes correctly.
export const CERT_RE = /\b(certified|certificate|certification|aws|azure|ccna|pmp|scrum|comptia|kubernetes|google cloud)\b/i;

// LANG_LEVEL_RE: proficiency keywords for the languages section.
export const LANG_LEVEL_RE = /\b(native|fluent|professional|conversational|basic|beginner|intermediate|advanced|c1|c2|b1|b2|a1|a2|natif|courant|courant|bilingue|maternelle|muttersprache|fließend)\b/i;

// BULLET_RE: includes en-dash (U+2013) and em-dash (U+2014). The original only
// had en-dash, which caused em-dash bullets to be silently dropped.
export const BULLET_RE = /^\s*(?:[-–—*•·‣▪◦→])\s+/;

// URL_RE: intentionally requires a protocol (https?://) OR a known personal-site
// TLD suffix, so bare technology names like "Node.js" and "Next.js" do not match.
// ".js" is not a real country TLD in widespread personal-site use; excluding it
// prevents the most common false positive. ".co" is real (Colombia) but also a
// startup domain convention; we allow it only with a slash to avoid matching
// "Co." abbreviations.
// Known-safe bare-domain TLDs for personal sites: dev, me, site, design, studio,
// io, co (only with path), net, org.
export const URL_RE_PROTOCOL = /\bhttps?:\/\/(?!\S*(github|linkedin))[\w.-]+\.[a-z]{2,}\S*/i;
export const URL_RE_BARE = /(^|[\s|,;(])([\w-]+\.(dev|me|site|design|studio|io|net|org))\b/im;

// KNOWN_NON_TLD: suffixes that look like TLDs but are tech ecosystem names.
// Used as a post-filter after URL_RE matches.
export const KNOWN_NON_TLD = /\.(js|ts|py|rb|rs|go|jsx|tsx|vue|svelte|css|scss|html)$/i;

// "Present" keyword in multiple languages.
export const PRESENT_RE = /\b(present|current|now|today|présent|actuellement|heute|aktuell|ongoing)\b/i;

// Period range: "2019 - 2022", "2020 to Present", "2020 to Présent".
export const PERIOD_RE = new RegExp(
  "((19|20)\\d{2})\\s*(?:[-–—]|to|bis|au)\\s*((19|20)\\d{2}|" +
  PRESENT_RE.source.replace(/\\b/g, "").replace(/[()]/g, "").replace(/\|/g, "|") +
  ")",
  "i"
);

// ----- name stoplist -----

// Lines that look like document headers rather than a person's name.
// If the first substantial line matches, skip it and look at the next one.
export const NAME_STOPLIST = /^(curriculum vitae|cv|resume|resumé|portfolio|[a-z\s]+ logo|cover letter|lettre de motivation|lebenslauf|bewerbung)$/i;

// Month names (English, French, German) used to strip month names from
// company fields before the year-strip. These appear in date ranges like
// "DataCorp, Jan 2020" and "DataCorp, janvier 2020".
export const MONTH_RE = new RegExp(
  "\\b(jan(?:uary|vier)?|feb(?:ruary|rier)?|mar(?:ch|s)?|apr(?:il)?|may|mai|" +
  "jun(?:e|i)?|jul(?:y)?|aug(?:ust|oût)?|sep(?:tember|tembre)?|" +
  "oct(?:ober|obre)?|nov(?:ember|embre)?|dec(?:ember|embre)?|" +
  "januar|februar|märz|april|juni|juli|august|september|oktober|november|dezember|" +
  "summer|winter|spring|fall|automne|printemps|été|hiver)" +
  "\\b",
  "i"
);

// "at", "@", "for" in English, "chez" in French, "bei" in German.
// Used to detect "Role CONNECTOR Company" lines in experience openers.
export const ROLE_CONNECTOR_RE = /\b(at|@|for|chez|bei)\b/i;

// ----- helper functions shared by both parsers -----

export const cleanWS = (s) => String(s || "").replace(/\s+/g, " ").trim();

// Strip month names and numeric month prefixes that appear before a 4-digit year.
// "DataCorp, Jan 2020"   -> "DataCorp"
// "DataCorp, janvier 2018" -> "DataCorp"
// "DataCorp, 01/2020"    -> "DataCorp"
// The year itself is kept; only the orphaned month fragment is removed so that
// "DataCorp, Jan 2020 - Present" -> "DataCorp" after the year strip in splitRoleCompany.
export function stripMonthBeforeYear(s) {
  // Named months (English, French, German, seasonal) followed by a year.
  let r = s.replace(
    new RegExp("[,\\s]+" + MONTH_RE.source + "[,./\\s]*(?=(19|20)\\d{2})", "gi"),
    " "
  );
  // Numeric months in MM/YYYY or MM-YYYY format: "01/2020", "12-2019".
  r = r.replace(/[,\s]+\d{1,2}[/-](?=(19|20)\d{2})/g, " ");
  return r.replace(/[,\s]+$/, "").trim();
}

// Split "role at company" / "role chez company" / "role bei company" /
// "role | company" / "role, company" from a line that has already had its
// year portion stripped. Returns { role, company }.
export function splitRoleCompany(line) {
  // Strip month names before the year before stripping the year itself, so
  // "DataCorp, Jan 2020 - Present" loses "Jan" and not just "2020".
  let withoutYears = stripMonthBeforeYear(line);
  withoutYears = withoutYears.replace(/\(?\b((19|20)\d{2})\b.*$/, "").trim().replace(/[,|–-]\s*$/, "");

  // Multi-language role connector: at / @ / for (English), chez (French), bei (German)
  let m = withoutYears.match(/^(.+?)\s+(?:at|@|for|chez|bei)\s+(.+)$/i);
  if (m) return { role: cleanWS(m[1]), company: cleanWS(m[2]) };
  m = withoutYears.match(/^(.+?)\s*[|]\s*(.+)$/);
  if (m) return { role: cleanWS(m[1]), company: cleanWS(m[2]) };
  m = withoutYears.match(/^(.+?)\s*,\s*(.+)$/);
  if (m) return { role: cleanWS(m[1]), company: cleanWS(m[2]) };
  return { role: cleanWS(withoutYears), company: "" };
}

// Pull start/end years from a line. Recognises "Présent", "aktuell", etc.
export function splitYears(line) {
  const years = (line.match(YEAR_RE_G) || []);
  const present = PRESENT_RE.test(line);
  return { start: years[0] || "", end: years[1] || (present ? "Present" : "") };
}

// Return true when a line is a known academic-publication opener.
// Heuristic: "Surname, Initial. et al. (YEAR)" or "Author et al. (YEAR)."
// These fire the experience opener (year + comma) unless guarded.
export function looksLikePublication(line) {
  return /\bet\s+al\.?\s*\(\d{4}\)/i.test(line) || /^\[?\d+\]/.test(line);
}
