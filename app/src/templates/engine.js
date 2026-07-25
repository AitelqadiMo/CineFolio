// The compiler entry point. The five template families live in ./families/*
// and the helpers they share live in ./shared.js. This file owns the registry
// and the two compile paths, and re-exports the shared API so every existing
// importer of engine.js keeps working unchanged.
export { esc, indexHead, caseHead, SKILL_BANK, SECTION_RE, PERIOD_RE, parseProfile, cap, initialsAvatar, linkRow, creditBadge, credit, normExperience, hasCerts, hasEduObjs, hasLangObjs, eduLabel, langLabel, slugify, caseStudyList, isCaseStudy, metaRow, csBlocks, noHref } from "./shared.js";
import { shareAssets, paletteColors } from "./head.js";
import { esc, indexHead, caseHead, SKILL_BANK, SECTION_RE, PERIOD_RE, parseProfile, cap, initialsAvatar, linkRow, creditBadge, credit, normExperience, hasCerts, hasEduObjs, hasLangObjs, eduLabel, langLabel, slugify, caseStudyList, isCaseStudy, metaRow, csBlocks, noHref } from "./shared.js";
import { monolith, monolithCase } from "./families/monolith.js";
import { editorial, editorialCase } from "./families/editorial.js";
import { terminal, terminalCase } from "./families/terminal.js";
import { gallery, galleryCase } from "./families/gallery.js";
import { bento, bentoCase } from "./families/bento.js";

export const TEMPLATES = [
  {
    id: "monolith", name: "The Monolith", blurb: "Cinematic dark. Kinetic type, marquee, timeline scenes.",
    compile: monolith, caseCompile: monolithCase,
    palettes: [
      { id: "jersey", label: "Jersey", vars: ["#0E1C3F", "#132550", "#C8102E", "#D9A441", "#F4EFE6"] },
      { id: "lavender", label: "Lavender", vars: ["#141126", "#1D1837", "#8B5CF6", "#C4B5FD", "#EFEAFF"] },
      { id: "ember", label: "Ember", vars: ["#160D0B", "#241410", "#E8442E", "#F0A860", "#F5E9DC"] },
    ],
  },
  {
    id: "editorial", name: "The Editorial", blurb: "Light magazine. Serif mastheads, ruled sections, recruiter-calm.",
    compile: editorial, caseCompile: editorialCase,
    palettes: [
      { id: "bone", label: "Bone", vars: ["#F4EFE6", "#1A1712", "#C8102E", "#6E655A"] },
      { id: "sage", label: "Sage", vars: ["#EEF1EA", "#1C221A", "#0E9E62", "#5F6B5C"] },
      { id: "slate", label: "Slate", vars: ["#EDF0F4", "#141A24", "#2557D6", "#5A6678"] },
    ],
  },
  {
    id: "terminal", name: "The Terminal", blurb: "Engineer's console. Prompt, skill bars, git-log career.",
    compile: terminal, caseCompile: terminalCase,
    palettes: [
      { id: "phosphor", label: "Phosphor", vars: ["#07100a", "#33ff88", "#ffc857", "#7ea08b"] },
      { id: "amber", label: "Amber CRT", vars: ["#100b04", "#ffb454", "#7fdb8f", "#a08a6a"] },
      { id: "ice", label: "Ice", vars: ["#070d14", "#6fd3ff", "#ffd166", "#7a93a8"] },
    ],
  },
  {
    id: "gallery", name: "The Gallery", blurb: "Luminous fine-photography. Serif display, hairline rules, edge-to-edge covers.",
    compile: gallery, caseCompile: galleryCase,
    palettes: [
      { id: "porcelain", label: "Porcelain", vars: ["#F6F2EA", "#1C1A17", "#9A6A3C", "#8A8378", "#DFD8CC"] },
      { id: "silver", label: "Silver", vars: ["#ECEDEF", "#16181B", "#4A5B6E", "#6D7681", "#D2D5DA"] },
      { id: "sepia", label: "Sepia", vars: ["#F3E9D8", "#2A2117", "#9C5A2C", "#8A7355", "#DFCFB4"] },
    ],
  },
  {
    id: "bento", name: "The Bento", blurb: "Rounded-tile grid. Identity tile, project tiles, link-in-bio grown up.",
    compile: bento, caseCompile: bentoCase,
    palettes: [
      { id: "sorbet", label: "Sorbet", vars: ["#FBF3EC", "#FFFFFF", "#E0607E", "#2C2530", "#7A7280"] },
      { id: "graphite", label: "Graphite", vars: ["#0D0F12", "#191C21", "#5EC8C0", "#EDEFF2", "#9AA3AD"] },
      { id: "citrus", label: "Citrus", vars: ["#FFFFFF", "#F5F6F8", "#F2591E", "#181A1D", "#6C727A"] },
    ],
  },
];

export const DEFAULT_SECTIONS = { about: true, skills: true, experience: true, projects: true, education: true, services: false, testimonials: false, contact: true };
// metricsBlocks and METRICS_CAP are exported so the test suite can exercise the
// helper directly without going through a full compile, and so callers that
// build custom templates outside the five families can reuse the shared renderer.
export { metricsBlocks, METRICS_CAP } from "./shared.js";

// opts.badge: the "Made with CineFolio" end credit. ON by default; pass false to
// omit it (the owner turned it off, for free, in Films.jsx). It is a per-render
// choice so the very next publish reflects the current preference exactly.
export function compile(templateId, paletteId, profile, opts = {}) {
  const t = TEMPLATES.find((x) => x.id === templateId) || TEMPLATES[0];
  const pal = t.palettes.find((x) => x.id === paletteId) || t.palettes[0];
  const sections = { ...DEFAULT_SECTIONS, ...(opts.sections || {}) };
  // Single-page compile is the home page (Studio live preview / a direct save):
  // no caseHref (inline expanders stay). It still carries the full share head so
  // the moment it is published it has its card. The head's absolute URLs use
  // ORIGIN_TOKEN, which the publisher rewrites; in the un-published live preview
  // the token simply stays put, which is fine, because the preview is never crawled.
  return t.compile(profile, pal, sections, { badge: opts.badge });
}

// ---------- multi-page bundle compiler ----------
// files[0] is always index.html: the compile() output, except case-study cards
// link out to projects/{slug}.html (relative). Then one standalone page per case
// study (capped at 12), each in its template family's own skin. Finally the
// SHARE ASSETS ride in the same files[] list as base64 entries so the existing
// client publish path forwards them unchanged and the publisher persists them.
export function compileBundle(templateId, paletteId, profile, opts = {}) {
  const t = TEMPLATES.find((x) => x.id === templateId) || TEMPLATES[0];
  const pal = t.palettes.find((x) => x.id === paletteId) || t.palettes[0];
  const sections = { ...DEFAULT_SECTIONS, ...(opts.sections || {}) };
  const badge = opts.badge; // undefined -> on by default; false -> owner removed it

  const cases = caseStudyList(profile.projects);
  const slugFor = new Map(cases.map(({ pr, slug }) => [pr, slug]));
  const caseHref = (pr) => { const s = slugFor.get(pr); return s ? "projects/" + s + ".html" : ""; };

  const files = [];
  // the index (home) page: its head describes the person; caseHref links cards out.
  files.push({ path: "index.html", html: t.compile(profile, pal, sections, { caseHref, badge }) });

  cases.forEach(({ pr, slug }, i) => {
    const nav = { slug, prev: cases[i - 1] || null, next: cases[i + 1] || null };
    const path = "projects/" + slug + ".html";
    // each case study page describes ITSELF: its own canonical path (ctx.path) so
    // a shared case study previews as that project, not as the home page.
    files.push({ path, html: t.caseCompile(profile, pal, pr, cases.length > 1 ? nav : { slug }, { path, badge }) });
  });

  // The share assets every page's head references, so those URLs actually 200:
  // the branded favicon always, and the generated og:image card when the user
  // uploaded no photo (a real photo is its own absolute CDN URL and needs no
  // stored card). Colours come from the SAME palette mapping the heads used, so
  // the stored card matches the visitor's skin exactly. They ride in files[] as
  // { path, content(base64), type }, the shape the publish API already accepts
  // for assets, so the current client forwards them with no change, and the
  // publisher writes them into the release. `assets` is also returned separately
  // for callers (and the verification script) that want them explicitly.
  const assets = shareAssets(profile, paletteColors(t.id, pal));
  for (const a of assets) files.push(a);

  return { files, assets };
}
