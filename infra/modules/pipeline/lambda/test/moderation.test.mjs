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
import { moderate, deterministicVerdict, hostedVerdict, creemVerdict, moderationConfigFromSecrets } from "../moderation.mjs";

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

// Creem fakes. Creem replies with a `decision` field (allow | flag | deny) and
// authenticates with an x-api-key header; these fakes let us assert both the
// verdict mapping AND the request shape without ever touching the network.
// CREEM config arms ONLY the Creem screen (no generic-hook endpoint/key), so a
// test can exercise Creem in isolation from the hosted hook.
const CREEM = { creemKey: "creem_test_abc", creemEndpoint: "https://api.creem.io/v1/moderation/prompt", creemTimeoutMs: 5000 };
const creemDecision = (decision, extra = {}) => async () => okResponse({ decision, ...extra });
const creemAllow = creemDecision("allow");
const creemFlag = creemDecision("flag");
const creemDeny = creemDecision("deny");
const creemThrows = async () => { throw new Error("creem timeout"); };
const creem500 = async () => ({ ok: false, status: 502, json: async () => ({}) });

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

// ---------------------------------------------------------------------------
// CREEM provider screen. Creem is our payment provider and their AI Wrapper
// Compliance rules MANDATE screening every prompt through Creem's own endpoint
// before generation, with fail-CLOSED behaviour (the OPPOSITE of our generic
// hook). These tests pin every clause of that contract.
// ---------------------------------------------------------------------------

test("creem screen is DORMANT when unconfigured (no key => null, behaviour unchanged)", async () => {
  // no key, and the terraform placeholder, both read as dormant: null, so the
  // module behaves exactly as it did before Creem existed.
  assert.equal(await creemVerdict(CLEAN, {}, { fetch: creemDeny }), null);
  assert.equal(await creemVerdict(CLEAN, { creemKey: "" }, { fetch: creemDeny }), null);
  assert.equal(await creemVerdict(CLEAN, { creemKey: "unset" }, { fetch: creemDeny }), null);
  // and moderate() never calls fetch for a dormant Creem screen (nor the hook)
  let called = false;
  const spy = async (...a) => { called = true; return creemDeny(...a); };
  const v = await moderate(CLEAN, moderationConfigFromSecrets({}), { fetch: spy });
  assert.equal(called, false, "fetch must not run when Creem is dormant and no hook is set");
  assert.equal(v.allowed, true);
  assert.equal(v.creem, undefined, "no creem stamp when Creem did not run");
});

test("creem ALLOW lets a clean brief proceed and stamps the decision on the verdict", async () => {
  const v = await moderate(CLEAN, CREEM, { fetch: creemAllow });
  assert.equal(v.allowed, true);
  assert.deepEqual(v.reasons, []);
  assert.equal(v.creem, "allow", "the raw Creem decision is recorded for the audit trail");
});

test("creem DENY blocks the brief (fail-closed on a positive violation)", async () => {
  const v = await moderate(CLEAN, CREEM, { fetch: creemDeny });
  assert.equal(v.allowed, false);
  assert.ok(v.reasons.some((r) => /creem moderation deny/i.test(r)), `reasons: ${v.reasons}`);
  assert.equal(v.creem, "deny");
});

test("creem FLAG blocks EXACTLY like deny (the subtle rule: flag is not a soft pass)", async () => {
  // Creem's rules require a "flag" verdict to be treated identically to "deny".
  // A clean-per-keywords brief that Creem flags MUST NOT reach the model.
  const v = await moderate(CLEAN, CREEM, { fetch: creemFlag });
  assert.equal(v.allowed, false, "a Creem 'flag' must block just like 'deny'");
  assert.ok(v.reasons.some((r) => /creem moderation flag/i.test(r)), `reasons: ${v.reasons}`);
  assert.equal(v.creem, "flag");
});

test("creem TIMEOUT blocks (FAIL CLOSED, the opposite of the generic hook)", async () => {
  // The generic hook fails OPEN on a throw; Creem must FAIL CLOSED. A clean brief
  // that would sail through the hook is BLOCKED when Creem times out.
  const v = await moderate(CLEAN, CREEM, { fetch: creemThrows });
  assert.equal(v.allowed, false, "a Creem timeout must block, never wave the prompt through");
  assert.ok(v.reasons.some((r) => /creem moderation error/i.test(r)), `reasons: ${v.reasons}`);
  assert.equal(v.creem, "error");
});

test("creem 5xx blocks (FAIL CLOSED on server error)", async () => {
  const v = await moderate(CLEAN, CREEM, { fetch: creem500 });
  assert.equal(v.allowed, false, "a Creem 5xx must block, never wave the prompt through");
  assert.ok(v.reasons.some((r) => /creem moderation unavailable/i.test(r)), `reasons: ${v.reasons}`);
  assert.equal(v.creem, "blocked");
});

test("creem tolerates UNKNOWN response fields and does not crash (endpoint is experimental)", async () => {
  // extra/unexpected fields alongside a valid decision must be ignored, not fatal
  const withExtras = creemDecision("allow", { confidence: 0.99, categories: ["none"], _internal: { x: 1 } });
  const ok = await moderate(CLEAN, CREEM, { fetch: withExtras });
  assert.equal(ok.allowed, true);
  assert.equal(ok.creem, "allow");
  // a missing/unrecognized decision must FAIL CLOSED, never be assumed allow
  const weird = async () => okResponse({ status: "processed", note: "no decision here" });
  const blocked = await moderate(CLEAN, CREEM, { fetch: weird });
  assert.equal(blocked.allowed, false, "an unrecognized/missing decision must block, not pass");
  assert.equal(blocked.creem, "blocked");
});

test("creem SENDS the prompt on x-api-key and threads external_id (orderId) for audit", async () => {
  let seen = null;
  const capture = async (url, opts) => { seen = { url, opts }; return okResponse({ decision: "allow" }); };
  await creemVerdict(
    { ...CLEAN, orderId: "ord_12345" },
    CREEM,
    { fetch: capture },
  );
  assert.ok(seen, "fetch was called");
  assert.equal(seen.url, "https://api.creem.io/v1/moderation/prompt");
  assert.equal(seen.opts.method, "POST");
  assert.equal(seen.opts.headers["x-api-key"], "creem_test_abc", "Creem uses x-api-key, not Authorization");
  assert.equal(seen.opts.headers.authorization, undefined, "must NOT send a Bearer header to Creem");
  const body = JSON.parse(seen.opts.body);
  assert.ok(body.prompt.includes("control room at night"), "the customer's prompt text is screened");
  assert.equal(body.external_id, "ord_12345", "orderId is sent as external_id so Creem calls tie to our order");
  // and when we have no orderId, we simply omit external_id rather than invent one
  let seen2 = null;
  const capture2 = async (url, opts) => { seen2 = opts; return okResponse({ decision: "allow" }); };
  await creemVerdict(CLEAN, CREEM, { fetch: capture2 });
  assert.equal(JSON.parse(seen2.body).external_id, undefined, "no external_id sent when there is no id");
});

test("creem passes an AbortSignal so the ~5s timeout can actually fire", async () => {
  let sawSignal = false;
  const capture = async (_url, opts) => { sawSignal = Boolean(opts.signal); return okResponse({ decision: "allow" }); };
  await creemVerdict(CLEAN, CREEM, { fetch: capture });
  assert.equal(sawSignal, true, "an AbortController signal must be wired for the timeout");
});

test("the DETERMINISTIC layer still runs independently alongside Creem", async () => {
  // Even when Creem says allow, a brief the keyword floor blocks stays BLOCKED:
  // Creem is layered on top of the floor, it does not replace it.
  const stillBlocked = await moderate({ ...CLEAN, customIdea: "graphic violence, torture" }, CREEM, { fetch: creemAllow });
  assert.equal(stillBlocked.allowed, false, "a Creem 'allow' must not unblock a deterministic violation");
  assert.ok(stillBlocked.reasons.some((r) => /violent/i.test(r)), `reasons: ${stillBlocked.reasons}`);
  // and the floor stands entirely on its own with NO Creem configured at all
  const floorOnly = deterministicVerdict({ ...CLEAN, customIdea: "explicit nude porn" });
  assert.equal(floorOnly.allowed, false);
});

test("creem and the generic hook COEXIST with their opposite failure doctrines", async () => {
  // A single fetch fake used for BOTH layers: it throws. The generic hook must
  // fail OPEN (fall back to the clean floor) while Creem must fail CLOSED. With
  // both configured, Creem's fail-closed BLOCK wins the merge (stricter wins).
  const bothConfigured = { ...HOSTED, ...CREEM };
  const v = await moderate(CLEAN, bothConfigured, { fetch: async () => { throw new Error("everything is down"); } });
  assert.equal(v.allowed, false, "with Creem active, an outage must block (compliance fail-closed wins)");
  assert.equal(v.creem, "error");

  // Sanity: the SAME outage with ONLY the generic hook (Creem dormant) fails
  // OPEN, proving the two doctrines genuinely coexist and are not the same code.
  const hookOnly = await moderate(CLEAN, HOSTED, { fetch: async () => { throw new Error("everything is down"); } });
  assert.equal(hookOnly.allowed, true, "the generic hook alone still fails open on an outage");
  assert.equal(hookOnly.source, "deterministic");
});

test("a creem-rejected verdict means the order NEVER dispatches (validate-step contract)", async () => {
  // Replays the pipeline's validate branch (verdict.allowed === false => rejected,
  // page, no dispatch) but driven by a CREEM flag, proving there is no bypass
  // path around Creem to the model.
  const dispatched = [];
  async function runValidateBranch(fields, config, deps) {
    const verdict = await moderate(fields, config, deps);
    if (!verdict.allowed) return { dispatched: false, verdict };
    dispatched.push(fields);
    return { dispatched: true, verdict };
  }
  const flagged = await runValidateBranch({ ...CLEAN, orderId: "ord_1" }, CREEM, { fetch: creemFlag });
  assert.equal(flagged.dispatched, false, "a Creem 'flag' must stop dispatch");
  assert.equal(flagged.verdict.creem, "flag");
  const outage = await runValidateBranch({ ...CLEAN, orderId: "ord_2" }, CREEM, { fetch: creemThrows });
  assert.equal(outage.dispatched, false, "a Creem outage must stop dispatch (fail closed)");
  assert.equal(dispatched.length, 0, "no order reached dispatch while Creem blocked");
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

test("moderationConfigFromSecrets maps the Creem SSM parameters and defaults the URL", () => {
  const cfg = moderationConfigFromSecrets({ CREEM_MODERATION_API_KEY: "creem_live_xyz", CREEM_MODERATION_TIMEOUT_MS: "5000" });
  assert.equal(cfg.creemKey, "creem_live_xyz");
  assert.equal(cfg.creemTimeoutMs, 5000);
  // the URL DEFAULTS to Creem's real endpoint so the operator only supplies a key
  assert.equal(cfg.creemEndpoint, "https://api.creem.io/v1/moderation/prompt");
  // an explicit URL overrides the default (e.g. Creem's test host)
  const overridden = moderationConfigFromSecrets({ CREEM_MODERATION_API_KEY: "creem_test_x", CREEM_MODERATION_API_URL: "https://test.creem.io/v1/moderation/prompt" });
  assert.equal(overridden.creemEndpoint, "https://test.creem.io/v1/moderation/prompt");
  // Creem dormant by default (empty key), URL still defaulted, sane timeout
  const empty = moderationConfigFromSecrets({});
  assert.equal(empty.creemKey, "");
  assert.equal(empty.creemEndpoint, "https://api.creem.io/v1/moderation/prompt");
  assert.equal(empty.creemTimeoutMs, 5000);
});
