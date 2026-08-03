import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { DIRECTOR_KIT, DIRECTOR_KIT_VERSION } from "../director-kit.mjs";

test("CineDepth kit is deterministic, inline, and versioned", () => {
  assert.equal(DIRECTOR_KIT_VERSION, "depth-v1");
  assert.equal(DIRECTOR_KIT, String(DIRECTOR_KIT));
  assert.equal((DIRECTOR_KIT.match(/data-cf-kit="depth-v1"/g) || []).length, 2);
  assert.match(DIRECTOR_KIT, /<script data-cf-kit/);
  assert.match(DIRECTOR_KIT, /<style data-cf-kit/);
  assert.doesNotMatch(DIRECTOR_KIT, /<script[^>]+src=/i);
});

test("CineDepth kit carries the premium interaction grammar", () => {
  for (const marker of ["--scroll", "--pin", "[data-reveal]", "[data-pin]", "video[data-scrub]", "[data-depth]", "[data-tilt]", "[data-depth-stage]", "[data-depth-plane]"]) {
    assert.ok(DIRECTOR_KIT.includes(marker), marker);
  }
  assert.match(DIRECTOR_KIT, /requestAnimationFrame/);
  assert.match(DIRECTOR_KIT, /IntersectionObserver/);
  assert.match(DIRECTOR_KIT, /DOMContentLoaded/);
  assert.match(DIRECTOR_KIT, /document\.readyState/);
});

test("CineDepth initializes when pasted in head before the DOM is ready", () => {
  const script = DIRECTOR_KIT.match(/<script[^>]*>([\s\S]*?)<\/script>/i)?.[1];
  assert.ok(script);
  const listeners = new Map();
  const properties = new Map();
  const media = { matches: false, addEventListener() {} };
  const context = {
    document: {
      readyState: "loading",
      documentElement: { style: { setProperty: (k, v) => properties.set(k, v) } },
      body: { scrollHeight: 1200 },
      querySelectorAll: () => [],
    },
    innerHeight: 800,
    scrollY: 100,
    matchMedia: () => media,
    requestAnimationFrame: (fn) => { fn(); return 1; },
    addEventListener: (name, fn) => listeners.set(name, fn),
  };
  context.window = context;
  runInNewContext(script, context);
  assert.ok(listeners.has("DOMContentLoaded"));
  assert.equal(listeners.has("scroll"), false);
  listeners.get("DOMContentLoaded")();
  assert.ok(listeners.has("scroll"));
  assert.ok(listeners.has("resize"));
  assert.equal(properties.get("--scroll"), "0.2500");
});

test("CineDepth kit has first-class mobile and reduced-motion fallbacks", () => {
  assert.match(DIRECTOR_KIT, /max-width:600px/);
  assert.match(DIRECTOR_KIT, /pointer:coarse/);
  assert.match(DIRECTOR_KIT, /max-height:620px/);
  assert.match(DIRECTOR_KIT, /prefers-reduced-motion:reduce/);
  assert.match(DIRECTOR_KIT, /video\[data-scrub\]\{display:none\}/);
});
