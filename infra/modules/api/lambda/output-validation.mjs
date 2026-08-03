import { createHash } from "node:crypto";
import { posix } from "node:path";

export const PREMIUM_DIRECTOR_CONTRACT = "premium-depth-v1";
export const PREMIUM_DIRECTOR_KIT_SHA256 = "62f903747aaa851bfc66ee268f5a6adbd2f17dc029c800e3083c48a2888f557c";
const REQUIRED_DEPTH_BEATS = ["hero", "work", "signature"];
const EXTERNAL_REF_RE = /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i;

// Find a style rule that applies overflow(-x/-y):hidden to html or body — the
// selector-level trap that silently breaks position:sticky pinned scenes.
function stickyKillerSelector(html) {
  const css = [...String(html).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = rule.exec(css))) {
    const selector = m[1];
    if (!/(^|[\s,>~+])(html|body)\s*(?:[,{:]|$)/i.test(selector.trim() + "{")) continue;
    if (/overflow(?:-[xy])?\s*:\s*hidden/i.test(m[2])) return selector.trim().replace(/\s+/g, " ").slice(0, 60);
  }
  return null;
}

function htmlOf(files, path) {
  return files.find((f) => f?.path === path)?.html || "";
}

function hiddenClassesOf(html) {
  const classes = new Set();
  const styles = [...String(html).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  for (const css of styles) {
    const re = /\.([a-z0-9_-]+)[^{,]*\{[^}]*display\s*:\s*none\b[^}]*\}/gi;
    let m;
    while ((m = re.exec(css))) classes.add(m[1]);
  }
  return classes;
}

function activeMarkup(html) {
  let clean = String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, "");
  const hiddenClasses = hiddenClassesOf(html);
  const hiddenClass = hiddenClasses.size
    ? `|class\\s*=\\s*["'][^"']*(?:${[...hiddenClasses].join("|")})[^"']*["']`
    : "";
  const hidden = new RegExp(`<([a-z][a-z0-9:-]*)\\b[^>]*(?:\\bhidden\\b|aria-hidden\\s*=\\s*["']true["']|style\\s*=\\s*["'][^"']*display\\s*:\\s*none[^"']*["']${hiddenClass})[^>]*>[\\s\\S]*?<\\/\\1>`, "gi");
  for (let i = 0; i < 4; i += 1) clean = clean.replace(hidden, "");
  return clean;
}

function structuralMarkup(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, "")
    .replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi, "<script$1></script>")
    .replace(/<style\b([^>]*)>[\s\S]*?<\/style>/gi, "<style$1></style>");
}

function blockWithAttr(html, attr) {
  const clean = activeMarkup(html);
  const re = new RegExp(`<((?:section|main|nav|div|footer))\\b(?=[^>]*\\b${attr}(?:\\s|=|>))[^>]*>([\\s\\S]*?)<\\/\\1>`, "i");
  return clean.match(re)?.[2] || "";
}

function visibleMarker(html, attr, value) {
  const clean = activeMarkup(html);
  const val = value ? `\\s*=\\s*["']${value}["']` : "(?:\\s|=|>)";
  const re = new RegExp(`<[^>]+\\b${attr}${val}[^>]*>`, "i");
  const tag = clean.match(re)?.[0] || "";
  return tag && !/\bhidden\b|aria-hidden\s*=\s*["']true["']|style\s*=\s*["'][^"']*display\s*:\s*none/i.test(tag);
}

function count(haystack, pattern) {
  return [...String(haystack).matchAll(pattern)].length;
}

function attrsOfTags(html, tag) {
  const out = [];
  const re = new RegExp(`<${tag}\\b([^>]*)>`, "gi");
  let m;
  while ((m = re.exec(html))) out.push(m[1] || "");
  return out;
}

function attrValue(attrs, name) {
  return String(attrs || "").match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] || "";
}

function directorKitHash(html) {
  const script = String(html).match(/<script data-cf-kit="depth-v1">[\s\S]*?<\/script>/i)?.[0] || "";
  const style = String(html).match(/<style data-cf-kit="depth-v1">[\s\S]*?<\/style>/i)?.[0] || "";
  if (!script || !style) return "";
  const canonical = `${script}\n${style}`.replace(/\r\n/g, "\n").split("\n").map((line) => line.trim()).join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

function relativeRefs(files) {
  const refs = [];
  const add = (page, rawValue) => {
    const raw = String(rawValue || "").trim();
    if (!raw || EXTERNAL_REF_RE.test(raw)) return;
    const clean = raw.split(/[?#]/)[0];
    if (!clean) return;
    const resolved = posix.normalize(posix.join(posix.dirname(page), clean));
    refs.push({ page, raw, resolved });
  };
  for (const f of files.filter((x) => typeof x?.html === "string")) {
    const attrs = /\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi;
    let m;
    while ((m = attrs.exec(f.html))) add(f.path, m[1]);
    const srcsets = /\bsrcset\s*=\s*["']([^"']+)["']/gi;
    while ((m = srcsets.exec(f.html))) {
      for (const candidate of m[1].split(",")) add(f.path, candidate.trim().split(/\s+/)[0]);
    }
    const css = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
    while ((m = css.exec(f.html))) add(f.path, m[1]);
  }
  return refs;
}

export function inspectDirectorOutput(files, uploadedPaths = [], { strict = true, allowedRemoteMedia = [] } = {}) {
  const errors = [];
  const warnings = [];
  const index = htmlOf(files, "index.html");
  const known = new Set([...files.map((f) => f?.path).filter(Boolean), ...uploadedPaths]);
  const add = (target, code, detail) => target.push({ code, detail });

  for (const ref of relativeRefs(files)) {
    if (ref.resolved.startsWith("../") || ref.resolved === "..") {
      add(errors, "unsafe_relative_reference", `${ref.page}: ${ref.raw}`);
    } else if (!known.has(ref.resolved)) {
      add(strict ? errors : warnings, "missing_relative_reference", `${ref.page}: ${ref.raw} -> ${ref.resolved}`);
    }
  }

  if (!strict) return { errors, warnings, stats: { files: files.length, uploaded: uploadedPaths.length } };

  if (!files.some((f) => f?.path === "resume.html")) add(errors, "missing_resume", "resume.html is required");
  if (!/CINEFOLIO-DIRECTION:\s*[^<\n]+/i.test(index)) add(errors, "missing_direction", "index.html needs a CINEFOLIO-DIRECTION comment");

  const structural = structuralMarkup(index);
  const kitCount = count(structural, /data-cf-kit\s*=\s*["']depth-v1["']/gi);
  if (kitCount !== 2) add(errors, "kit_contract", `expected one script and one style for depth-v1, found ${kitCount} markers`);
  else if (directorKitHash(index) !== PREMIUM_DIRECTOR_KIT_SHA256) add(errors, "kit_integrity", "the supplied CineDepth kit must be pasted without modification");

  for (const beat of REQUIRED_DEPTH_BEATS) {
    if (!visibleMarker(index, "data-cf-depth", beat)) add(errors, "missing_depth_beat", beat);
  }
  if (!visibleMarker(index, "data-cf-signature")) add(errors, "missing_signature_interaction", "data-cf-signature is required on a visible element");
  if (!visibleMarker(index, "data-cf-control")) add(errors, "missing_signature_control", "data-cf-control is required on the signature interaction control");
  if (!visibleMarker(index, "data-cf-work-index")) add(errors, "missing_work_index", "data-cf-work-index is required on a visible element");
  if (!visibleMarker(index, "data-cf-contact")) add(errors, "missing_contact", "data-cf-contact is required on a visible element");
  if (!/prefers-reduced-motion\s*:\s*reduce/i.test(index)) add(errors, "missing_reduced_motion", "reduced-motion CSS is required");
  if (!/@media\s*\([^)]*(?:max-width\s*:\s*(?:390|600)px|pointer\s*:\s*coarse)/i.test(index)) add(errors, "missing_mobile_fallback", "mobile or coarse-pointer fallback is required");
  // position:sticky dies silently under an ancestor with overflow(-x/-y):hidden,
  // which turns every pinned scene into a multi-viewport void (the exact
  // failure shipped on the first two premium cuts: the mobile no-sideways-scroll
  // rule implemented as html,body{overflow-x:hidden}). The kit prevents sideways
  // scroll with html{overflow-x:clip}; hidden on html or body is never needed.
  for (const f of files) {
    if (!/\.html$/i.test(f?.path || "") || !/data-pin\b/i.test(f?.html || "")) continue;
    const killer = stickyKillerSelector(f.html);
    if (killer) add(errors, "sticky_killer", `${f.path}: overflow hidden on "${killer}" disables position:sticky and blanks pinned scenes; use overflow-x: clip on html (the kit already applies it)`);
  }

  const workBlock = blockWithAttr(index, "data-cf-work-index");
  const contactBlock = blockWithAttr(index, "data-cf-contact");
  const signatureBlock = blockWithAttr(index, "data-cf-signature");
  const projectLinks = count(workBlock, /href\s*=\s*["'](?:\.\/)?projects\/[a-z0-9_-]+\.html(?:[#?][^"']*)?["']/gi);
  if (projectLinks < 1) add(errors, "missing_project_link", "data-cf-work-index needs at least one normal project link");
  if (!/href\s*=\s*["']resume\.html(?:[#?][^"']*)?["']/i.test(contactBlock)) add(errors, "missing_resume_link", "data-cf-contact must link to resume.html");
  if (!/href\s*=\s*["']mailto:/i.test(contactBlock)) add(errors, "missing_email_link", "data-cf-contact must contain a mailto link");
  if (!/<a\b[^>]*href\s*=\s*["'][^"']+["']/i.test(signatureBlock)) add(errors, "missing_signature_bypass", "data-cf-signature needs a normal bypass link");
  if (!/data-cf-control(?:\s|=|>)/i.test(signatureBlock)) add(errors, "signature_control_outside", "data-cf-control must live inside data-cf-signature");
  const scriptedControl = /<script(?![^>]*data-cf-kit)[^>]*>[\s\S]*?(?:data-cf-control[\s\S]*?addEventListener|addEventListener[\s\S]*?data-cf-control)[\s\S]*?<\/script>/i.test(index);
  if (!scriptedControl && !/data-cf-control[^>]*on(?:click|input|change|keydown)\s*=/i.test(signatureBlock)) {
    add(errors, "missing_signature_logic", "the signature control needs keyboard or pointer interaction logic");
  }

  const resume = htmlOf(files, "resume.html");
  if (resume && !/@media\s+print/i.test(resume)) add(errors, "resume_print_styles", "resume.html needs @media print styles");
  if (resume && !/(window\.print\s*\(|on(?:click|keydown)\s*=\s*["'][^"']*print|<button\b[^>]*>\s*Print)/i.test(resume)) add(errors, "resume_print_control", "resume.html needs a working print control");

  const htmlFiles = files.filter((f) => typeof f?.html === "string");
  for (const page of htmlFiles) {
    const externalScripts = attrsOfTags(page.html, "script").map((attrs) => attrValue(attrs, "src")).filter(Boolean);
    for (const ref of externalScripts) add(errors, "external_javascript", `${page.path}: external JavaScript is prohibited: ${ref}`);
    const dynamicImports = [
      ...page.html.matchAll(/\bimport\s*\(\s*["']((?:https?:)?\/\/[^"']+)["']\s*\)/gi),
      ...page.html.matchAll(/\bfrom\s+["']((?:https?:)?\/\/[^"']+)["']/gi),
      ...page.html.matchAll(/@import\s+(?:url\()?\s*["']?((?:https?:)?\/\/[^"')\s;]+)["']?\s*\)?/gi),
    ];
    for (const m of dynamicImports) add(errors, "external_dependency", `${page.path}: external runtime dependency is prohibited: ${m[1]}`);
  }

  const videos = attrsOfTags(index, "video");
  if (!videos.length) add(errors, "missing_video", "index.html requires a generated cinematic video");
  const allowedRemote = new Set(allowedRemoteMedia.filter(Boolean));
  const mediaRefs = htmlFiles.flatMap((page) => {
    const pageVideos = attrsOfTags(page.html, "video");
    const cssUrls = [...page.html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map((m) => m[1]);
    const srcset = (attrs) => attrValue(attrs, "srcset").split(",").map((c) => c.trim().split(/\s+/)[0]).filter(Boolean);
    return [
      ...pageVideos.flatMap((attrs) => [attrValue(attrs, "src"), attrValue(attrs, "poster")]),
      ...attrsOfTags(page.html, "source").flatMap((attrs) => [attrValue(attrs, "src"), ...srcset(attrs)]),
      ...attrsOfTags(page.html, "img").flatMap((attrs) => [attrValue(attrs, "src"), ...srcset(attrs)]),
      ...cssUrls,
    ];
  }).filter(Boolean);
  for (const ref of mediaRefs) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref) && !allowedRemote.has(ref)) {
      add(errors, "external_generated_media", `generated visual media must be uploaded and referenced relatively: ${ref}`);
    }
  }
  videos.forEach((attrs, i) => {
    for (const attr of ["muted", "playsinline", "poster"]) {
      if (!new RegExp(`(?:^|\\s)${attr}(?:\\s|=|$)`, "i").test(attrs)) add(errors, "video_attribute", `video ${i + 1} missing ${attr}`);
    }
    if (!/preload\s*=\s*["']auto["']/i.test(attrs)) add(errors, "video_attribute", `video ${i + 1} missing preload=auto`);
  });

  if (!/(pause|play).{0,80}(button|aria-label)|(?:button|aria-label).{0,80}(pause|play)/is.test(index)) {
    add(warnings, "motion_control", "no visible pause or play control was detected");
  }
  if (!/(skip|view work|open case study)/i.test(index)) add(warnings, "missing_bypass_copy", "no clear cinematic bypass copy was detected");

  return {
    errors,
    warnings,
    stats: {
      files: files.length,
      uploaded: uploadedPaths.length,
      projectLinks,
      videos: videos.length,
      depthBeats: REQUIRED_DEPTH_BEATS.filter((beat) => visibleMarker(index, "data-cf-depth", beat)).length,
    },
  };
}
