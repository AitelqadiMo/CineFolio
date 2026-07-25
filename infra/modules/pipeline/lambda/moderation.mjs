// moderation.mjs: the content screening layer that runs on EVERY order brief
// BEFORE it reaches the AI director. Creem (our payment provider) mandates a
// prompt-moderation surface for any product that generates images or video, and
// our pipeline generates both, so this file is a compliance hard-requirement,
// not a nicety: an unscreened generation product cannot be approved.
//
// Two layers, by design:
//   1. DETERMINISTIC layer (always runs): a keyword + regex screen with zero
//      dependencies and zero network cost. It works offline, in a cold Lambda,
//      and during any provider outage, so there is ALWAYS a moderation verdict
//      on record even when nothing else is reachable. This is the floor.
//   2. HOSTED layer (optional): an SSM-configured moderation endpoint. It only
//      runs when both the endpoint and the key are present. It exists to catch
//      what a keyword screen cannot (paraphrase, obfuscation, novel harms).
//
// The two layers have DELIBERATELY OPPOSITE failure doctrines, and the reason
// matters for revenue and for safety both:
//   - The hosted call FAILS OPEN to the deterministic verdict. A moderation
//     vendor outage, timeout, or 5xx must never brick a paid order. The money
//     flow survives on the deterministic floor, exactly like mail and the other
//     side effects in this codebase fail soft.
//   - BUT a hosted call that returns a POSITIVE violation FAILS CLOSED: we
//     reject. This is the one deliberate exception to the fail-soft doctrine.
//     A confirmed content violation MUST block dispatch; letting a flagged
//     brief through to an image/video generator is the exact failure the
//     provider requirement exists to prevent, so here "soft" is not an option.
//
// The verdict shape { allowed, reasons[], severity } is stored on the order row
// so we can PROVE to a provider reviewer that moderation ran and what it found.

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
      /\b(kill|murder|assassinate|attack|shoot|stab|bomb)\s+(?:my|the|a|him|her|them)\b/,
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

// The always-on floor. Pure, synchronous, offline, no cost. Given the brief's
// free-text fields, return a structured verdict. This is what the hosted layer
// falls back TO on any error, so it must stand entirely on its own.
export function deterministicVerdict(fields) {
  const blob = [fields?.customIdea, fields?.cvText, fields?.name]
    .map((v) => String(v ?? ""))
    .join("\n");
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
  const input = [fields?.customIdea, fields?.cvText, fields?.name]
    .map((v) => String(v ?? ""))
    .join("\n")
    .slice(0, 8000); // cap payload; the free-text fields are already clamped upstream

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
}

// The single entry point the pipeline calls. Always runs the deterministic
// floor; layers the hosted opinion on top when configured. The merge rule is
// "stricter wins": if EITHER layer blocks, the brief is blocked. That keeps the
// deterministic block authoritative even when the hosted layer says "clean",
// and lets the hosted layer add a block the keywords missed.
export async function moderate(fields, config = {}, deps = {}) {
  const base = deterministicVerdict(fields);
  const hosted = await hostedVerdict(fields, config, deps); // null when unconfigured or failed open

  if (!hosted) return base; // deterministic floor stands alone

  if (!hosted.allowed) {
    // hosted block wins outright, and we preserve any deterministic reasons too
    // so the stored verdict shows everything that was seen.
    const reasons = [...new Set([...base.reasons, ...hosted.reasons])];
    return {
      allowed: false,
      reasons,
      severity: worseSeverity(base.severity, hosted.severity),
      source: base.allowed ? "hosted" : "both",
    };
  }

  // hosted allowed: the deterministic verdict remains authoritative. If the
  // floor blocked, we STILL block (stricter wins); otherwise it is clean.
  if (!base.allowed) return base;
  return { allowed: true, reasons: [], severity: "clear", source: "both" };
}

// Pull the hosted-hook configuration out of the already-loaded SSM secrets bag.
// The pipeline loads all /cinefolio/<env> parameters once; these two keys ride
// in that same bag, so there is no extra SSM round-trip. Kept here so the wiring
// in pipeline.mjs stays a one-liner and the parameter names live next to the
// code that reads them.
export function moderationConfigFromSecrets(sec = {}) {
  return {
    endpoint: sec.MODERATION_API_URL || "",
    key: sec.MODERATION_API_KEY || "",
    timeoutMs: Number(sec.MODERATION_TIMEOUT_MS) || 4000,
  };
}
