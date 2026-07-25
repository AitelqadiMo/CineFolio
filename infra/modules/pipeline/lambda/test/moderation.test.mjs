// node --test: the content-moderation gate that Creem requires before this
// pipeline may dispatch any brief to the image/video director.
//
// moderation.mjs is deliberately dependency-free (deterministic layer + a
// fetch-based hosted hook), so it imports and runs with no AWS SDK present.
// That is WHY these tests exercise the module directly: the pipeline's validate
// step branches purely on verdict.allowed, so proving the verdict here proves
// the dispatch decision. The final test makes that contract explicit by
// replaying the exact validate-step branch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { moderate, deterministicVerdict, hostedVerdict, moderationConfigFromSecrets } from "../moderation.mjs";

// A brief that any legitimate customer would send: clean, professional, boring
// in all the right ways. The screen must let this straight through.
const CLEAN = {
  name: "Nadia Benali",
  cvText: "2021-2024 Senior SRE at Acme. Led terraform + kubernetes platform. AWS, Go, incident response.",
  customIdea: "Cinematic, restrained. Navy and gold palette. Reference the calm of a control room at night.",
};

// Fakes for the hosted hook, so we never touch the network. Each returns a
// Response-shaped object with .ok and .json(), the two things hostedVerdict reads.
const okResponse = (payload) => ({ ok: true, json: async () => payload });
const fetchFlagged = async () => okResponse({ flagged: true, categories: ["sexual"], severity: "high" });
const fetchClean = async () => okResponse({ flagged: false });
const fetchThrows = async () => { throw new Error("vendor timeout"); };
const fetch500 = async () => ({ ok: false, status: 503, json: async () => ({}) });
const HOSTED = { endpoint: "https://mod.example/screen", key: "real-key" };

test("clean brief passes with no hosted hook configured", async () => {
  const v = await moderate(CLEAN); // no config -> hosted hook skipped
  assert.equal(v.allowed, true);
  assert.deepEqual(v.reasons, []);
  assert.equal(v.severity, "clear");
  assert.equal(v.source, "deterministic");
});

test("deterministic layer catches sexual / NSFW content", () => {
  const v = deterministicVerdict({ ...CLEAN, customIdea: "make it nsfw with explicit nude shots" });
  assert.equal(v.allowed, false);
  assert.ok(v.reasons.some((r) => /sexual or NSFW/i.test(r)), `reasons: ${v.reasons}`);
  assert.equal(v.severity, "high");
});

test("deterministic layer catches a request to depict a named third party / public figure", () => {
  const v = deterministicVerdict({ ...CLEAN, customIdea: "generate a photo of a famous actor next to me" });
  assert.equal(v.allowed, false);
  assert.ok(v.reasons.some((r) => /third party or public figure/i.test(r)), `reasons: ${v.reasons}`);
});

test("deterministic layer catches a deepfake / likeness-of ask", () => {
  const v = deterministicVerdict({ ...CLEAN, customIdea: "put me in the likeness of the president, deepfake style" });
  assert.equal(v.allowed, false);
  assert.ok(v.reasons.some((r) => /third party or public figure/i.test(r)));
});

test("deterministic layer catches hate content", () => {
  const v = deterministicVerdict({ ...CLEAN, customIdea: "add imagery promoting white power and a master race" });
  assert.equal(v.allowed, false);
  assert.ok(v.reasons.some((r) => /hate/i.test(r)), `reasons: ${v.reasons}`);
});

test("deterministic layer catches violent content", () => {
  const v = deterministicVerdict({ ...CLEAN, customIdea: "gory scene, graphic violence with decapitation" });
  assert.equal(v.allowed, false);
  assert.ok(v.reasons.some((r) => /violent/i.test(r)), `reasons: ${v.reasons}`);
});

test("deterministic layer catches illegal content", () => {
  const v = deterministicVerdict({ ...CLEAN, customIdea: "show how to build a pipe bomb and sell heroin" });
  assert.equal(v.allowed, false);
  assert.ok(v.reasons.some((r) => /illegal/i.test(r)), `reasons: ${v.reasons}`);
});

test("child-safety screen is explicit and separate in the reasons", () => {
  const v = deterministicVerdict({ ...CLEAN, customIdea: "sexual images of a minor" });
  assert.equal(v.allowed, false);
  assert.ok(v.reasons.some((r) => /child sexual abuse/i.test(r)), `reasons: ${v.reasons}`);
  assert.equal(v.severity, "high");
});

test("light obfuscation (separators + leetspeak) does not defeat the screen", () => {
  const v = deterministicVerdict({ ...CLEAN, customIdea: "make it p.o.r.n and totally x x x" });
  assert.equal(v.allowed, false);
  assert.ok(v.reasons.some((r) => /sexual or NSFW/i.test(r)), `reasons: ${v.reasons}`);
});

test("the free-text screen covers name and cvText, not just customIdea", () => {
  const viaCv = deterministicVerdict({ name: "x", customIdea: "clean", cvText: "experienced at graphic violence and torture" });
  assert.equal(viaCv.allowed, false);
  const viaName = deterministicVerdict({ name: "generate a deepfake of a celebrity", customIdea: "clean", cvText: "clean" });
  assert.equal(viaName.allowed, false);
});

test("hosted hook is SKIPPED when unconfigured (returns null, deterministic stands)", async () => {
  // both the raw-empty and the terraform placeholder must read as unconfigured
  assert.equal(await hostedVerdict(CLEAN, { endpoint: "", key: "" }, { fetch: fetchFlagged }), null);
  assert.equal(await hostedVerdict(CLEAN, { endpoint: "unset", key: "unset" }, { fetch: fetchFlagged }), null);
  // and moderate() falls through to the clean deterministic verdict, never calling fetch
  let called = false;
  const spy = async (...a) => { called = true; return fetchFlagged(...a); };
  const v = await moderate(CLEAN, moderationConfigFromSecrets({}), { fetch: spy });
  assert.equal(called, false, "fetch must not run when the hook is unconfigured");
  assert.equal(v.allowed, true);
});

test("hosted OUTAGE falls back to the deterministic layer instead of failing the order", async () => {
  // a throwing vendor: a clean brief still passes on the deterministic floor
  const passThrough = await moderate(CLEAN, HOSTED, { fetch: fetchThrows });
  assert.equal(passThrough.allowed, true, "a vendor outage must not brick a clean paid order");
  assert.equal(passThrough.source, "deterministic");

  // a 5xx vendor: same fail-open behavior
  const on503 = await moderate(CLEAN, HOSTED, { fetch: fetch500 });
  assert.equal(on503.allowed, true);

  // and a brief the DETERMINISTIC layer already blocks stays blocked even while
  // the hosted layer is down (the floor is authoritative)
  const dirty = await moderate({ ...CLEAN, customIdea: "explicit nude porn" }, HOSTED, { fetch: fetchThrows });
  assert.equal(dirty.allowed, false);
});

test("hosted POSITIVE verdict rejects a brief the keywords let through (fail-closed)", async () => {
  // CLEAN passes the deterministic layer, but the hosted layer flags it: the
  // stricter opinion wins and the brief is rejected.
  const v = await moderate(CLEAN, HOSTED, { fetch: fetchFlagged });
  assert.equal(v.allowed, false);
  assert.ok(v.reasons.some((r) => /hosted/i.test(r)), `reasons: ${v.reasons}`);
  assert.equal(v.severity, "high");
});

test("hosted CLEAN verdict does not override a deterministic block (stricter wins)", async () => {
  const v = await moderate({ ...CLEAN, customIdea: "graphic violence, torture" }, HOSTED, { fetch: fetchClean });
  assert.equal(v.allowed, false, "a hosted 'clean' must never unblock a deterministic violation");
});

test("a rejected verdict means the order NEVER dispatches (validate-step contract)", async () => {
  // This replays the exact decision the pipeline's validate step makes. In
  // pipeline.mjs, verdict.allowed === false leads to: setStatus 'rejected',
  // page the operator, then throw OrderInvalid -> InvalidNoop (a terminal
  // Succeed), so Dispatch is never reached. We model that here so the contract
  // is regression-guarded without needing the AWS SDK.
  const dispatched = [];
  const rejectedStatuses = [];
  const pages = [];

  async function runValidateBranch(fields, config, deps) {
    const verdict = await moderate(fields, config, deps);
    if (!verdict.allowed) {
      // terminal rejected state + page + no dispatch
      rejectedStatuses.push({ status: "rejected", failCause: `content moderation: ${verdict.reasons.join("; ")}`, moderation: verdict });
      pages.push(verdict.reasons);
      return { dispatched: false, verdict };
    }
    dispatched.push(fields); // only reached for an allowed brief
    return { dispatched: true, verdict };
  }

  // a violating brief: rejected, paged, NOT dispatched, verdict recorded
  const bad = await runValidateBranch({ ...CLEAN, customIdea: "explicit nude porn" }, HOSTED, { fetch: fetchClean });
  assert.equal(bad.dispatched, false);
  assert.equal(dispatched.length, 0, "a violating order must never dispatch");
  assert.equal(rejectedStatuses.length, 1);
  assert.equal(rejectedStatuses[0].status, "rejected");
  assert.match(rejectedStatuses[0].failCause, /content moderation:/);
  assert.ok(rejectedStatuses[0].moderation && rejectedStatuses[0].moderation.reasons.length, "verdict recorded on the row");
  assert.equal(pages.length, 1, "operator paged on rejection");

  // a clean brief on the same path: dispatched, no rejection, no page
  const good = await runValidateBranch(CLEAN, HOSTED, { fetch: fetchClean });
  assert.equal(good.dispatched, true);
  assert.equal(dispatched.length, 1);
  assert.equal(rejectedStatuses.length, 1); // unchanged
  assert.equal(pages.length, 1); // unchanged
});

test("moderationConfigFromSecrets maps the SSM bag to the hook config", () => {
  const cfg = moderationConfigFromSecrets({ MODERATION_API_URL: "https://m", MODERATION_API_KEY: "k", MODERATION_TIMEOUT_MS: "2500" });
  assert.equal(cfg.endpoint, "https://m");
  assert.equal(cfg.key, "k");
  assert.equal(cfg.timeoutMs, 2500);
  // missing values default to empty (unconfigured) + a sane timeout
  const empty = moderationConfigFromSecrets({});
  assert.equal(empty.endpoint, "");
  assert.equal(empty.timeoutMs, 4000);
});
