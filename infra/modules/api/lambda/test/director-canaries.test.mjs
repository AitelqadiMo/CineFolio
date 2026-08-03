import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectDirectorOutput } from "../output-validation.mjs";
import { DIRECTOR_KIT } from "../../../pipeline/lambda/director-kit.mjs";

const canaries = [
  ["film director", "Edit suite", "Scrub the reel"],
  ["actor", "Stage architecture", "Enter the scene"],
  ["photographer", "Living contact sheet", "Reveal the negative"],
  ["engineer", "Systems observatory", "Traverse the system"],
  ["executive", "Evidence room", "Open the decision"],
  ["sparse assets", "Typographic monument", "Assemble the story"],
];

function cutFor([profession, direction, interaction]) {
  const index = `<!doctype html><html><head><style>
  h1{font-size:clamp(2.5rem,14vw,9rem);overflow-wrap:anywhere}img,video{max-width:100%}
  @media(max-width:600px){main{display:block}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}</style></head><body>
  <!-- CINEFOLIO-DIRECTION: ${direction} for ${profession} -->${DIRECTOR_KIT}
  <header data-cf-depth="hero"><h1>A Very Long International Portfolio Name</h1><a href="projects/proof.html">View Work</a></header>
  <main><section data-cf-depth="work" data-cf-work-index><a href="projects/proof.html">Proof project</a></section>
  <section data-cf-depth="signature" data-cf-signature><button data-cf-control>${interaction}</button><a href="projects/proof.html">Open case study</a></section>
  <script>document.querySelector('[data-cf-control]').addEventListener('click',()=>{});</script>
  <video muted playsinline preload="auto" poster="assets/poster.jpg"><source src="assets/hero.mp4"></video><button aria-label="Pause film">Pause</button></main>
  <footer data-cf-contact><a href="mailto:person@example.com">Email</a><a href="resume.html">Resume</a></footer></body></html>`;
  return [
    { path: "index.html", html: index },
    { path: "resume.html", html: "<!doctype html><html><head><style>@media print{button{display:none}}</style></head><body><button onclick=\"window.print()\">Print</button></body></html>" },
    { path: "projects/proof.html", html: "<!doctype html><html><body><h1>Proof</h1></body></html>" },
  ];
}

for (const canary of canaries) {
  test(`static Director canary passes the premium contract: ${canary[0]}`, () => {
    const out = inspectDirectorOutput(cutFor(canary), ["assets/poster.jpg", "assets/hero.mp4"], { strict: true });
    assert.deepEqual(out.errors, []);
    assert.deepEqual(out.warnings, []);
    assert.equal(out.stats.depthBeats, 3);
    assert.equal(out.stats.projectLinks, 1);
  });
}
