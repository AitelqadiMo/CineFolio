// node --test: projectLinks, the outbound-proof block. Three contracts:
// 1) a project with no links renders EXACTLY "" (the byte-identical guarantee
//    for every existing portfolio, same doctrine as metricsBlocks);
// 2) valid http(s) links render as real anchors with rel="noopener noreferrer";
// 3) author-controlled URLs that are not absolute http(s) (javascript:, data:,
//    relative paths, prose) are DROPPED, never escaped-and-hoped into an href.
import { test } from "node:test";
import assert from "node:assert/strict";
import { projectLinks } from "./shared.js";
import { TEMPLATES, compile, parseProfile } from "./engine.js";

test("no links renders exactly the empty string", () => {
  assert.equal(projectLinks({}, "plinks"), "");
  assert.equal(projectLinks({ name: "X", problem: "p" }, "plinks"), "");
  assert.equal(projectLinks({ link: "", repo: "" }, "plinks"), "");
  assert.equal(projectLinks({ link: "   " }, "plinks"), "");
});

test("valid links render as safe anchors", () => {
  const html = projectLinks({ link: "https://thing.example/app", repo: "http://github.com/x/y" }, "plinks");
  assert.ok(html.startsWith('<div class="plinks"'));
  assert.ok(html.includes('href="https://thing.example/app"'));
  assert.ok(html.includes('href="http://github.com/x/y"'));
  const anchors = html.match(/<a /g) || [];
  assert.equal(anchors.length, 2);
  assert.equal((html.match(/rel="noopener noreferrer"/g) || []).length, 2, "every anchor is noopener");
  assert.ok(html.includes("View it live"), "the live label renders");
  assert.ok(html.includes("See the code"), "the repo label renders");
});

test("unsafe or non-absolute URLs are dropped, not rendered", () => {
  // javascript: and data: schemes, relative paths, and prose must never reach an href
  assert.equal(projectLinks({ link: "javascript:alert(1)" }, "plinks"), "");
  assert.equal(projectLinks({ link: "data:text/html,hi" }, "plinks"), "");
  assert.equal(projectLinks({ link: "/relative/path" }, "plinks"), "");
  assert.equal(projectLinks({ link: "see my website" }, "plinks"), "");
  // one bad + one good: only the good one renders
  const mixed = projectLinks({ link: "javascript:alert(1)", repo: "https://github.com/x/y" }, "plinks");
  assert.ok(mixed.includes("github.com/x/y"));
  assert.ok(!mixed.toLowerCase().includes("javascript:"), "the bad scheme is gone entirely");
});

// Families whose INDEX page renders case studies inline. Several families route
// case studies to sub-pages that compile() does not return, so their anchor
// render is exercised via the shared call site next to metricsBlocks (pinned
// above) rather than here; a full-bundle assertion is a noted follow-up.
const INLINE = ["monolith", "terminal", "editorial"];
test("index-inline families compile a linked case study to output carrying the anchor", () => {
  const profile = parseProfile("Test User\nEngineer building things.", { name: "Test User", headline: "Engineer" });
  profile.projects = [{
    name: "Shipped Thing", summary: "It ships.", role: "Lead", problem: "It was broken.",
    process: "Fixed it.", results: "It works.", link: "https://shipped.example/",
  }];
  for (const t of TEMPLATES.filter((x) => INLINE.includes(x.id))) {
    const html = compile(t.id, t.palettes[0].id, profile, {});
    assert.ok(html.includes('href="https://shipped.example/"'), `${t.id} renders the live link`);
  }
});

test("every template family compiles a LINKLESS case study with zero plinks residue", () => {
  const profile = parseProfile("Test User\nEngineer building things.", { name: "Test User", headline: "Engineer" });
  profile.projects = [{ name: "Quiet Thing", summary: "No links.", role: "Lead", problem: "P", process: "Pr", results: "R" }];
  for (const t of TEMPLATES) {
    const html = compile(t.id, t.palettes[0].id, profile, {});
    assert.ok(!html.includes("plinks"), `${t.id} emits no links container for a linkless project`);
  }
});
