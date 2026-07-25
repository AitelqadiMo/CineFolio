// head.js · the share-and-SEO head for every published CineFolio page.
//
// WHY this file exists: a published portfolio is a marketing surface. Our users
// are creatives whose whole behaviour is sharing their work, so a bare grey link
// with no preview card leaks the product on every share. This module turns every
// page into a rich Open Graph / Twitter card sourced ONLY from the user's real
// data (name, role, headline, their uploaded photo) plus the template's palette.
//
// THE ORIGIN SEAM. The engine compiles in the browser, where the site's final
// public address (https://{slug}.cinefolio.dev) is not yet known, and the server
// stores the compiled bundle. Crawlers do NOT resolve relative URLs, so og:url,
// canonical, og:image (the generated card) and the favicon must be ABSOLUTE. We
// solve this exactly like the audience beacon does: the engine bakes a token,
// ORIGIN_TOKEN, everywhere an absolute origin is needed, and the publisher
// (sites.mjs) rewrites the token to the real origin at publish time. The
// publisher is the one place that authoritatively knows the address. The user's
// own uploaded photo is already an absolute CDN URL, so it needs no token.
//
// NEVER a broken URL. Every asset a head references (the branded card, the
// favicon) is emitted as a REAL bundle file (base64 in the release), never a
// data: URI for og:image (crawlers cannot fetch data:), and never a path that
// will 404. When there is genuinely nothing real to point at, the tag is
// omitted: a missing og:image degrades to today's plain link; a broken one is worse.

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// esc for text placed inside an SVG we then base64-encode: same rules plus the
// apostrophe, so a name like `A'B` or `A<b` can never break a tag or attribute.
const escSvg = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

// The placeholder the engine bakes wherever an absolute site origin is required.
// The publisher rewrites it to https://{slug}.cinefolio.dev at publish time.
// Kept deliberately unmistakable so a substitution miss is obvious in the output.
export const ORIGIN_TOKEN = "__CF_ORIGIN__";

// stable per-release paths for the generated assets. WHY under assets/: keeps the
// release prefix tidy and matches the bundle asset path grammar the API accepts.
export const OG_CARD_PATH = "assets/og-card.svg";
export const FAVICON_PATH = "assets/favicon.svg";

// utf8-safe base64 for both the browser (btoa) and Node (Buffer), so the same
// code serves the live Studio and the verification script. WHY: btoa throws on
// multibyte characters, and a user's name may contain them.
function toB64(str) {
  const bytes = new TextEncoder().encode(str);
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  // eslint-disable-next-line no-undef
  return btoa(bin);
}

// pull a full absolute link out of the parser's loose link shapes (github.com/x
// or https://x.dev). Returns "" when there is nothing real, because sameAs must
// never carry a fabricated or half-formed link.
function absLink(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : "https://" + s.replace(/^\/+/, "");
}

// does the profile carry a real, already-hosted photo (not an inline data: URL)?
// A data: photo never reached our CDN, so it is not a fetchable og:image.
const realPhoto = (p) => (p.photo && !String(p.photo).startsWith("data:") ? String(p.photo) : "");

// The branded share card: a 1200x630 SVG in the CineFolio cinematic look, built
// from the user's real name + role + the page palette. It is the og:image ONLY
// when the user has no uploaded photo. It ships as a REAL bundle file and is
// referenced by an absolute URL (ORIGIN_TOKEN + path), never a data: URI.
export function brandedOgCard({ name, role, bg, panel, accent, accent2, text }) {
  const initials = String(name || "")
    .split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "CF";
  const rawName = String(name || "").slice(0, 60);
  const rawRole = String(role || "").slice(0, 80);
  const displayName = escSvg(rawName);
  const displayRole = escSvg(rawRole);
  // The text column runs from x=290 to the inner frame edge (~1130), so ~840px.
  // A crawler rasterizes SVG with system fonts only, and <text> neither wraps nor
  // clips, so a long name would spill off the card. Two guards: (1) scale the
  // font down as the name lengthens, and (2) pin textLength to the column width
  // so it can NEVER overflow (lengthAdjust squeezes the glyphs to fit). WHY both:
  // the size step keeps short names bold and handsome; textLength is the hard cap.
  const COL = 840;
  const nameSize = rawName.length <= 16 ? 76 : rawName.length <= 26 ? 60 : rawName.length <= 38 ? 46 : 36;
  const roleSize = rawRole.length <= 40 ? 30 : 24;
  // only constrain width when the natural text is likely wider than the column,
  // so short strings keep their natural spacing instead of being stretched.
  const nameFit = rawName.length * nameSize * 0.6 > COL ? ` textLength="${COL}" lengthAdjust="spacingAndGlyphs"` : "";
  const roleFit = rawRole.length * roleSize * 0.55 > COL ? ` textLength="${COL}" lengthAdjust="spacingAndGlyphs"` : "";
  // A cinematic frame: dark field, a soft accent glow, a monogram disc, the name
  // in a heavy display face, the role in mono caps, the CineFolio mark. Mirrors
  // the "feature presentation" language of the live templates.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${displayName}, ${displayRole}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="75%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.30"/>
      <stop offset="60%" stop-color="${accent2}" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="${bg}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ink" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${accent2}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="${bg}"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="40" y="40" width="1120" height="550" fill="none" stroke="${text}" stroke-opacity="0.14" rx="18"/>
  <circle cx="150" cy="315" r="86" fill="${panel}" stroke="${accent2}" stroke-width="3"/>
  <text x="150" y="348" font-family="Georgia, 'Times New Roman', serif" font-size="72" font-weight="700" fill="${accent2}" text-anchor="middle">${escSvg(initials)}</text>
  <text x="290" y="250" font-family="Georgia, 'Times New Roman', serif" font-size="17" letter-spacing="8" fill="${accent2}">FEATURE PRESENTATION</text>
  <text x="290" y="345" font-family="Arial, Helvetica, sans-serif" font-size="${nameSize}" font-weight="800" fill="${text}"${nameFit}>${displayName}</text>
  <text x="290" y="410" font-family="'Courier New', monospace" font-size="${roleSize}" letter-spacing="2" fill="${text}" fill-opacity="0.82"${roleFit}>${displayRole}</text>
  <rect x="292" y="440" width="120" height="5" rx="2.5" fill="url(#ink)"/>
  <text x="1120" y="560" font-family="'Courier New', monospace" font-size="20" letter-spacing="4" fill="${accent2}" text-anchor="end">◈ CINEFOLIO</text>
</svg>`;
}

// A branded favicon in the palette: a small monogram tile. Cheap, deliberate,
// always present so a shared tab never shows the browser's blank glyph. Ships as
// a real bundle file too, so the icon URL is absolute and 200s.
export function faviconSvg({ bg, accent, accent2 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="14" fill="${bg}"/>
  <rect x="6" y="6" width="52" height="52" rx="11" fill="none" stroke="${accent2}" stroke-opacity="0.5" stroke-width="2"/>
  <text x="32" y="45" font-family="Georgia, serif" font-size="34" font-weight="700" fill="${accent}" text-anchor="middle">◈</text>
</svg>`;
}

// The og:image decision, layered and honest. Returns the ABSOLUTE og:image URL,
// or "" when we cannot honestly promise a real one.
//   Tier 1: the user's uploaded photo, already an absolute CDN URL that 200s.
//           A headshot is not 1.91:1, but LinkedIn/Slack/Discord/WhatsApp accept
//           and crop non-card ratios, and a real face is a stronger card than a
//           generated tile. Reframing would need server-side compositing we do
//           not have, so we use it as-is.
//   Tier 2: no photo, so the generated branded card, shipped as a real bundle file
//           and referenced by ORIGIN_TOKEN + path (absolute after publish).
// There is no Tier that returns a relative URL or a data: URI.
function ogImageUrl(p) {
  const photo = realPhoto(p);
  if (photo) return photo;
  return ORIGIN_TOKEN + "/" + OG_CARD_PATH;
}

// Build the complete share + SEO head fragment for one page. The caller keeps
// ownership of <title> and the base <meta name="description">, so nothing here
// duplicates them.
//   p, pal      profile + palette (pal for id/label only; colours come in colors)
//   opts.path   page path relative to origin ("" home, "projects/x.html" case)
//   opts.title  share title (og:title / twitter:title)
//   opts.description  meta description (og:description / twitter:description)
//   opts.type   "profile" (home) or "article" (case study)
//   opts.colors { bg, panel, accent, accent2, text } from the calling template
//   opts.person true to emit schema.org Person JSON-LD (home page only)
export function buildShareHead(p, pal, opts = {}) {
  const { path = "", title = "", description = "", type = "profile", colors = {}, person = false } = opts;
  const canonical = ORIGIN_TOKEN + "/" + String(path || "").replace(/^\/+/, "");
  const imgUrl = ogImageUrl(p);
  const isGeneratedCard = imgUrl.startsWith(ORIGIN_TOKEN);
  const themeColor = colors.bg || "";
  const favUrl = ORIGIN_TOKEN + "/" + FAVICON_PATH;

  const out = [];

  // Open Graph.
  out.push(`<meta property="og:type" content="${esc(type)}">`);
  out.push(`<meta property="og:site_name" content="CineFolio">`);
  out.push(`<meta property="og:title" content="${esc(title)}">`);
  if (description) out.push(`<meta property="og:description" content="${esc(description)}">`);
  out.push(`<meta property="og:url" content="${esc(canonical)}">`);
  out.push(`<meta property="og:image" content="${esc(imgUrl)}">`);
  out.push(`<meta property="og:image:alt" content="${esc(title)}">`);
  if (isGeneratedCard) {
    // only the generated card has a known type + dimensions; declaring them helps
    // LinkedIn/Slack/Discord lay out the 1.91:1 slot before the fetch resolves.
    out.push(`<meta property="og:image:type" content="image/svg+xml">`);
    out.push(`<meta property="og:image:width" content="1200">`);
    out.push(`<meta property="og:image:height" content="630">`);
  }

  // Twitter / X. summary_large_image gives the full-width card; naming the fields
  // explicitly is more robust than relying on the og:* fallback alone.
  out.push(`<meta name="twitter:card" content="summary_large_image">`);
  out.push(`<meta name="twitter:title" content="${esc(title)}">`);
  if (description) out.push(`<meta name="twitter:description" content="${esc(description)}">`);
  out.push(`<meta name="twitter:image" content="${esc(imgUrl)}">`);

  // Canonical, theme colour, branded favicon + apple-touch (same mark, one truth).
  out.push(`<link rel="canonical" href="${esc(canonical)}">`);
  if (themeColor) out.push(`<meta name="theme-color" content="${esc(themeColor)}">`);
  out.push(`<link rel="icon" type="image/svg+xml" href="${esc(favUrl)}">`);
  out.push(`<link rel="apple-touch-icon" href="${esc(favUrl)}">`);

  // JSON-LD Person: home page only, real fields only. Never aggregateRating or
  // anything unsubstantiated. sameAs carries only links the user actually gave.
  if (person) {
    const jsonld = { "@context": "https://schema.org", "@type": "Person", name: p.name };
    if (p.headline) jsonld.jobTitle = p.headline;
    jsonld.url = canonical;
    jsonld.image = imgUrl;
    if (p.email) jsonld.email = "mailto:" + p.email;
    if (p.summary) jsonld.description = p.summary;
    const same = [absLink(p.links?.linkedin), absLink(p.links?.github), absLink(p.links?.website)].filter(Boolean);
    if (same.length) jsonld.sameAs = same;
    // drop </script> defensively so a profile value can never break out.
    out.push(`<script type="application/ld+json">${JSON.stringify(jsonld).replace(/<\/script/gi, "<\\/script")}</script>`);
  }

  return out.join("\n");
}

// The share assets a release must ship so every URL the heads reference 200s:
// the branded favicon always, and the generated og:image card when the user
// uploaded no photo. Returned as [{ path, content(base64), type }] to ride the
// bundle's own file list (the client forwards it unchanged) and be persisted by
// the publisher. `colors` must be the SAME mapping the head used so the stored
// card matches the visitor's skin exactly.
export function shareAssets(p, colors = {}) {
  const assets = [{ path: FAVICON_PATH, content: toB64(faviconSvg(colors)), type: "image/svg+xml" }];
  if (!realPhoto(p)) {
    assets.push({ path: OG_CARD_PATH, content: toB64(brandedOgCard({ name: p.name, role: p.headline, ...colors })), type: "image/svg+xml" });
  }
  return assets;
}

// The colour roles each template hands its head + card, keyed by template id.
// WHY here: each template destructures pal.vars in its own order, and the bundle
// builder needs the SAME { bg, panel, accent, accent2, text } mapping to generate
// the stored card without re-running a template. Keep in lockstep with the object
// each *compile() passes to indexHead()/caseHead() in engine.js.
export function paletteColors(templateId, pal) {
  const v = pal.vars;
  switch (templateId) {
    case "editorial": return { bg: v[0], panel: v[1], accent: v[2], accent2: v[3], text: v[1] };
    case "terminal": return { bg: v[0], panel: v[0], accent: v[1], accent2: v[2], text: v[1] };
    case "gallery": return { bg: v[0], panel: v[1], accent: v[2], accent2: v[3], text: v[1] };
    case "bento": return { bg: v[0], panel: v[1], accent: v[2], accent2: v[4], text: v[3] };
    case "monolith":
    default: return { bg: v[0], panel: v[1], accent: v[2], accent2: v[3], text: v[4] };
  }
}
