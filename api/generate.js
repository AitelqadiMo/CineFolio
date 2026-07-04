// POST /api/generate  { email, name, role, cvText }
// 1) Stores the request as a lead/order (Redis list cinefolio:orders when configured)
// 2) Optionally forwards the payload to an agent webhook (AGENT_WEBHOOK_URL) for the
//    real cinematic production run - fire and forget.
// 3) Returns a personalized preview site as an HTML string. The client injects the
//    user's photo locally (the photo never leaves the browser in this demo).

function redisEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}
async function redis(cmd) {
  const env = redisEnv();
  if (!env) return null;
  const r = await fetch(env.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return (await r.json()).result;
}
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SKILL_BANK = ["aws","azure","gcp","kubernetes","docker","terraform","terragrunt","ansible","jenkins","github actions","gitlab","ci/cd","python","javascript","typescript","react","node","java","go","rust","sql","figma","photoshop","illustrator","after effects","premiere","blender","ui","ux","product design","branding","marketing","seo","sales","copywriting","analytics","excel","powerpoint","notion","prometheus","grafana","linux","agile","scrum","machine learning","ai","data","mongodb","postgres","redis","graphql","next.js","vue","angular","swift","kotlin","flutter","devops","sre","security","photography","film","editing"];

function parseCV(cvText, fallbackName, role) {
  const text = String(cvText || "").slice(0, 8000);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const name = (fallbackName || "").trim() || (lines[0] || "Your Name").slice(0, 48);
  const lower = text.toLowerCase();
  const skills = [...new Set(SKILL_BANK.filter((s) => lower.includes(s)))].slice(0, 12);
  const expLines = lines.filter((l) => /(19|20)\d{2}/.test(l) && l.length < 120).slice(0, 5);
  const roleLabel = { engineer: "Engineer", designer: "Designer", founder: "Founder", other: "Professional" }[role] || "Professional";
  return { name, skills, expLines, roleLabel };
}

function previewHTML({ name, skills, expLines, roleLabel }) {
  const first = esc(name.split(" ")[0] || name);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)} - preview cut</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;700;800&family=IBM+Plex+Mono:wght@400;600&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--bg:#0b0908;--red:#e8442e;--paper:#f2ead9;--dim:rgba(242,234,217,.6)}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--paper);font-family:Inter,sans-serif;overflow-x:hidden}
.bar{position:fixed;left:0;right:0;height:34px;background:#000;z-index:5;display:flex;align-items:center;justify-content:space-between;padding:0 14px;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.2em;color:var(--dim)}
.bar.top{top:0}.bar.bot{bottom:0}
.rec{color:var(--red);animation:bl 1.2s steps(2) infinite}@keyframes bl{50%{opacity:.2}}
.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:60px 6vw;position:relative}
.photo{width:150px;height:150px;border-radius:50%;object-fit:cover;border:3px solid var(--red);box-shadow:0 0 60px rgba(232,68,46,.35);margin-bottom:26px}
.tc{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.4em;color:var(--red);margin-bottom:14px}
h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(2.4rem,9vw,5.6rem);line-height:.95;text-transform:uppercase}
.role{margin-top:14px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.34em;color:var(--dim);text-transform:uppercase}
.chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:34px auto 0;max-width:640px}
.chip{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.14em;padding:8px 13px;border:1px solid rgba(242,234,217,.28);text-transform:uppercase}
.chip:nth-child(3n){border-color:var(--red);color:var(--red)}
.sec{max-width:760px;margin:0 auto;padding:70px 6vw}
.sec h2{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.6rem;text-transform:uppercase;color:var(--red);margin-bottom:20px}
.exp{border-left:2px solid var(--red);padding:10px 0 10px 18px;margin-bottom:12px;color:var(--dim);font-size:.92rem;line-height:1.6}
.note{margin:40px auto 90px;text-align:center;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.24em;color:var(--dim);max-width:560px;line-height:2.1;padding:0 6vw}
.note b{color:var(--red)}
</style></head><body>
<div class="bar top"><span>CINEFOLIO STUDIOS</span><span class="rec">● REC</span><span>PREVIEW CUT</span></div>
<header class="hero">
  <img class="photo" src="__PHOTO__" alt="${esc(name)}">
  <div class="tc">SCENE 01 - TC 00:00:04:12</div>
  <h1>${esc(name)}</h1>
  <div class="role">${esc(roleLabel)} - STARRING IN THEIR OWN STORY</div>
  <div class="chips">${skills.length ? skills.map((s) => `<span class="chip">${esc(s)}</span>`).join("") : '<span class="chip">YOUR SKILLS HERE</span>'}</div>
</header>
${expLines.length ? `<section class="sec"><h2>Selected scenes</h2>${expLines.map((l) => `<div class="exp">${esc(l)}</div>`).join("")}</section>` : ""}
<div class="note">THIS IS THE <b>ROUGH CUT</b> - A 60-SECOND PREVIEW.<br>THE FULL PRODUCTION ADDS YOUR IDENTITY-LOCKED AI FILM SCENES,<br>SCROLL-SCRUB CINEMATOGRAPHY, TERMINAL &amp; VERIFIED CREDENTIALS.<br><br>MADE WITH <b>CINEFOLIO</b> - ${first}, YOUR PREMIERE AWAITS.</div>
<div class="bar bot"><span>CF-2026</span><span>ROUGH CUT - NOT FOR DISTRIBUTION</span><span>REEL 01</span></div>
</body></html>`;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });
  const { email, name, role, cvText, company } = req.body || {};
  if (company) return res.status(200).json({ ok: true }); // honeypot

  const clean = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) return res.status(400).json({ ok: false, error: "invalid_email" });
  if (!cvText || String(cvText).trim().length < 40) return res.status(400).json({ ok: false, error: "cv_too_short" });

  const parsed = parseCV(cvText, name, role);
  const order = { email: clean, name: parsed.name, role: role || "other", cvChars: String(cvText).length, at: new Date().toISOString() };

  try {
    if (redisEnv()) {
      await redis(["LPUSH", "cinefolio:orders", JSON.stringify(order)]);
      await redis(["SADD", "cinefolio:emails", clean]);
      await redis(["LPUSH", "cinefolio:waitlist", JSON.stringify({ ...order, source: "studio" })]);
    } else {
      console.log("[studio:order]", JSON.stringify(order));
    }
  } catch (e) { console.error("[studio:store]", e.message); }

  // Agent webhook handoff (async production run) - fire and forget
  const hook = process.env.AGENT_WEBHOOK_URL;
  if (hook) {
    fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "cinefolio_order", ...order, cvText: String(cvText).slice(0, 6000) }),
    }).catch(() => {});
  }

  return res.status(200).json({ ok: true, html: previewHTML(parsed) });
}
