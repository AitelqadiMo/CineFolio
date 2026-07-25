// profileParse.test.mjs: regression tests for the resume parser.
// Each test corresponds to a numbered bug from the audit. They are designed to
// fail against the pre-fix code and pass after the fixes are applied.
// Run with: node --test app/src/templates/profileParse.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseResumeToProfile } from "./profileParse.js";
import {
  splitRoleCompany,
  stripMonthBeforeYear,
  looksLikePublication,
  NAME_STOPLIST,
  BULLET_RE,
} from "./resumeHeuristics.js";

// ---- helpers used in multiple tests ----
const exp0 = (r) => r.experience[0];

// ============================================================
// BUG 1: email address matching .ma TLD becomes education entry
// ============================================================
test("bug1: email with .ma TLD is not routed to education", () => {
  const r = parseResumeToProfile(
    "Abdelhamid Chouraichi\nLead Developer\nabdelhamid@chouraichi.ma\n\n" +
    "Experience\nLead Developer at OCP Group, 2020 - Present"
  );
  assert.equal(r.education.length, 0, "education should be empty when only line with .ma is an email");
  assert.equal(r.identity.email, "abdelhamid@chouraichi.ma");
});

test("bug1: email with .ms TLD is not routed to education", () => {
  const r = parseResumeToProfile("Ana Lima\nDeveloper\nana@company.ms\n\nExperience\nDev at Acme, 2020 - Present");
  assert.equal(r.education.length, 0);
  assert.equal(r.identity.email, "ana@company.ms");
});

test("bug1: email with .ba TLD is not routed to education", () => {
  const r = parseResumeToProfile("Ivo Kovac\nEngineer\nivo@firma.ba\n\nExperience\nEng at Corp, 2021 - Present");
  assert.equal(r.education.length, 0);
  assert.equal(r.identity.email, "ivo@firma.ba");
});

// ============================================================
// BUG 2: technology names like Node.js become links.website
// ============================================================
test("bug2: Node.js does not become links.website", () => {
  const r = parseResumeToProfile("John Dev\nSenior Engineer\n\nSkills: Node.js, Next.js, React");
  assert.notEqual(r.links.website, "Node.js", "Node.js must not be treated as a website");
  assert.notEqual(r.links.website, "Next.js");
});

test("bug2: a real bare .dev domain is still captured", () => {
  const r = parseResumeToProfile("Nadia Benali\nDesigner\nnadia.dev\n\nSkills: Figma, React");
  assert.equal(r.links.website, "nadia.dev");
});

test("bug2: a real https URL is captured as website", () => {
  const r = parseResumeToProfile("Karim Arfaoui\nEngineer\nhttps://karim.io\n\nSkills: Node.js");
  assert.ok(
    r.links.website.includes("karim.io"),
    `expected karim.io, got: ${r.links.website}`
  );
});

test("bug2: .js suffix on bare word is excluded", () => {
  const r = parseResumeToProfile("Alice Sun\nFrontend\n\nBuilt with Vue.js and React.js");
  assert.ok(
    !(/\.js$/.test(r.links.website || "")),
    `bare .js names must not become website, got: "${r.links.website}"`
  );
});

// ============================================================
// BUG 3: month names leak into company field
// ============================================================
test("bug3: English month before year stripped from company (Jan)", () => {
  const r = parseResumeToProfile(
    "Jane Doe\nData Engineer\n\nExperience\nData Engineer at DataCorp, Jan 2020 - Present"
  );
  assert.equal(exp0(r)?.company, "DataCorp");
});

test("bug3: English month before year stripped from company (March)", () => {
  const r = parseResumeToProfile(
    "Sam T\nEng\n\nExperience\nEng at StartupCo, March 2019 - Dec 2022"
  );
  assert.equal(exp0(r)?.company, "StartupCo");
});

test("bug3: French month before year stripped (janvier)", () => {
  const r = parseResumeToProfile(
    "Alice D\nEng\n\nExpérience professionnelle\nDéveloppeur chez Wafabail, janvier 2018 - 2020"
  );
  assert.equal(exp0(r)?.company, "Wafabail");
});

test("bug3: German month before year stripped (März)", () => {
  const r = parseResumeToProfile(
    "Hans M\nEng\n\nErfahrung\nEntwickler bei TechGmbH, März 2017 - 2019"
  );
  assert.equal(exp0(r)?.company, "TechGmbH");
});

test("bug3: seasonal word before year stripped (Summer)", () => {
  const r = parseResumeToProfile(
    "Jo B\nIntern\n\nExperience\nSoftware Intern at StartupCo, Summer 2021 - Present"
  );
  assert.equal(exp0(r)?.company, "StartupCo");
});

test("bug3: numeric month/year format does not leak (01/2020)", () => {
  // "DataCorp, 01/2020" - the slash-date should not add "01/" to company
  const r = parseResumeToProfile(
    "Jo B\nEng\n\nExperience\nEngineer at DataCorp, 01/2020 - Present"
  );
  const company = exp0(r)?.company || "";
  assert.ok(
    !company.includes("01/"),
    `company must not include "01/", got: "${company}"`
  );
});

// stripMonthBeforeYear unit test for bug 3.
// The function strips the month fragment before the year; the year itself
// is left in the string (the caller's year-strip removes it separately).
test("bug3: stripMonthBeforeYear helper strips month name before year", () => {
  // Month name gone; year still present (the caller's year-strip removes it).
  assert.ok(!/Jan/.test(stripMonthBeforeYear("DataCorp, Jan 2020")), "Jan should be gone");
  assert.ok(!/Summer/.test(stripMonthBeforeYear("StartupCo, Summer 2021")), "Summer should be gone");
  assert.ok(!/janvier/.test(stripMonthBeforeYear("Wafabail, janvier 2018")), "janvier should be gone");
  // Numeric month format
  assert.ok(!/01\//.test(stripMonthBeforeYear("DataCorp, 01/2020")), "01/ should be gone");
});

// ============================================================
// BUG 4: French and German CVs largely fail
// ============================================================
test("bug4: French section heading Expérience professionnelle routes to experience", () => {
  const r = parseResumeToProfile(
    "Alice Dupont\nDéveloppeur\n\nExpérience professionnelle\nLead Developer chez OCP Group, 2020 - Présent"
  );
  assert.ok(r.experience.length > 0, "experience should be populated");
  assert.equal(exp0(r)?.company, "OCP Group");
});

test("bug4: French connector chez extracts company correctly", () => {
  const r = parseResumeToProfile(
    "Alice D\nEng\n\nExpérience professionnelle\nLead Developer chez OCP Group, 2020 - Présent"
  );
  assert.equal(exp0(r)?.role, "Lead Developer");
  assert.equal(exp0(r)?.company, "OCP Group");
});

test("bug4: Présent (accented) is recognised as present end-date", () => {
  const r = parseResumeToProfile(
    "A B\nEng\n\nExpérience professionnelle\nDev chez Corp, 2021 - Présent"
  );
  assert.equal(exp0(r)?.end, "Present");
});

test("bug4: German section heading Erfahrung routes to experience", () => {
  const r = parseResumeToProfile(
    "Hans Müller\nIngenieur\n\nErfahrung\nEntwickler bei TechGmbH, 2019 - 2022"
  );
  assert.ok(r.experience.length > 0, "experience should be populated");
  assert.equal(exp0(r)?.company, "TechGmbH");
});

test("bug4: German connector bei extracts company correctly", () => {
  const r = parseResumeToProfile(
    "Hans M\nEng\n\nErfahrung\nEntwickler bei TechGmbH, 2019 - 2022"
  );
  assert.equal(exp0(r)?.role, "Entwickler");
  assert.equal(exp0(r)?.company, "TechGmbH");
});

test("bug4: French Formation heading routes to education", () => {
  const r = parseResumeToProfile(
    "Alice D\nEng\n\nFormation\nLicence en Informatique, Université Mohammed V, 2015 - 2018"
  );
  assert.ok(r.education.length > 0, "education should be populated");
  assert.match(r.education[0]?.degree, /Licence/i);
});

test("bug4: French Licence degree keyword is recognised", () => {
  const r = parseResumeToProfile(
    "Alice D\nEng\n\nEducation\nLicence en Informatique, Université Mohammed V, 2015"
  );
  assert.ok(r.education.length > 0);
  assert.match(r.education[0]?.degree, /Licence/i);
});

test("bug4: German Ausbildung heading routes to education", () => {
  const r = parseResumeToProfile(
    "Hans M\nEng\n\nAusbildung\nBachelor Informatik, TU Berlin, 2012 - 2016"
  );
  assert.ok(r.education.length > 0);
  assert.match(r.education[0]?.degree || "", /Bachelor/i);
});

test("bug4: full French CV end-to-end (real user case)", () => {
  const frCV = [
    "Curriculum Vitae",
    "",
    "Abdelhamid Chouraichi",
    "Développeur Lead",
    "abdelhamid@chouraichi.ma",
    "Casablanca, Maroc",
    "https://abdelhamid-chouraichi.cinefolio.dev",
    "",
    "Expérience professionnelle",
    "Lead Developer chez OCP Group, 2020 - Présent",
    "— Dirigé une équipe de 6 développeurs",
    "",
    "Formation",
    "Licence en Informatique",
    "Université Mohammed V",
    "2015 - 2018",
    "",
    "Langues",
    "Arabe: Natif",
    "Français: Courant",
    "",
    "Certifications",
    "AWS Certified Developer, Amazon, 2021",
  ].join("\n");

  const r = parseResumeToProfile(frCV);

  // name: skip "Curriculum Vitae" header
  assert.equal(r.identity.name, "Abdelhamid Chouraichi");
  // email
  assert.equal(r.identity.email, "abdelhamid@chouraichi.ma");
  // education: not the email address
  assert.ok(r.education.every((e) => !/@/.test(e.degree)), "email must not appear in education");
  // education: Licence found with school and years
  assert.equal(r.education[0]?.degree, "Licence en Informatique");
  assert.equal(r.education[0]?.school, "Université Mohammed V");
  assert.equal(r.education[0]?.years, "2015 - 2018");
  // experience: OCP Group via "chez"
  assert.equal(exp0(r)?.company, "OCP Group");
  assert.equal(exp0(r)?.end, "Present");
  // certifications
  assert.ok(r.certifications.length > 0, "AWS cert should be captured");
  assert.equal(r.certifications[0]?.issuer, "Amazon");
  // languages
  assert.ok(r.languages.some((l) => /arabe/i.test(l.name)));
  assert.ok(r.languages.some((l) => /français/i.test(l.name)));
});

// ============================================================
// BUG 5: publications become experience / PhD bullet as education
// ============================================================
test("bug5: et al. publication line does not become experience entry", () => {
  const r = parseResumeToProfile(
    "Dr. Ahmed Al-Rashid\nProfessor\n\n" +
    "Publications\nAl-Rashid, A. et al. (2022). A study.\n\n" +
    "Experience\nProfessor at MIT, 2018 - Present"
  );
  assert.equal(r.experience.length, 1, "only one experience entry (the real job)");
  assert.equal(exp0(r)?.role, "Professor");
  assert.equal(exp0(r)?.company, "MIT");
});

test("bug5: looksLikePublication unit test for et al.", () => {
  assert.equal(looksLikePublication("Al-Rashid, A. et al. (2022). A study."), true);
  assert.equal(looksLikePublication("[1] Al-Rashid 2022"), true);
  assert.equal(looksLikePublication("Software Engineer at Acme, 2020 - Present"), false);
});

test("bug5: PhD bullet inside experience entry is a highlight not education", () => {
  const r = parseResumeToProfile(
    "Jane Doe\nProf\n\n" +
    "Experience\nProfessor at MIT, 2018 - Present\n" +
    "- PhD supervision and research"
  );
  assert.ok(
    exp0(r)?.highlights?.some((h) => /PhD/i.test(h)),
    "PhD mention should be a highlight, not education"
  );
  assert.equal(r.education.length, 0, "no education entries from PhD bullet");
});

// ============================================================
// BUG 6: certification misrouting (comma-separated job title)
// ============================================================
test("bug6: Azure DevOps Engineer job routes to experience not certs", () => {
  const r = parseResumeToProfile(
    "Jane Smith\nEngineer\n\nExperience\nAzure DevOps Engineer, Microsoft, 2022 - Present"
  );
  assert.equal(r.experience.length, 1, "should have 1 experience entry");
  assert.equal(r.certifications.length, 0, "certifications should be empty");
  assert.equal(exp0(r)?.role, "Azure DevOps Engineer");
  assert.equal(exp0(r)?.company, "Microsoft");
});

test("bug6: AWS Solutions Architect job routes to experience not certs", () => {
  const r = parseResumeToProfile(
    "Jane S\nEng\n\nExperience\nAWS Solutions Architect, Amazon, 2019 - 2022"
  );
  assert.equal(r.experience.length, 1);
  assert.equal(r.certifications.length, 0);
});

test("bug6: real AWS cert in Certifications section routes to certifications", () => {
  const r = parseResumeToProfile(
    "Jane S\nEng\n\nCertifications\nAWS Certified Developer, Amazon, 2021"
  );
  assert.equal(r.certifications.length, 1);
  assert.equal(r.experience.length, 0);
});

// ============================================================
// BUG 7: em-dash bullets dropped
// ============================================================
test("bug7: em-dash bullet lines become highlights", () => {
  const r = parseResumeToProfile(
    "Jane S\nEng\n\nExperience\nSoftware Engineer at Acme, 2020 - Present\n" +
    "— Built distributed systems\n— Led team of 8 engineers"
  );
  const h = exp0(r)?.highlights || [];
  assert.ok(h.some((x) => /Built/i.test(x)), "em-dash bullet 1 should be a highlight");
  assert.ok(h.some((x) => /Led/i.test(x)), "em-dash bullet 2 should be a highlight");
});

test("bug7: BULLET_RE matches em-dash (U+2014)", () => {
  assert.ok(BULLET_RE.test("— some bullet"), "BULLET_RE must match em-dash");
});

test("bug7: BULLET_RE matches en-dash (U+2013)", () => {
  assert.ok(BULLET_RE.test("– some bullet"), "BULLET_RE must match en-dash");
});

// ============================================================
// BUG 8: document header becomes name / labelled fields
// ============================================================
test("bug8: Curriculum Vitae header is skipped, real name is next", () => {
  const r = parseResumeToProfile(
    "Curriculum Vitae\nSophie Dubois\nProduct Designer"
  );
  assert.equal(r.identity.name, "Sophie Dubois");
});

test("bug8: Resume header is skipped, real name is next", () => {
  const r = parseResumeToProfile(
    "Resume\nSophie Dubois\nProduct Designer"
  );
  assert.equal(r.identity.name, "Sophie Dubois");
});

test("bug8: CV header is skipped", () => {
  const r = parseResumeToProfile("CV\nSophie Dubois\nDesigner");
  assert.equal(r.identity.name, "Sophie Dubois");
});

test("bug8: NAME_STOPLIST blocks known document headers", () => {
  assert.ok(NAME_STOPLIST.test("Curriculum Vitae"));
  assert.ok(NAME_STOPLIST.test("Resume"));
  assert.ok(NAME_STOPLIST.test("CV"));
  assert.ok(!NAME_STOPLIST.test("Sophie Dubois"));
});

test("bug8: Name: labelled field extracts the name", () => {
  const r = parseResumeToProfile("Name: Sophie Dubois\nTitle: Product Designer");
  assert.equal(r.identity.name, "Sophie Dubois");
});

// ============================================================
// BUG 9: education across multiple lines
// ============================================================
test("bug9: degree on one line, school on next, years on third", () => {
  const r = parseResumeToProfile(
    "Ahmed Hassan\nEngineer\n\nEducation\nBSc Computer Science\nUniversity of Cairo\n2015 - 2019"
  );
  assert.equal(r.education[0]?.degree, "BSc Computer Science");
  assert.equal(r.education[0]?.school, "University of Cairo");
  assert.equal(r.education[0]?.years, "2015 - 2019");
});

test("bug9: degree on one line, school on same line via comma, years on next", () => {
  const r = parseResumeToProfile(
    "Ahmed H\nEng\n\nEducation\nBSc Computer Science, University of Cairo\n2015 - 2019"
  );
  assert.match(r.education[0]?.degree, /BSc/);
  // years come from the year line via look-ahead
  assert.equal(r.education[0]?.years, "2015 - 2019");
});

test("bug9: MSc on one line, school on next", () => {
  const r = parseResumeToProfile(
    "S T\nEng\n\nEducation\nMSc Artificial Intelligence\nETH Zurich\n2018 - 2020"
  );
  assert.equal(r.education[0]?.degree, "MSc Artificial Intelligence");
  assert.equal(r.education[0]?.school, "ETH Zurich");
  assert.equal(r.education[0]?.years, "2018 - 2020");
});

// ============================================================
// BUG 10: Profile.jsx duplicate PDF extractor (structural, no unit test)
// We verify at the module level that Profile.jsx now imports readPdf
// from media.js rather than re-implementing it inline.
// ============================================================
test("bug10: Profile.jsx does not contain an inline PDF extraction loop", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../pages/Profile.jsx", import.meta.url), "utf8");
  assert.ok(
    !src.includes("tcn.items"),
    "Profile.jsx must not contain an inline tcn.items loop; it should use readPdf from media.js"
  );
  assert.ok(
    src.includes("readPdf"),
    "Profile.jsx must import and call readPdf from media.js"
  );
});

// ============================================================
// Additional: engine.js parseProfile shared heuristics
// ============================================================
test("engine.js parseProfile: Node.js is not the website", async () => {
  const { parseProfile } = await import("./engine.js");
  const r = parseProfile("Dev Name\nEngineer\n\nSkills: Node.js, Next.js");
  assert.notEqual(r.links?.website, "Node.js");
  assert.notEqual(r.links?.website, "Next.js");
});

test("engine.js parseProfile: French section headings route correctly", async () => {
  const { parseProfile } = await import("./engine.js");
  const r = parseProfile(
    "Alice D\nEng\n\nExpérience professionnelle\nDev chez Corp, 2020 - Présent"
  );
  assert.ok(r.experience?.length > 0, "experience should be populated from French heading");
});

test("engine.js parseProfile: Curriculum Vitae header not used as name", async () => {
  const { parseProfile } = await import("./engine.js");
  const r = parseProfile("Curriculum Vitae\nSophie Dubois\nDesigner");
  assert.notEqual(r.name, "Curriculum Vitae", "CV header must not become the name");
});

test("engine.js parseProfile: em-dash bullets captured in experience", async () => {
  const { parseProfile } = await import("./engine.js");
  const r = parseProfile(
    "Jane S\nEng\n\nExperience\nSoftware Engineer at Acme, 2020 - Present\n— Built things"
  );
  const exp = (r.experience || [])[0];
  assert.ok(
    (exp?.points || []).some((p) => /Built/i.test(p)),
    "em-dash bullet must produce a highlight in the flat-shape parser"
  );
});

// ============================================================
// Additional edge cases: TLD collisions (.bs, .ms)
// ============================================================
test("edge: email with .bs TLD is not education", () => {
  const r = parseResumeToProfile("Ivan B\nEng\nivan@bank.bs\n\nExperience\nEng at Corp, 2020 - Present");
  assert.equal(r.education.length, 0);
  assert.equal(r.identity.email, "ivan@bank.bs");
});
