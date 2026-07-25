// node --test: FULL-TEXT moderation coverage, the no-bypass rule made literal.
//
// These tests pin the three bypasses that existed before chunked screening:
//   1. revisionNotes (and the payload's smaller user-authored strings) reached
//      the model without ever being passed to moderate() at all.
//   2. The dossier was screened as JSON.stringify(dossier).slice(0, 20000), so
//      everything past 20000 chars reached the model with ZERO screening while
//      the profile write path accepts up to 200KB.
//   3. The network layers (hosted + Creem) sliced their input to 8000 chars, so
//      the tail of a long brief (customIdea 1200 + cvText 8000 + name already
//      exceeds 8000 joined) never reached Creem's endpoint even when the field
//      level clamps all held. "Clamped upstream" was true per field and false
//      in aggregate.
//
// The fix: one canonical briefText() for every layer, and the network layers
// screen ALL of it in overlapping chunks. Each test here would fail against the
// pre-fix implementation and passes against the chunked one.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  moderate,
  deterministicVerdict,
  hostedVerdict,
  briefText,
  chunkText,
  CHUNK_SIZE,
  CHUNK_OVERLAP,
} from "../moderation.mjs";

// ---------------------------------------------------------------------------
// Shared fixtures. The filler is floor-clean by construction (plain words that
// trip no category), so network-layer tests can isolate the network layer: the
// deterministic floor stays green and only the mocked vendor decision blocks.
// ---------------------------------------------------------------------------
const filler = (n) => "clean resume text ".repeat(Math.ceil(n / 18)).slice(0, n);
const okResponse = (payload) => ({ ok: true, json: async () => payload });
const HOSTED = { endpoint: "https://mod.example/screen", key: "real-key" };
const CREEM = { creemKey: "creem_test_abc", creemEndpoint: "https://api.creem.io/v1/moderation/prompt", creemTimeoutMs: 5000 };

// A Creem fake that denies ONLY when the screened chunk contains the marker.
// This is how we prove a specific region of the text actually reached Creem:
// if the marker's chunk were never sent, the mock would answer allow for every
// chunk and the brief would pass.
const creemDenyOn = (marker) => async (_url, opts) => {
  const body = JSON.parse(opts.body);
  return okResponse({ decision: body.prompt.includes(marker) ? "deny" : "allow" });
};
const hostedFlagOn = (marker) => async (_url, opts) => {
  const body = JSON.parse(opts.body);
  return okResponse({ flagged: body.input.includes(marker) });
};

// ---------------------------------------------------------------------------
// chunkText: the mechanics everything else stands on.
// ---------------------------------------------------------------------------

test("chunkText: short text is a single chunk, empty text still yields one chunk", () => {
  assert.deepEqual(chunkText("hello"), ["hello"]);
  assert.deepEqual(chunkText(""), [""]);
  assert.deepEqual(chunkText(null), [""]);
  const exact = filler(CHUNK_SIZE);
  assert.deepEqual(chunkText(exact), [exact], "exactly CHUNK_SIZE stays one chunk");
});

test("chunkText: long text is fully covered, chunks overlap, nothing is lost", () => {
  const text = filler(20000);
  const chunks = chunkText(text);
  assert.equal(chunks.length, 3, "20000 chars at 8000/250 is three chunks");
  // full coverage: reassembling with the overlap removed gives back the text
  const step = CHUNK_SIZE - CHUNK_OVERLAP;
  let rebuilt = chunks[0];
  for (let i = 1; i < chunks.length; i++) rebuilt = rebuilt.slice(0, i * step) + chunks[i];
  assert.equal(rebuilt, text, "the chunks cover every character of the input");
  // every chunk respects the size cap the vendors tolerate
  for (const c of chunks) assert.ok(c.length <= CHUNK_SIZE, "no chunk exceeds CHUNK_SIZE");
});

test("chunkText: the overlap is what catches a phrase straddling the boundary", () => {
  const marker = "STRADDLE_MARKER_PHRASE";
  // place the marker so it starts just before the first cut at CHUNK_SIZE
  const blob = filler(CHUNK_SIZE - 10) + marker + filler(4000);
  const withOverlap = chunkText(blob);
  assert.ok(
    withOverlap.some((c) => c.includes(marker)),
    "with overlap, some chunk contains the whole phrase",
  );
  // and WITHOUT overlap no chunk sees it whole: the overlap is load-bearing,
  // not decoration. This is the exact evasion the overlap exists to close.
  const noOverlap = chunkText(blob, CHUNK_SIZE, 0);
  assert.ok(
    !noOverlap.some((c) => c.includes(marker)),
    "without overlap the phrase is split and invisible to every chunk",
  );
});

// ---------------------------------------------------------------------------
// briefText: the one canonical definition of what gets screened.
// ---------------------------------------------------------------------------

test("briefText includes revisionNotes and the extra payload strings", () => {
  const blob = briefText({
    customIdea: "idea",
    cvText: "cv",
    name: "Nadia",
    revisionNotes: "make the hero section calmer",
    extra: ["nadia@example.com", "SRE", "terraform kubernetes", "cover-photo.jpg"],
  });
  for (const part of ["idea", "cv", "Nadia", "make the hero section calmer", "nadia@example.com", "terraform kubernetes", "cover-photo.jpg"]) {
    assert.ok(blob.includes(part), `blob carries: ${part}`);
  }
  // empty parts are dropped, no stray blank lines
  assert.equal(briefText({ customIdea: "", cvText: "only", name: "" }), "only");
});

// ---------------------------------------------------------------------------
// BYPASS 1 pinned: revisionNotes and extra strings are screened.
// ---------------------------------------------------------------------------

test("a violation in revisionNotes blocks (it used to reach the model unscreened)", () => {
  const v = deterministicVerdict({
    customIdea: "clean",
    cvText: "clean",
    name: "T U",
    revisionNotes: "now make it explicit nude porn",
  });
  assert.equal(v.allowed, false, "revisionNotes is part of the screened text now");
  assert.ok(v.reasons.some((r) => /sexual or NSFW/i.test(r)), `reasons: ${v.reasons}`);
});

test("a violation in an extra payload string (asset name, link, role) blocks", () => {
  const v = deterministicVerdict({
    customIdea: "clean",
    cvText: "clean",
    name: "T U",
    extra: ["cover.jpg", "https://example.com", "generate a deepfake of a celebrity"],
  });
  assert.equal(v.allowed, false);
  assert.ok(v.reasons.some((r) => /third party or public figure/i.test(r)), `reasons: ${v.reasons}`);
});

test("revisionNotes reaches Creem, not just the floor", async () => {
  const marker = "ZX_REVISION_MARKER";
  const v = await moderate(
    { customIdea: "clean", cvText: "clean", name: "T U", revisionNotes: `notes ${marker}`, orderId: "o1" },
    CREEM,
    { fetch: creemDenyOn(marker) },
  );
  assert.equal(v.allowed, false, "Creem saw and denied the revision notes");
  assert.equal(v.creem, "deny");
});

// ---------------------------------------------------------------------------
// BYPASS 2 pinned: the dossier tail past 20000 chars is screened.
// ---------------------------------------------------------------------------

test("a violation past char 20000 of a dossier-sized text blocks on the floor", () => {
  // the old dispatch path sliced the dossier at 20000, so this exact text
  // reached the model with zero screening. The floor sees all of it now.
  const dossierText = JSON.stringify({
    story: filler(25000),
    hobbies: ["explicit nude porn imagery"],
  });
  assert.ok(dossierText.indexOf("explicit nude porn") > 20000, "violation sits past the old slice");
  const v = deterministicVerdict({ customIdea: dossierText, cvText: "", name: "T U" });
  assert.equal(v.allowed, false, "the dossier tail is screened now");
});

test("a floor-clean violation past char 20000 reaches Creem via chunking", async () => {
  const marker = "ZX_DOSSIER_TAIL_MARKER";
  const dossierText = JSON.stringify({ story: filler(24000) + marker });
  assert.ok(dossierText.indexOf(marker) > 20000);
  const calls = [];
  const fetchSpy = async (url, opts) => { calls.push(JSON.parse(opts.body).prompt); return creemDenyOn(marker)(url, opts); };
  const v = await moderate({ customIdea: dossierText, cvText: "", name: "T U", orderId: "o2" }, CREEM, { fetch: fetchSpy });
  assert.equal(v.allowed, false, "Creem denied a marker that lives past the old 20000 slice");
  assert.equal(v.creem, "deny");
  assert.ok(calls.length >= 3, `the long dossier went out in multiple chunks (saw ${calls.length})`);
});

// ---------------------------------------------------------------------------
// BYPASS 3 pinned: the tail of the validate blob reaches the network layers.
// customIdea(1200) + cvText(8000) + name joins to more than 8000, and the old
// single-request slice meant Creem never saw the cvText tail.
// ---------------------------------------------------------------------------

test("a floor-clean marker in the cvText tail reaches Creem (the 8000 cap is gone)", async () => {
  const marker = "ZX_POLICY_MARKER";
  const fields = {
    customIdea: filler(1200),
    cvText: filler(7900) + " " + marker, // lands past 8000 in the joined blob
    name: "Nadia Benali",
    orderId: "o3",
  };
  assert.ok(briefText(fields).indexOf(marker) > CHUNK_SIZE, "marker sits past one request's worth");
  const v = await moderate(fields, CREEM, { fetch: creemDenyOn(marker) });
  assert.equal(v.allowed, false, "Creem screened the tail and denied it");
  assert.equal(v.creem, "deny");
});

test("the same tail reaches the hosted layer too", async () => {
  const marker = "ZX_HOSTED_TAIL_MARKER";
  const fields = { customIdea: filler(1200), cvText: filler(7900) + " " + marker, name: "N B" };
  const v = await moderate(fields, HOSTED, { fetch: hostedFlagOn(marker) });
  assert.equal(v.allowed, false, "the hosted layer screened the tail and flagged it");
  assert.ok(v.reasons.some((r) => /hosted/i.test(r)), `reasons: ${v.reasons}`);
});

test("a phrase straddling the chunk boundary is still caught end to end", async () => {
  const marker = "ZX_STRADDLE_POLICY_MARKER";
  // start the marker just before the first cut so no unoverlapped chunk holds it whole
  const cv = filler(CHUNK_SIZE - 1210 - 8) + marker + filler(2000);
  const fields = { customIdea: filler(1200), cvText: cv, name: "N B", orderId: "o4" };
  const blob = briefText(fields);
  const cut = blob.slice(CHUNK_SIZE - 12, CHUNK_SIZE + 12);
  assert.ok(cut.includes("ZX_") || blob.indexOf(marker) < CHUNK_SIZE, "marker straddles the first boundary");
  const v = await moderate(fields, CREEM, { fetch: creemDenyOn(marker) });
  assert.equal(v.allowed, false, "the overlap carried the whole phrase into one screened chunk");
});

// ---------------------------------------------------------------------------
// Merge semantics across chunks: the transient-vs-verdict doctrine survives.
// ---------------------------------------------------------------------------

test("one chunk 5xx among clean chunks: blocked AND transient (stall, retry, never terminal)", async () => {
  const marker = "ZX_OUTAGE_ZONE";
  const fields = { customIdea: filler(1200), cvText: filler(7900) + " " + marker, name: "N B", orderId: "o5" };
  const fetchMixed = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.prompt.includes(marker)) return { ok: false, status: 503, json: async () => ({}) };
    return okResponse({ decision: "allow" });
  };
  const v = await moderate(fields, CREEM, { fetch: fetchMixed });
  assert.equal(v.allowed, false, "an unscreened chunk means an unscreened prompt: fail closed");
  assert.equal(v.creem, "blocked");
  assert.equal(v.transient, true, "a lone chunk outage is an outage, not a content verdict");
});

test("one chunk DENY plus another chunk outage: terminal, never transient", async () => {
  const deny = "ZX_DENY_ZONE";
  const boom = "ZX_THROW_ZONE";
  const fields = { customIdea: deny + " " + filler(1200), cvText: filler(7900) + " " + boom, name: "N B", orderId: "o6" };
  const fetchMixed = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.prompt.includes(deny)) return okResponse({ decision: "deny" });
    if (body.prompt.includes(boom)) throw new Error("creem timeout");
    return okResponse({ decision: "allow" });
  };
  const v = await moderate(fields, CREEM, { fetch: fetchMixed });
  assert.equal(v.allowed, false);
  assert.equal(v.creem, "deny", "a confirmed verdict outranks a concurrent outage in the stamp");
  assert.equal(v.transient, false, "retrying screens the same text and reaches the same deny");
});

test("all chunks allow: allowed, stamped allow, and every chunk was actually sent", async () => {
  const calls = [];
  const fetchCounting = async (_url, opts) => { calls.push(JSON.parse(opts.body)); return okResponse({ decision: "allow" }); };
  const fields = { customIdea: filler(20000), cvText: "", name: "N B", orderId: "o7" };
  const v = await moderate(fields, CREEM, { fetch: fetchCounting });
  assert.equal(v.allowed, true);
  assert.equal(v.creem, "allow");
  assert.equal(calls.length, 3, "a 20000-char text is screened as three chunks");
  for (const c of calls) assert.equal(c.external_id, "o7", "every chunk carries the order's external_id");
});

test("hosted partial outage stays fail-open: clean floor plus one dead chunk still allows", async () => {
  const boom = "ZX_HOSTED_DEAD_ZONE";
  const fields = { customIdea: filler(1200), cvText: filler(7900) + " " + boom, name: "N B" };
  const fetchMixed = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.input.includes(boom)) throw new Error("vendor down");
    return okResponse({ flagged: false });
  };
  const v = await moderate(fields, HOSTED, { fetch: fetchMixed });
  assert.equal(v.allowed, true, "the hosted hook we chose must never brick a paid order on its outage");
});

test("hostedVerdict returns null when EVERY chunk fails open (no opinion at all)", async () => {
  const fields = { customIdea: filler(9000), cvText: "", name: "N B" };
  const v = await hostedVerdict(fields, HOSTED, { fetch: async () => { throw new Error("all down"); } });
  assert.equal(v, null, "no usable hosted opinion for any chunk means null, the floor stands");
});

// ---------------------------------------------------------------------------
// The dispatch contract, replayed with a LONG dossier: the exact validate and
// dispatch branches the pipeline runs, now with text sizes that used to bypass.
// ---------------------------------------------------------------------------

test("dispatch-shaped screen of a full-length dossier blocks before any webhook", async () => {
  const dispatched = [];
  async function runDispatchBranch(dossier, config, deps) {
    const dossierText = JSON.stringify(dossier); // the fixed path: NO slice
    const dv = await moderate({ customIdea: dossierText, cvText: "", name: "T U", orderId: "o8" }, config, deps);
    if (!dv.allowed) return { dispatched: false, dv };
    dispatched.push(dossierText);
    return { dispatched: true, dv };
  }
  const marker = "ZX_DEEP_DOSSIER_MARKER";
  const dossier = { story: filler(30000) + marker, projects: [] };
  const blocked = await runDispatchBranch(dossier, CREEM, { fetch: creemDenyOn(marker) });
  assert.equal(blocked.dispatched, false, "a violation 30000 chars deep still blocks dispatch");
  assert.equal(dispatched.length, 0, "nothing reached the webhook");
  const clean = await runDispatchBranch({ story: filler(30000) }, CREEM, { fetch: async () => okResponse({ decision: "allow" }) });
  assert.equal(clean.dispatched, true, "a clean full-length dossier still ships");
});
