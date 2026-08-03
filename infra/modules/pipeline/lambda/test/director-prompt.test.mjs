import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { DIRECTOR_KIT } from "../director-kit.mjs";
import { buildDirectorInstructions, DELIVERY_LIMITS, DIRECTION_MATRIX, DIRECTOR_PROMPT_VERSION } from "../director-prompt.mjs";
import { PREMIUM_DIRECTOR_CONTRACT, PREMIUM_DIRECTOR_KIT_SHA256 } from "../../../api/lambda/output-validation.mjs";

const prompt = buildDirectorInstructions();

test("premium Director contract is deterministic and versioned", () => {
  assert.equal(DIRECTOR_PROMPT_VERSION, "premium-depth-v1");
  assert.equal(DIRECTOR_PROMPT_VERSION, PREMIUM_DIRECTOR_CONTRACT);
  assert.equal(prompt, buildDirectorInstructions());
  assert.ok(prompt.length > 6000);
});

test("premium Director requires coherent depth, proof, and conversion", () => {
  for (const marker of [
    "CINEFOLIO-DIRECTION", 'data-cf-depth="hero"', 'data-cf-depth="work"',
    'data-cf-depth="signature"', "data-cf-signature", "data-cf-control", "data-cf-work-index",
    "data-cf-contact", "projects/{slug}.html", "resume.html",
  ]) assert.ok(prompt.includes(marker), marker);
  assert.match(prompt, /one central spatial metaphor/i);
  assert.match(prompt, /Never invent client work/i);
  assert.match(prompt, /plain email link/i);
});

test("premium Director protects mobile, accessibility, and likeness", () => {
  for (const phrase of ["360 to 390 pixels", "44px", "prefers-reduced-motion", "visible focus", "muted", "playsinline", 'preload="auto"', "poster", "assets.photo", "assets.covers"]) {
    assert.ok(prompt.includes(phrase), phrase);
  }
  assert.match(prompt, /Never generate, alter, or substitute a human likeness/i);
  assert.match(prompt, /no horizontal overflow/i);
});

test("premium Director knows every production limit", () => {
  assert.equal(DELIVERY_LIMITS.minutes, 25);
  assert.equal(DELIVERY_LIMITS.maxFiles, 30);
  assert.equal(DELIVERY_LIMITS.maxBundleBytes, 3 * 1024 * 1024);
  assert.equal(DELIVERY_LIMITS.maxAssetBytes, 8 * 1024 * 1024);
  for (const phrase of ["25 minutes", "30 files", "3MB", "8MB", "upload.url", "deliver.url"]) assert.ok(prompt.includes(phrase), phrase);
});

test("direction matrix covers commercial portfolio archetypes", () => {
  for (const key of ["film", "performance", "photography", "design", "engineering", "product", "executive", "architecture", "fallback"]) {
    assert.ok(DIRECTION_MATRIX[key]?.length > 30, key);
  }
  assert.match(DIRECTION_MATRIX.engineering, /never a generic particle globe/i);
});

test("API premium gate hash matches the exact CineDepth kit", () => {
  assert.equal(createHash("sha256").update(DIRECTOR_KIT).digest("hex"), PREMIUM_DIRECTOR_KIT_SHA256);
});

test("pipeline stamps and packages the premium Director contract", () => {
  const pipeline = readFileSync(new URL("../pipeline.mjs", import.meta.url), "utf8");
  const terraform = readFileSync(new URL("../../main.tf", import.meta.url), "utf8");
  assert.match(pipeline, /directorContract: DIRECTOR_PROMPT_VERSION/);
  assert.match(pipeline, /instructions: buildDirectorInstructions\(\)/);
  assert.match(pipeline, /kit: DIRECTOR_KIT/);
  assert.match(terraform, /filename = "director-kit\.mjs"/);
  assert.match(terraform, /filename = "director-prompt\.mjs"/);
});

test("new Director prose contains no em dash", () => {
  assert.doesNotMatch(prompt, /—/);
});
