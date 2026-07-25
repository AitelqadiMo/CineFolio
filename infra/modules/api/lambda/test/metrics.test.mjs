// node --test: outcome metrics for case-study projects.
// Covers the invariants that matter: absent renders nothing; present renders value
// and label; hostile input is escaped; the cap is enforced; direction renders the
// right glyph (or no glyph when neutral/absent); and every one of the five families
// includes metrics markup in its compiled case page when metrics exist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, compileBundle, metricsBlocks, METRICS_CAP, TEMPLATES } from "../../../../../app/src/templates/engine.js";

// ---------- shared fixture ----------
// a realistic profile whose single project carries metrics
const makeProfile = (metricsOverride) => ({
  name: "Priya Chandra",
  headline: "Product Manager",
  email: "priya@example.com",
  phone: "",
  links: { github: "", linkedin: "", website: "" },
  summary: "Outcome-driven PM.",
  skills: ["SQL", "Figma"],
  experience: [],
  education: [],
  projects: [
    {
      name: "Checkout Revamp",
      summary: "Cut abandonment.",
      desc: "Cut abandonment.",
      role: "PM",
      timeline: "Q1 2024",
      tools: "Figma, SQL",
      problem: "High abandonment rate.",
      process: "A/B testing over 8 weeks.",
      results: "Conversion up 25%.",
      cover: null,
      metrics: metricsOverride,
    },
  ],
});

const withMetrics = makeProfile([
  { value: "25%", label: "checkout conversion", direction: "up" },
  { value: "40k", label: "monthly active users", direction: "neutral" },
  { value: "3.2x", label: "revenue growth", direction: "up" },
]);

const withoutMetrics = makeProfile(undefined);
const withEmptyMetrics = makeProfile([]);

// ---------- metricsBlocks helper: direct unit tests ----------

test("metrics: renders nothing when metrics field is absent", () => {
  assert.equal(metricsBlocks({ name: "X" }, "csmet"), "");
});

test("metrics: renders nothing when metrics is an empty array", () => {
  assert.equal(metricsBlocks({ metrics: [] }, "csmet"), "");
});

test("metrics: renders nothing when metrics is null", () => {
  assert.equal(metricsBlocks({ metrics: null }, "csmet"), "");
});

test("metrics: renders the value and label when a metric is present", () => {
  const html = metricsBlocks({ metrics: [{ value: "25%", label: "conversion" }] }, "csmet");
  assert.ok(html.includes("25%"), "must include the value");
  assert.ok(html.includes("conversion"), "must include the label");
});

test("metrics: escapes hostile content in value", () => {
  const html = metricsBlocks({ metrics: [{ value: "<script>alert(1)</script>", label: "safe" }] }, "csmet");
  assert.doesNotMatch(html, /<script>/, "raw <script> must not appear");
  assert.ok(html.includes("&lt;script&gt;"), "value must be escaped");
});

test("metrics: escapes hostile content in label", () => {
  const html = metricsBlocks({ metrics: [{ value: "99%", label: "<img onerror=alert(1)>" }] }, "csmet");
  assert.doesNotMatch(html, /<img/, "raw <img> must not appear in label");
  assert.ok(html.includes("&lt;img"), "label must be escaped");
});

test("metrics: escapes ampersand in value", () => {
  const html = metricsBlocks({ metrics: [{ value: "Q1 & Q2", label: "revenue" }] }, "csmet");
  assert.ok(html.includes("Q1 &amp; Q2"), "ampersand must be escaped");
});

test("metrics: escapes quotes in label (safe for inline attribute contexts)", () => {
  const html = metricsBlocks({ metrics: [{ value: "1x", label: 'say "hello"' }] }, "csmet");
  assert.ok(html.includes("&quot;"), "quotes must be escaped");
});

test("metrics: up direction renders an up-arrow glyph", () => {
  const html = metricsBlocks({ metrics: [{ value: "25%", label: "x", direction: "up" }] }, "m");
  assert.ok(html.includes("↑"), "up direction must show up-arrow");
});

test("metrics: down direction renders a down-arrow glyph", () => {
  const html = metricsBlocks({ metrics: [{ value: "40%", label: "churn", direction: "down" }] }, "m");
  assert.ok(html.includes("↓"), "down direction must show down-arrow");
});

test("metrics: neutral direction renders no directional glyph", () => {
  const html = metricsBlocks({ metrics: [{ value: "40k", label: "users", direction: "neutral" }] }, "m");
  assert.doesNotMatch(html, /[↑↓]/, "neutral must have no arrow");
});

test("metrics: absent direction renders no directional glyph", () => {
  const html = metricsBlocks({ metrics: [{ value: "40k", label: "users" }] }, "m");
  assert.doesNotMatch(html, /[↑↓]/, "absent direction must have no arrow");
});

test("metrics: direction arrow is aria-hidden so screen readers skip the glyph", () => {
  const html = metricsBlocks({ metrics: [{ value: "25%", label: "cv", direction: "up" }] }, "m");
  assert.ok(html.includes('aria-hidden="true"'), "glyph must be aria-hidden");
});

test(`metrics: cap enforces a maximum of ${METRICS_CAP} metrics`, () => {
  const many = Array.from({ length: METRICS_CAP + 3 }, (_, i) => ({ value: `${i}%`, label: `metric ${i}` }));
  const html = metricsBlocks({ metrics: many }, "csmet");
  // count occurrences of the wrapper div's children: each cell is a <div>
  const count = (html.match(/<div>/g) || []).length;
  assert.equal(count, METRICS_CAP, `must render exactly ${METRICS_CAP} cells`);
});

test("metrics: outer container uses the provided class name", () => {
  const html = metricsBlocks({ metrics: [{ value: "1", label: "x" }] }, "my-custom-class");
  assert.ok(html.startsWith('<div class="my-custom-class">'), "container must carry the provided class");
});

// ---------- byte-identical guarantee: absent/empty metrics leave output unchanged ----------

test("metrics byte-identical: absent metrics vs empty array compile identically for all families/palettes", () => {
  for (const t of TEMPLATES) {
    for (const pal of t.palettes) {
      const absent = compile(t.id, pal.id, withoutMetrics, {});
      const empty  = compile(t.id, pal.id, withEmptyMetrics, {});
      assert.equal(absent, empty, `${t.id}/${pal.id}: absent vs empty must be byte-identical`);
    }
  }
});

test("metrics byte-identical: bundle case pages also byte-identical when metrics absent vs empty", () => {
  for (const t of TEMPLATES) {
    for (const pal of t.palettes) {
      const absentPages = compileBundle(t.id, pal.id, withoutMetrics, {}).files.filter((f) => f.html);
      const emptyPages  = compileBundle(t.id, pal.id, withEmptyMetrics, {}).files.filter((f) => f.html);
      assert.equal(absentPages.length, emptyPages.length, `${t.id}/${pal.id}: page count must match`);
      for (let i = 0; i < absentPages.length; i++) {
        assert.equal(absentPages[i].html, emptyPages[i].html,
          `${t.id}/${pal.id}: case page[${i}] must be byte-identical`);
      }
    }
  }
});

// ---------- per-family: metrics appear in compiled case pages when present ----------

test("metrics family monolith: case page includes metric value and label", () => {
  const { files } = compileBundle("monolith", "jersey", withMetrics, {});
  const casePage = files.find((f) => f.path && f.path.includes("projects/"));
  assert.ok(casePage, "bundle must include a case page");
  assert.ok(casePage.html.includes("25%"), "monolith case must show metric value");
  assert.ok(casePage.html.includes("checkout conversion"), "monolith case must show metric label");
});

test("metrics family monolith: metrics container class present on case page", () => {
  const { files } = compileBundle("monolith", "jersey", withMetrics, {});
  const casePage = files.find((f) => f.path && f.path.includes("projects/"));
  assert.ok(casePage.html.includes('class="csmet"'), "monolith case must carry .csmet container");
});

test("metrics family editorial: case page includes metric value and label", () => {
  const { files } = compileBundle("editorial", "bone", withMetrics, {});
  const casePage = files.find((f) => f.path && f.path.includes("projects/"));
  assert.ok(casePage, "bundle must include a case page");
  assert.ok(casePage.html.includes("25%"), "editorial case must show metric value");
  assert.ok(casePage.html.includes("checkout conversion"), "editorial case must show metric label");
});

test("metrics family editorial: metrics container class present on case page", () => {
  const { files } = compileBundle("editorial", "bone", withMetrics, {});
  const casePage = files.find((f) => f.path && f.path.includes("projects/"));
  assert.ok(casePage.html.includes('class="csmet2"'), "editorial case must carry .csmet2 container");
});

test("metrics family terminal: case page includes metric value and label", () => {
  const { files } = compileBundle("terminal", "phosphor", withMetrics, {});
  const casePage = files.find((f) => f.path && f.path.includes("projects/"));
  assert.ok(casePage, "bundle must include a case page");
  assert.ok(casePage.html.includes("25%"), "terminal case must show metric value");
  assert.ok(casePage.html.includes("checkout conversion"), "terminal case must show metric label");
});

test("metrics family terminal: metrics appear under a metrics heading (console idiom, ## prefix via CSS)", () => {
  const { files } = compileBundle("terminal", "phosphor", withMetrics, {});
  const casePage = files.find((f) => f.path && f.path.includes("projects/"));
  // the terminal case renderer outputs <h2>metrics</h2>; the ## prefix lives in CSS
  // .blk h2:before{content:"## "} so the HTML text node is just "metrics".
  assert.ok(casePage.html.includes("<h2>metrics</h2>"), "terminal case must use a metrics h2 heading");
});

test("metrics family gallery: case page includes metric value and label", () => {
  const { files } = compileBundle("gallery", "porcelain", withMetrics, {});
  const casePage = files.find((f) => f.path && f.path.includes("projects/"));
  assert.ok(casePage, "bundle must include a case page");
  assert.ok(casePage.html.includes("25%"), "gallery case must show metric value");
  assert.ok(casePage.html.includes("checkout conversion"), "gallery case must show metric label");
});

test("metrics family gallery: metrics container class present on case page", () => {
  const { files } = compileBundle("gallery", "porcelain", withMetrics, {});
  const casePage = files.find((f) => f.path && f.path.includes("projects/"));
  assert.ok(casePage.html.includes('class="csmet"'), "gallery case must carry .csmet container");
});

test("metrics family bento: case page includes metric value and label", () => {
  const { files } = compileBundle("bento", "sorbet", withMetrics, {});
  const casePage = files.find((f) => f.path && f.path.includes("projects/"));
  assert.ok(casePage, "bundle must include a case page");
  assert.ok(casePage.html.includes("25%"), "bento case must show metric value");
  assert.ok(casePage.html.includes("checkout conversion"), "bento case must show metric label");
});

test("metrics family bento: metrics container class present on case page", () => {
  const { files } = compileBundle("bento", "sorbet", withMetrics, {});
  const casePage = files.find((f) => f.path && f.path.includes("projects/"));
  assert.ok(casePage.html.includes('class="metgrid"'), "bento case must carry .metgrid container");
});

// ---------- no metrics must leave no metrics markup on case pages ----------

test("metrics: case page with no metrics has no csmet, csmet2, wmet, or metgrid container", () => {
  for (const t of TEMPLATES) {
    const { files } = compileBundle(t.id, t.palettes[0].id, withoutMetrics, {});
    const casePage = files.find((f) => f.path && f.path.includes("projects/"));
    if (!casePage) continue; // no case page for this template/profile combo (shouldn't happen)
    // none of the metrics container classes must appear when there are no metrics
    for (const cls of ["csmet", "csmet2", "wmet", "metgrid"]) {
      assert.doesNotMatch(casePage.html, new RegExp(`class="${cls}"`),
        `${t.id}: case page must not have .${cls} when project has no metrics`);
    }
  }
});

// ---------- direction: both directions are correct in a full compile ----------

test("metrics compile: up arrow appears in compiled page when direction is up", () => {
  const profile = makeProfile([{ value: "25%", label: "cv", direction: "up" }]);
  const html = compile("monolith", "jersey", profile, {});
  assert.ok(html.includes("↑"), "up direction must show up-arrow in compiled page");
});

test("metrics compile: down arrow appears in compiled page when direction is down", () => {
  const profile = makeProfile([{ value: "40%", label: "churn", direction: "down" }]);
  const html = compile("monolith", "jersey", profile, {});
  assert.ok(html.includes("↓"), "down direction must show down-arrow in compiled page");
});

test("metrics compile: neutral direction adds no arrow in compiled page", () => {
  const profile = makeProfile([{ value: "40k", label: "users", direction: "neutral" }]);
  const html = compile("monolith", "jersey", profile, {});
  // the label and value must appear; the arrow glyphs must not
  assert.ok(html.includes("40k"), "value must appear");
  assert.doesNotMatch(html, /[↑↓]/, "neutral direction must have no arrow");
});
