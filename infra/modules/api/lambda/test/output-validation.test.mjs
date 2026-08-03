import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectDirectorOutput, PREMIUM_DIRECTOR_CONTRACT } from "../output-validation.mjs";
import { DIRECTOR_KIT } from "../../../pipeline/lambda/director-kit.mjs";

const premiumIndex = `<!doctype html><html><head></head><body>
<!-- CINEFOLIO-DIRECTION: The edit table -->
${DIRECTOR_KIT}
<header data-cf-depth="hero"><a href="projects/launch.html">View Work</a></header>
<main>
<section data-cf-depth="work" data-cf-work-index><a href="projects/launch.html">Launch</a></section>
<section data-cf-depth="signature" data-cf-signature><button data-cf-control>Scrub the cut</button><a href="projects/launch.html">Open case study</a></section>
<script>document.querySelector('[data-cf-control]').addEventListener('click',()=>{});</script>
<video muted playsinline preload="auto" poster="assets/hero.jpg"><source src="assets/hero.mp4" type="video/mp4"></video><button aria-label="Pause film">Pause</button>
</main>
<footer data-cf-contact><a href="mailto:person@example.com">Email</a><a href="resume.html">Resume</a></footer>
</body></html>`;

const validFiles = [
  { path: "index.html", html: premiumIndex },
  { path: "resume.html", html: "<!doctype html><html><head><style>@media print{button{display:none}}</style></head><body><button onclick=\"window.print()\">Print</button></body></html>" },
  { path: "projects/launch.html", html: "<!doctype html><html><body><h1>Launch</h1></body></html>" },
];
const uploaded = ["assets/hero.jpg", "assets/hero.mp4"];

test("premium contract id matches the pipeline contract", () => {
  assert.equal(PREMIUM_DIRECTOR_CONTRACT, "premium-depth-v1");
});

test("complete premium cut passes the output gate", () => {
  const out = inspectDirectorOutput(validFiles, uploaded, { strict: true });
  assert.deepEqual(out.errors, []);
  assert.equal(out.stats.depthBeats, 3);
  assert.equal(out.stats.projectLinks, 1);
  assert.equal(out.stats.videos, 1);
});

test("premium gate rejects an inert or modified CineDepth kit", () => {
  const spoofed = validFiles.map((f) => f.path === "index.html"
    ? { ...f, html: f.html.replace(DIRECTOR_KIT, '<script data-cf-kit="depth-v1"></script><style data-cf-kit="depth-v1"></style>') }
    : f);
  assert.ok(inspectDirectorOutput(spoofed, uploaded, { strict: true }).errors.some((e) => e.code === "kit_integrity"));
});

test("premium gate catches missing depth and commercial structure", () => {
  const files = [{ path: "index.html", html: "<!doctype html><html><body><h1>Name</h1></body></html>" }];
  const out = inspectDirectorOutput(files, [], { strict: true });
  const codes = out.errors.map((e) => e.code);
  for (const code of ["missing_resume", "missing_direction", "kit_contract", "missing_depth_beat", "missing_signature_interaction", "missing_signature_control", "missing_signature_bypass", "missing_signature_logic", "missing_work_index", "missing_contact", "missing_reduced_motion", "missing_mobile_fallback", "missing_project_link", "missing_resume_link", "missing_email_link", "missing_video"]) {
    assert.ok(codes.includes(code), code);
  }
});

test("premium gate catches broken relative references", () => {
  const broken = validFiles.map((f) => f.path === "index.html"
    ? { ...f, html: f.html.replace("assets/hero.jpg", "assets/missing.jpg").replace("</head>", '<style>.missing{background:url(assets/missing-bg.jpg)}</style></head>').replace("</main>", '<img srcset="assets/missing-1.jpg 1x, assets/missing-2.jpg 2x" alt=""></main>') }
    : f);
  const out = inspectDirectorOutput(broken, uploaded, { strict: true });
  for (const missing of ["assets/missing.jpg", "assets/missing-bg.jpg", "assets/missing-1.jpg", "assets/missing-2.jpg"]) {
    assert.ok(out.errors.some((e) => e.code === "missing_relative_reference" && e.detail.includes(missing)), missing);
  }
});

test("premium gate checks video attributes", () => {
  const broken = validFiles.map((f) => f.path === "index.html"
    ? { ...f, html: f.html.replace(" muted playsinline preload=\"auto\" poster=\"assets/hero.jpg\"", "") }
    : f);
  const out = inspectDirectorOutput(broken, uploaded, { strict: true });
  assert.equal(out.errors.filter((e) => e.code === "video_attribute").length, 4);
});

test("premium gate rejects temporary remote generated media but allows exact customer media", () => {
  const remote = validFiles.map((f) => f.path === "index.html"
    ? { ...f, html: f.html.replace("assets/hero.jpg", "https://tmp.example/poster.jpg").replace("assets/hero.mp4", "https://tmp.example/hero.mp4") }
    : f);
  const rejected = inspectDirectorOutput(remote, [], { strict: true });
  assert.equal(rejected.errors.filter((e) => e.code === "external_generated_media").length, 2);
  const allowed = inspectDirectorOutput(remote, [], {
    strict: true,
    allowedRemoteMedia: ["https://tmp.example/poster.jpg", "https://tmp.example/hero.mp4"],
  });
  assert.deepEqual(allowed.errors, []);
});

test("premium gate rejects remote generated images, CSS media, and external JavaScript", () => {
  const remote = validFiles.map((f) => f.path === "index.html"
    ? { ...f, html: f.html.replace("</head>", '<style>.remote{background:url(https://tmp.example/bg.jpg)}@import "https://tmp.example/theme.css";</style></head>').replace("</main>", '<img src="https://tmp.example/still.jpg" alt=""><script src="https://tmp.example/runtime.js"></script><script>import("https://tmp.example/module.js")</script></main>') }
    : f);
  const out = inspectDirectorOutput(remote, uploaded, { strict: true });
  assert.equal(out.errors.filter((e) => e.code === "external_generated_media").length, 2);
  assert.equal(out.errors.filter((e) => e.code === "external_javascript").length, 1);
  assert.equal(out.errors.filter((e) => e.code === "external_dependency").length, 2);
});

test("premium markers in comments or hidden elements do not satisfy the gate", () => {
  const commented = validFiles.map((f) => f.path === "index.html"
    ? { ...f, html: f.html.replace('data-cf-depth="hero"', "") + '<!-- <section data-cf-depth="hero"></section> -->' }
    : f);
  assert.ok(inspectDirectorOutput(commented, uploaded, { strict: true }).errors.some((e) => e.code === "missing_depth_beat" && e.detail === "hero"));

  const hidden = validFiles.map((f) => f.path === "index.html"
    ? { ...f, html: f.html.replace("data-cf-work-index", "data-cf-work-index hidden") }
    : f);
  assert.ok(inspectDirectorOutput(hidden, uploaded, { strict: true }).errors.some((e) => e.code === "missing_work_index"));

  const ancestor = validFiles.map((f) => f.path === "index.html"
    ? { ...f, html: f.html.replace('<header data-cf-depth="hero">', '<div hidden><header data-cf-depth="hero">').replace("</header>", "</header></div>") }
    : f);
  assert.ok(inspectDirectorOutput(ancestor, uploaded, { strict: true }).errors.some((e) => e.code === "missing_depth_beat" && e.detail === "hero"));

  const classHidden = validFiles.map((f) => f.path === "index.html"
    ? { ...f, html: f.html.replace("</head>", "<style>.ghost{display:none}</style></head>").replace('<header data-cf-depth="hero">', '<header class="ghost" data-cf-depth="hero">') }
    : f);
  assert.ok(inspectDirectorOutput(classHidden, uploaded, { strict: true }).errors.some((e) => e.code === "missing_depth_beat" && e.detail === "hero"));

  const template = validFiles.map((f) => f.path === "index.html"
    ? { ...f, html: f.html.replace('data-cf-depth="hero"', "") + '<template><header data-cf-depth="hero"></header></template>' }
    : f);
  assert.ok(inspectDirectorOutput(template, uploaded, { strict: true }).errors.some((e) => e.code === "missing_depth_beat" && e.detail === "hero"));
});

test("premium resume must be print-ready", () => {
  const weak = validFiles.map((f) => f.path === "resume.html"
    ? { ...f, html: "<!doctype html><html><body>Resume</body></html>" }
    : f);
  const codes = inspectDirectorOutput(weak, uploaded, { strict: true }).errors.map((e) => e.code);
  assert.ok(codes.includes("resume_print_styles"));
  assert.ok(codes.includes("resume_print_control"));
});

test("legacy output keeps structural reference safety without premium markers", () => {
  const legacy = [{ path: "index.html", html: "<!doctype html><html><body><a href=\"https://example.com\">Work</a></body></html>" }];
  assert.deepEqual(inspectDirectorOutput(legacy, [], { strict: false }).errors, []);
  const broken = [{ path: "index.html", html: "<!doctype html><html><body><img src=\"assets/nope.jpg\"></body></html>" }];
  const inspected = inspectDirectorOutput(broken, [], { strict: false });
  assert.deepEqual(inspected.errors, []);
  assert.equal(inspected.warnings[0].code, "missing_relative_reference");
});
