// moderation.mjs: the content screening layer that runs on EVERY order brief
// BEFORE it reaches the AI director. Creem (our payment provider) mandates a
// prompt-moderation surface for any product that generates images or video, and
// our pipeline generates both, so this file is a compliance hard-requirement,
// not a nicety: an unscreened generation product cannot be approved.
//
// Three layers, by design:
//   1. DETERMINISTIC layer (always runs): a keyword + regex screen with zero
//      dependencies and zero network cost. It works offline, in a cold Lambda,
//      and during any provider outage, so there is ALWAYS a moderation verdict
//      on record even when nothing else is reachable. This is the floor.
//   2. HOSTED layer (optional): an SSM-configured, VENDOR-GENERIC moderation
//      endpoint. It only runs when both the endpoint and the key are present. It
//      exists to catch what a keyword screen cannot (paraphrase, obfuscation,
//      novel harms) when we point it at some vendor of our own choosing.
//   3. CREEM layer (optional, but compliance-grade when on): Creem is our
//      payment provider, and their AI Wrapper Compliance rules MANDATE that
//      every prompt routed to an image/video model is screened through CREEM'S
//      OWN moderation endpoint before generation. It runs when its own SSM key
//      is present, calls Creem's documented endpoint, and treats a "flag" verdict
//      exactly like "deny". This is a first-class provider screen, NOT a
//      replacement for the deterministic floor: both still run.
//
// The layers have DELIBERATELY DIFFERENT failure doctrines, and the reason
// matters for revenue and for safety both:
//   - The generic HOSTED call FAILS OPEN to the deterministic verdict. A
//     moderation vendor outage, timeout, or 5xx must never brick a paid order.
//     The money flow survives on the deterministic floor, exactly like mail and
//     the other side effects in this codebase fail soft. We CHOSE this hook, so
//     an outage of it is our problem to absorb, not the paying customer's.
//   - The CREEM call FAILS CLOSED. This is the deliberate OPPOSITE of the hook
//     above, and it is not a style choice: Creem compliance requires that a
//     timeout or 5xx BLOCKS generation rather than letting an unscreened prompt
//     reach the model. When Creem is the active provider, compliance wins over
//     revenue: we would rather stall a paid order than ship an unscreened prompt
//     and lose payment-provider approval (and therefore ALL revenue). Both
//     doctrines coexist because each is right for its own layer.
//   - BOTH the hosted hook and Creem FAIL CLOSED on a POSITIVE violation (a
//     hosted "flagged", or a Creem "flag"/"deny"): we reject. A confirmed
//     content violation MUST block dispatch; letting a flagged brief through to
//     an image/video generator is the exact failure the provider requirement
//     exists to prevent, so here "soft" is never an option.
//
// The verdict shape { allowed, reasons[], severity } is stored on the order row
// so we can PROVE to a provider reviewer that moderation ran and what it found.
// When Creem screened the prompt we also stamp the raw Creem decision onto the
// verdict (verdict.creem = "allow"|"flag"|"deny"|"blocked"|"error") so we can
// prove PER ORDER, in an audit, that Creem screening actually ran.
//
// The verdict also carries verdict.transient, and it is load-bearing: it is true
// ONLY when the brief is blocked SOLELY because Creem was unavailable (a timeout
// or 5xx, i.e. fail-closed) with no confirmed violation on record. It separates
// a transient vendor outage from a real content verdict WITHOUT relaxing the
// block (allowed stays false either way). The pipeline reads it to decide whether
// a block is a terminal reject (a real violation) or a retryable stall (an
// outage). See isTransientFailure() below for the exact rule and the WHY.
//
// FULL-TEXT SCREENING, the no-bypass rule made literal: every layer screens ONE
// canonical text (briefText below), and the network layers screen ALL of it in
// chunks. The old shape capped each network request at 8000 chars and screened
// only the first request's worth, so the tail of a long resume, and everything
// past the dossier's old 20000-char slice, reached the model without ever
// reaching Creem. That is the exact bypass Creem's compliance rules exist to
// forbid. Now the text is split into overlapping chunks and EVERY chunk is
// screened; a single flagged chunk blocks the brief, and the overlap means a
// banned phrase straddling a chunk boundary still lands whole inside one chunk.

// Severity ranking so we can keep the highest signal when several categories
// trip at once. "clear" is the baseline for an allowed brief.
const SEVERITY_RANK = { clear: 0, low: 1, medium: 2, high: 3 };
const worseSeverity = (a, b) => (SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b);

// Category catalogue. Each category carries the severity we assign when it
// trips and the patterns that trip it. Patterns are matched case-insensitively
// against a normalized copy of the text (see normalize()), so an attacker cannot
// slip past with spacing, punctuation, or unicode look-alikes as easily.
//
// WHY patterns and not only bare words: bare-word lists both over-block (the
// "Scunthorpe problem": innocent substrings inside real words) and under-block
// (trivial to evade). Word-boundary anchored regexes give us precision, and a
// few intent phrases ("photo of", "in the style of <person>") catch the
// third-party-likeness ask that no single word reveals.
const CATEGORIES = [
  {
    id: "sexual",
    label: "sexual or NSFW content",
    severity: "high",
    patterns: [
      /\b(porn|pornographic|nsfw|xxx|hardcore|hentai)\b/,
      /\b(nude|nudes|nudity|naked|topless|explicit\s+(?:sexual|nude))\b/,
      /\b(sexual|sexually\s+explicit|erotic|erotica|fetish|orgasm|masturbat\w*)\b/,
      /\b(genital\w*|penis|vagina|breasts?\s+(?:exposed|bare))\b/,
    ],
  },
  {
    // A dedicated, non-negotiable child-safety screen. It carries "high" like the
    // rest, but it lives apart from generic "sexual" so the reason string names
    // it explicitly on the order row, so a reviewer sees we screen for it.
    id: "csae",
    label: "child sexual abuse material",
    severity: "high",
    patterns: [
      /\b(child|children|kid|kids|minor|minors|underage|pre-?teen|preteen|infant|toddler)\b[^.!?\n]{0,40}\b(porn|nude|nudes|naked|sexual|sexy|erotic|explicit)\b/,
      /\b(porn|nude|nudes|naked|sexual|sexy|erotic|explicit)\b[^.!?\n]{0,40}\b(child|children|kid|kids|minor|minors|underage|pre-?teen|preteen|infant|toddler)\b/,
      /\bcsam\b|\bchild\s+(?:porn|pornography|sexual\s+abuse)\b|\blolicon\b|\bshotacon\b/,
    ],
  },
  {
    id: "third_party",
    label: "depiction of a named third party or public figure",
    severity: "medium",
    patterns: [
      // Explicit asks to render a specific OTHER person's likeness. Our contract
      // with the director is that likeness comes ONLY from the client's own
      // uploaded photos, so any ask to depict a named someone else is a
      // rights/consent problem before it is anything else.
      /\b(?:photo|picture|image|portrait|render|depict\w*|generate|create|draw|paint|deepfake|deep\s*fake|face)\s+(?:of|showing)\s+(?:a\s+)?(?:famous|celebrity|celebrities|public\s+figure|politician|president|actor|actress|singer|the\s+ceo\s+of)\b/,
      /\b(?:in|with)\s+the\s+(?:likeness|face|image)\s+of\b/,
      /\bas\s+(?:if\s+)?(?:i\s+am|i'?m|they\s+are)\s+(?:a\s+)?(?:famous|celebrity)\b/,
      /\b(deepfake|deep\s*fake)\b/,
      /\blook(?:s|ing)?\s+like\s+(?:the\s+)?(?:celebrity|actor|actress|singer|president|politician)\b/,
    ],
  },
  {
    id: "hate",
    label: "hate content",
    severity: "high",
    patterns: [
      /\b(genocide|ethnic\s+cleansing|racial\s+superiority|white\s+power|master\s+race)\b/,
      /\b(kill|exterminate|gas|purge|deport)\s+(?:all\s+)?(?:the\s+)?(jews|muslims|christians|blacks|whites|asians|immigrants|gays|lesbians|trans)\b/,
      /\b(heil\s+hitler|nazi\s+salute|kkk|ku\s+klux\s+klan)\b/,
      /\b(subhuman|untermensch)\b/,
      // Slur placeholders kept generic on purpose: we screen for the intent
      // markers above and defer nuanced slur detection to the hosted layer,
      // which can weigh reclaimed vs. targeted usage far better than a regex.
      /\bhate\s+(?:speech|group|crime)\b.*\b(promote|glorif\w+|incite)\b/,
    ],
  },
  {
    id: "violence",
    label: "violent content",
    severity: "high",
    patterns: [
      /\b(behead\w*|decapitat\w*|dismember\w*|mutilat\w*|torture|gore|gory)\b/,
      /\b(mass\s+shooting|school\s+shooting|massacre|bloodbath)\b/,
      /\b(how\s+to\s+(?:kill|murder|hurt|attack)|instructions?\s+to\s+kill)\b/,
      /\b(graphic\s+violence|brutal\s+killing|execution\s+video)\b/,
      // Target must be a PERSON, not an object. Our customers are creative
      // professionals: a photographer writes "I shoot the campaign", an engineer
      // writes "kill the legacy system". The old pattern matched an object after
      // the verb and terminally rejected those paid orders as violent content.
      /\b(kill|murder|assassinate|attack|stab|shoot)\s+(?:him|her|them|someone|somebody|people|a\s+(?:person|man|woman|child)|my\s+(?:boss|ex|neighbou?r|wife|husband))\b/,
    ],
  },
  {
    id: "illegal",
    label: "illegal content",
    severity: "high",
    patterns: [
      /\b(child\s+abuse|human\s+trafficking|sex\s+trafficking)\b/,
      /\b(buy|sell|acquire|make|manufacture|synthesize)\s+(?:illegal\s+)?(cocaine|heroin|meth|methamphetamine|fentanyl|mdma|lsd)\b/,
      /\b(build|make|assemble|construct)\s+(?:a\s+)?(bomb|explosive|ied|pipe\s+bomb|dirty\s+bomb|bioweapon|nerve\s+agent)\b/,
      /\b(counterfeit|forge)\s+(?:money|currency|passports?|ids?|documents?)\b/,
      /\b(hire\s+(?:a\s+)?hitman|hitman\s+for\s+hire|contract\s+killing)\b/,
      /\b(malware|ransomware|ddos\s+attack)\s+(?:to|that|for)\b/,
    ],
  },
];

// Normalize before matching so trivial obfuscation does not defeat the screen:
//   - lowercase
//   - fold a few common leetspeak digit substitutions back to letters
//   - collapse runs of separators (spaces, dots, dashes, underscores) that get
//     inserted between letters to break up a banned word ("p o r n")
// WHY conservative: we only fold ambiguous digits and collapse whitespace/punct,
// never strip letters, so we do not manufacture false positives out of clean
// text. The hosted layer is where heavier de-obfuscation belongs.
export function normalize(input) {
  const s = String(input ?? "").toLowerCase();
  const leet = s
    .replace(/[@]/g, "a")
    .replace(/[$]/g, "s")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t");
  // collapse separators inserted BETWEEN single characters ("f-u-c-k" -> "fuck")
  // without merging normal words: only squeeze when single chars are fenced by
  // separators on both sides.
  const deSpaced = leet.replace(/(?<=\b\w)[\s._\-]+(?=\w\b)/g, "");
  return { raw: leet, deSpaced };
}

// Run the deterministic screen over one blob of text. Returns the set of
// category ids that tripped. Checks BOTH the plain-normalized and the
// separator-collapsed forms so "p.o.r.n" and "porn" both land.
function screenText(text) {
  const { raw, deSpaced } = normalize(text);
  const hits = new Set();
  for (const cat of CATEGORIES) {
    for (const rx of cat.patterns) {
      // fresh lastIndex each test: these are non-global, but be explicit.
      if (rx.test(raw) || rx.test(deSpaced)) {
        hits.add(cat.id);
        break;
      }
    }
  }
  return hits;
}

// The one canonical definition of WHAT text is screened. Every layer, the
// deterministic floor, the hosted hook, and Creem, screens exactly this text,
// so a field added here is screened by all three at once and a field missing
// here is screened by none: keep this list in lockstep with the model payload
// assembled in pipeline.mjs. revisionNotes is the customer's free-text message
// to the director on a revision run, and `extra` carries the payload's smaller
// user-authored strings (email, role, skills, template and palette ids, asset
// names, urls, links). Empty parts are dropped so the joined blob carries no
// stray blank lines.
export function briefText(fields) {
  const parts = [
    fields?.customIdea,
    fields?.cvText,
    fields?.name,
    fields?.revisionNotes,
    ...(Array.isArray(fields?.extra) ? fields.extra : []),
  ];
  return parts
    .map((v) => String(v ?? ""))
    .filter((s) => s !== "")
    .join("\n");
}

// How long text reaches the network layers: in overlapping chunks, every one of
// them screened. CHUNK_SIZE matches the per-request payload cap the vendors
// tolerate; CHUNK_OVERLAP exists so a phrase that straddles a chunk boundary
// still lands whole inside one chunk, otherwise a banned phrase split at the
// cut would be invisible to every chunk. Exported for the tests that pin the
// boundary behaviour.
export const CHUNK_SIZE = 8000;
export const CHUNK_OVERLAP = 250;
export function chunkText(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const s = String(text ?? "");
  if (s.length <= size) return [s];
  const step = Math.max(1, size - overlap);
  const chunks = [];
  for (let start = 0; start < s.length; start += step) {
    chunks.push(s.slice(start, start + size));
    if (start + size >= s.length) break;
  }
  return chunks;
}

// A small concurrency pool for the per-chunk requests: enough parallelism to
// keep a many-chunk screen inside the lambda budget (ceil(chunks / POOL) waves
// of one vendor timeout each; the 200KB putProfile cap is ~26 chunks, 3 waves,
// ~15s worst case), without firing dozens of simultaneous requests at a vendor
// for one order.
const POOL = 10;
async function pooled(items, fn, limit = POOL) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// The always-on floor. Pure, synchronous, offline, no cost. Given the brief's
// free-text fields, return a structured verdict. This is what the hosted layer
// falls back TO on any error, so it must stand entirely on its own. It screens
// the full canonical text with no cap: regexes over even a 200KB dossier are
// milliseconds, so the floor never needs chunking.
export function deterministicVerdict(fields) {
  const blob = briefText(fields);
  const hitIds = screenText(blob);

  const reasons = [];
  let severity = "clear";
  for (const cat of CATEGORIES) {
    if (hitIds.has(cat.id)) {
      reasons.push(cat.label);
      severity = worseSeverity(severity, cat.severity);
    }
  }
  return {
    allowed: reasons.length === 0,
    reasons,
    severity,
    source: "deterministic",
  };
}

// The optional hosted hook. It is called ONLY when both endpoint and key are
// configured. Everything about its failure behavior is intentional:
//
//   - Any transport error, non-2xx, timeout, or unparseable body => we DO NOT
//     have a hosted opinion, so we FAIL OPEN and return null. The caller then
//     keeps the deterministic verdict. A vendor being down is not the paying
//     customer's problem and must never fail their order.
//   - A clean 2xx that reports a violation => FAIL CLOSED: a rejecting verdict.
//   - A clean 2xx that reports no violation => an allowing verdict. It does NOT
//     override a deterministic block; the caller merges by taking the stricter
//     of the two (see moderate()).
//
// The endpoint contract is intentionally generic so it can front most vendors:
// POST JSON { input: "<text>" } with a Bearer key, and read a boolean-ish
// "flagged"/"blocked"/"violation" plus optional "categories"[] and "severity".
export async function hostedVerdict(fields, config, deps = {}) {
  const endpoint = config?.endpoint;
  const key = config?.key;
  // treat the terraform placeholder ("unset"/empty) as UNCONFIGURED, mirroring
  // how the billing handler treats its placeholder: infra owns that the param
  // exists, the operator owns whether it has a real value.
  if (!endpoint || !key || endpoint === "unset" || key === "unset") return null;

  const fetchFn = deps.fetch || globalThis.fetch;
  const timeoutMs = Number(config?.timeoutMs) || 4000;

  // one POST per chunk so the WHOLE text gets a hosted opinion, not just the
  // first request's worth. The per-chunk failure doctrine is unchanged: any
  // transport error, non-2xx, timeout, or unparseable body means we have no
  // hosted opinion FOR THAT CHUNK and it fails OPEN to the deterministic floor.
  const screenChunk = async (input) => {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const r = await fetchFn(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ input }),
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!r || !r.ok) return null; // fail OPEN: no usable hosted opinion
      const data = await r.json();
      const flagged = Boolean(data?.flagged ?? data?.blocked ?? data?.violation);
      if (!flagged) {
        return { allowed: true, reasons: [], severity: "clear", source: "hosted" };
      }
      // fail CLOSED on a positive violation: this is the deliberate exception.
      const reasons = Array.isArray(data?.categories) && data.categories.length
        ? data.categories.map((c) => `hosted: ${String(c)}`)
        : ["hosted moderation flagged this brief"];
      const severity = SEVERITY_RANK[data?.severity] !== undefined ? data.severity : "high";
      return { allowed: false, reasons, severity, source: "hosted" };
    } catch (e) {
      // timeout / network / bad JSON: fail OPEN. Log so an outage is visible in
      // CloudWatch, but never let it break the money flow.
      console.error(JSON.stringify({ level: "warn", msg: "hosted moderation failed open", err: e?.message }));
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const results = await pooled(chunkText(briefText(fields)), screenChunk);

  // Merge across chunks: ANY flagged chunk blocks (union of reasons, worst
  // severity), because a violation anywhere in the text is a violation. With no
  // flags, one clean opinion is enough for an allow. All-null means every chunk
  // failed open or the vendor was down for all of them: no hosted opinion at
  // all, return null and the caller keeps the deterministic verdict.
  const blocks = results.filter((v) => v && !v.allowed);
  if (blocks.length) {
    const reasons = [...new Set(blocks.flatMap((v) => v.reasons))];
    const severity = blocks.reduce((acc, v) => worseSeverity(acc, v.severity), "clear");
    return { allowed: false, reasons, severity, source: "hosted" };
  }
  if (results.some((v) => v && v.allowed)) {
    return { allowed: true, reasons: [], severity: "clear", source: "hosted" };
  }
  return null;
}

// The Creem provider screen. Creem is our payment provider, and their AI Wrapper
// Compliance rules MANDATE that every prompt routed to an image/video model is
// screened through Creem's OWN moderation endpoint before generation. This is a
// first-class provider screen, layered ON TOP of the deterministic floor, never
// a replacement for it.
//
// Contract, verified from docs.creem.io/api-reference/endpoint/screen-prompt:
//   POST https://api.creem.io/v1/moderation/prompt
//   header: x-api-key: <creem_... key>   (test keys start with creem_test_)
//   body:   { prompt: "<text>", external_id: "<id tying the call to an order>" }
//   reply:  { decision: "allow" | "flag" | "deny", ... }  (may carry extra fields)
//
// Failure doctrine, and WHY it is the OPPOSITE of hostedVerdict above:
//   - hostedVerdict is a hook WE chose, so it FAILS OPEN: an outage falls back
//     to the deterministic floor and never bricks a paid order.
//   - creemVerdict FAILS CLOSED: a timeout, transport error, or 5xx BLOCKS the
//     order instead of letting an unscreened prompt reach the model. Creem
//     compliance REQUIRES this, and compliance wins over revenue whenever Creem
//     is the active provider: an unscreened generation would risk our
//     payment-provider approval, which would cost us ALL revenue, not one order.
//     So on any error while configured we return a BLOCKING verdict, not null.
//   - A "flag" verdict is treated EXACTLY like "deny": both block. Creem marks
//     the endpoint experimental, so we IGNORE unknown response fields and only
//     read `decision`; anything that is not a clean "allow" blocks (fail closed).
//
// Returns null ONLY when the screen is dormant (no key configured), so behaviour
// is unchanged until an operator supplies a real Creem key. Otherwise it always
// returns a verdict carrying a `creem` stamp so the order row proves it ran.
export async function creemVerdict(fields, config = {}, deps = {}) {
  const key = config?.creemKey;
  // Treat the terraform placeholder ("unset"/empty) as DORMANT, mirroring how
  // the generic hook and the billing handler treat their placeholders: infra
  // owns that the parameter exists, the operator owns whether it has a real
  // value. Dormant => null => moderate() behaves exactly as before Creem existed.
  if (!key || key === "unset") return null;

  // The endpoint override honors the SAME placeholder discipline as the key:
  // "" and "unset" mean NOT CONFIGURED, never a URL. A literal "unset" in the
  // SSM parameter took production down: it is truthy, so it reached fetch(),
  // fetch("unset") threw, and the fail-closed screen blocked every order.
  // The default is key-prefix aware: creem_test_ keys screen against Creem's
  // test host, live keys against the live one.
  const override = config?.creemEndpoint;
  const endpoint = (override && override !== "unset")
    ? override
    : (key.startsWith("creem_test_")
      ? "https://test-api.creem.io/v1/moderation/prompt"
      : "https://api.creem.io/v1/moderation/prompt");
  const fetchFn = deps.fetch || globalThis.fetch;
  // Creem recommends roughly a 5 second timeout with a clean retryable error.
  const timeoutMs = Number(config?.creemTimeoutMs) || 5000;

  // A stable external_id ties every screening call to our order record so a
  // Creem audit can line up "we screened prompt X" with "we generated order X".
  // Every chunk of one order carries the SAME external_id: chunks are parts of
  // one prompt, not separate prompts, and the audit unit is the order.
  const externalId = fields?.orderId ?? config?.orderId ?? null;

  // one POST per chunk, fail-closed per chunk, so no part of the text can reach
  // the model without a Creem opinion on record.
  const screenChunk = async (prompt) => {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const r = await fetchFn(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Creem authenticates with x-api-key, NOT a Bearer header; this is the
          // key difference from our generic hook's Authorization scheme.
          "x-api-key": key,
        },
        body: JSON.stringify({
          prompt,
          ...(externalId != null && externalId !== "" ? { external_id: String(externalId) } : {}),
        }),
        ...(controller ? { signal: controller.signal } : {}),
      });
      // FAIL CLOSED on any non-2xx (5xx included): a compliance screen that could
      // not render a clean verdict must BLOCK, never wave the prompt through.
      if (!r || !r.ok) {
        return {
          allowed: false,
          reasons: [`creem moderation unavailable (status ${r?.status ?? "none"}); blocked fail-closed`],
          severity: "high",
          source: "creem",
          creem: "blocked",
        };
      }
      const data = await r.json();
      // Read ONLY `decision`; ignore any other (experimental) fields rather than
      // failing on them. Normalize so unexpected casing/whitespace cannot sneak an
      // unrecognized value past as "allow".
      const decision = String(data?.decision ?? "").trim().toLowerCase();
      if (decision === "allow") {
        return { allowed: true, reasons: [], severity: "clear", source: "creem", creem: "allow" };
      }
      // flag AND deny both BLOCK, treated identically per Creem's rules. Any other
      // value (unknown/missing decision) also blocks: fail closed, never assume ok.
      const known = decision === "flag" || decision === "deny";
      return {
        allowed: false,
        reasons: [known ? `creem moderation ${decision}` : "creem moderation returned an unrecognized decision"],
        severity: "high",
        source: "creem",
        creem: known ? decision : "blocked",
      };
    } catch (e) {
      // Timeout (AbortController) / network / bad JSON: FAIL CLOSED. This is the
      // deliberate opposite of hostedVerdict's catch, which returns null. Log so an
      // outage is visible in CloudWatch, and surface a retryable-shaped reason, but
      // BLOCK the order: an unscreened prompt must not reach the model under Creem.
      console.error(JSON.stringify({ level: "error", msg: "creem moderation failed closed", err: e?.message }));
      return {
        allowed: false,
        reasons: [`creem moderation error (${e?.message || "timeout"}); blocked fail-closed`],
        severity: "high",
        source: "creem",
        creem: "error",
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const results = await pooled(chunkText(briefText(fields)), screenChunk);

  // Merge across chunks, and the ORDER of precedence is load-bearing:
  //   1. Any flag/deny chunk: a CONFIRMED verdict wins over everything,
  //      including another chunk's outage, so the block stays TERMINAL
  //      (isTransientFailure reads the stamp, and flag/deny is never transient).
  //      "deny" outranks "flag" in the stamp when both appear.
  //   2. Else any unavailable chunk (blocked/error): the screen could not render
  //      a clean verdict for the whole text, so FAIL CLOSED, stamped unavailable
  //      so the pipeline stalls and retries instead of terminally rejecting.
  //   3. Else every chunk said allow: allow.
  const verdicts = results.filter((v) => v && (v.creem === "flag" || v.creem === "deny"));
  if (verdicts.length) {
    const reasons = [...new Set(verdicts.flatMap((v) => v.reasons))];
    return {
      allowed: false,
      reasons,
      severity: "high",
      source: "creem",
      creem: verdicts.some((v) => v.creem === "deny") ? "deny" : "flag",
    };
  }
  const outages = results.filter((v) => v && (v.creem === "blocked" || v.creem === "error"));
  if (outages.length) {
    const reasons = [...new Set(outages.flatMap((v) => v.reasons))];
    return { allowed: false, reasons, severity: "high", source: "creem", creem: outages[0].creem };
  }
  return { allowed: true, reasons: [], severity: "clear", source: "creem", creem: "allow" };
}

// TRANSIENT-vs-VERDICT: the distinction the whole recovery path turns on.
//
// A blocking verdict can mean two DIFFERENT things, and collapsing them is the
// bug this predicate exists to prevent (the next reader WILL re-collapse them
// otherwise). Both make `allowed` false, because in BOTH cases an unscreened or
// disallowed prompt must never reach the model; the security floor is identical.
// But WHY the block happened decides how the pipeline should recover:
//
//   - A VERDICT is a real, confirmed content decision: the deterministic floor
//     hit a category, the hosted layer returned a positive "flagged", or Creem
//     returned "flag"/"deny". This is the customer's brief being rejected on its
//     merits. It is TERMINAL: retrying screens the same text and reaches the same
//     answer, so the order is rejected for good.
//
//   - A TRANSIENT FAILURE is Creem failing CLOSED because it could not render a
//     clean verdict at all: a timeout / transport error (creem === "error") or a
//     non-2xx / 5xx (creem === "blocked"). Nothing is known about the brief; a
//     vendor was simply unreachable for this attempt. This is NOT the customer's
//     fault and must be RETRIED with backoff, then parked in human_review (which
//     an operator can recover), never terminally rejected.
//
// Creem is the ONLY layer that can produce a transient block: the deterministic
// floor is offline/pure (verdict only) and the hosted hook FAILS OPEN (an outage
// returns null, never a block). So a block is transient IFF Creem failed closed
// on an unavailability AND nothing else independently confirmed a violation. The
// second clause matters: if the floor/hosted/Creem-decision ALSO blocked, there
// is a real verdict on record and it stays terminal even while Creem was down.
export function isTransientFailure(base, hosted, creem) {
  const deterministicBlocked = !base.allowed;
  const hostedBlocked = Boolean(hosted && !hosted.allowed);
  const creemUnavailable = Boolean(creem && (creem.creem === "error" || creem.creem === "blocked"));
  const creemVerdictBlock = Boolean(creem && !creem.allowed && (creem.creem === "flag" || creem.creem === "deny"));
  // transient only when Creem was unavailable AND no layer confirmed a violation
  return creemUnavailable && !deterministicBlocked && !hostedBlocked && !creemVerdictBlock;
}

// Fold one provider verdict into the running merged verdict under the same
// "stricter wins" rule the module has always used: if EITHER side blocks, the
// brief is blocked, and we keep the union of reasons and the worse severity so
// the stored row shows everything that was seen. `label` names the layer that
// contributed a block, so `source` stays meaningful for the audit trail.
function mergeVerdict(base, layer, label) {
  if (!layer) return base; // layer dormant or (for the generic hook) failed open
  if (!layer.allowed) {
    const reasons = [...new Set([...base.reasons, ...layer.reasons])];
    return {
      allowed: false,
      reasons,
      severity: worseSeverity(base.severity, layer.severity),
      // if the floor was already clean, this layer is the sole blocker; else both
      source: base.allowed ? label : "both",
    };
  }
  // layer allowed: the base remains authoritative (a base block still blocks).
  if (!base.allowed) return base;
  return { allowed: true, reasons: [], severity: "clear", source: base.source === "deterministic" ? label : "both" };
}

// The single entry point the pipeline calls. Always runs the deterministic
// floor; layers the optional hosted hook AND the optional Creem provider screen
// on top when each is configured. The merge rule is "stricter wins": if ANY
// layer blocks, the brief is blocked. That keeps the deterministic block
// authoritative even when a layer says "clean", and lets either network layer
// add a block the keywords missed. The Creem decision, when Creem ran, is
// stamped onto the returned verdict (verdict.creem) so the order row can PROVE
// per order that Creem screening happened before any generation.
export async function moderate(fields, config = {}, deps = {}) {
  const base = deterministicVerdict(fields);

  // Both network screens are independent of each other and of the floor, so run
  // them concurrently to keep validate latency to a single ~5s budget, not two.
  const [hosted, creem] = await Promise.all([
    hostedVerdict(fields, config, deps), // null when unconfigured OR failed open
    creemVerdict(fields, config, deps),  // null ONLY when dormant; blocks on error (fail closed)
  ]);

  // Merge the generic hook first, then Creem, under identical stricter-wins
  // logic. Order does not change the allow/deny outcome (block is commutative);
  // it only affects the `source` label when exactly one network layer blocks.
  let verdict = mergeVerdict(base, hosted, "hosted");
  verdict = mergeVerdict(verdict, creem, "creem");

  // Stamp the raw Creem decision when Creem actually ran (dormant => no stamp),
  // so an auditor can confirm per order that the prompt was screened by Creem
  // before generation, and see exactly what Creem said.
  if (creem && creem.creem) verdict = { ...verdict, creem: creem.creem };

  // Stamp WHY a block happened so the pipeline can route recovery correctly.
  // `transient` is true ONLY when the sole reason the brief is blocked is Creem
  // being unavailable (fail-closed), with no confirmed violation from any layer.
  // A clean/allowed verdict is never transient. This flag is what lets validate
  // throw a retryable error (stall + retry + human_review) for an outage while
  // still throwing a terminal reject for a genuine content verdict. It never
  // changes `allowed`: an unscreened prompt is blocked either way (fail closed).
  verdict = { ...verdict, transient: !verdict.allowed && isTransientFailure(base, hosted, creem) };
  return verdict;
}

// Pull the moderation configuration out of the already-loaded SSM secrets bag.
// The pipeline loads all /cinefolio/<env> parameters once; every key below rides
// in that same bag, so there is no extra SSM round-trip. Kept here so the wiring
// in pipeline.mjs stays a one-liner and the parameter names live next to the
// code that reads them.
//
// Two independent screens are configured here:
//   - the generic hosted hook (MODERATION_API_URL / MODERATION_API_KEY), and
//   - the Creem provider screen (CREEM_MODERATION_API_KEY, with an optional
//     CREEM_MODERATION_API_URL that DEFAULTS to Creem's real endpoint so an
//     operator only has to supply the key to turn compliance screening on).
// Each stays dormant until its own key holds a real value, so adding Creem does
// not change behaviour for any environment that has not set the Creem key.
export function moderationConfigFromSecrets(sec = {}) {
  return {
    endpoint: sec.MODERATION_API_URL || "",
    key: sec.MODERATION_API_KEY || "",
    timeoutMs: Number(sec.MODERATION_TIMEOUT_MS) || 4000,
    // Creem: key alone arms the screen; URL defaults to the documented endpoint.
    creemKey: sec.CREEM_MODERATION_API_KEY || "",
    creemEndpoint: sec.CREEM_MODERATION_API_URL || "", // "" / "unset" resolve to the documented default inside creemVerdict (prefix-aware)
    creemTimeoutMs: Number(sec.CREEM_MODERATION_TIMEOUT_MS) || 5000,
  };
}
