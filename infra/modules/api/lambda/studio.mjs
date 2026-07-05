// studio.mjs — the demand-test Studio flow on AWS primitives.
// generate: create order (idempotent) -> fire agent webhook -> return instant rough cut
// callback: agent posts the director's-cut HTML (secret header) -> S3 + status flip
// status/cut: client polling. Cut HTML lives in S3 (artifacts bucket), never DynamoDB.
import { ok, bad, json, bodyOf, qs, isEmail, clampStr, uuid, now, safeEqual, claimsOf } from "./lib.mjs";

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const SKILL_BANK = ["aws","azure","gcp","kubernetes","docker","terraform","terragrunt","ansible","jenkins","github actions","gitlab","ci/cd","python","javascript","typescript","react","node","java","go","rust","sql","figma","photoshop","illustrator","after effects","premiere","blender","ui","ux","product design","branding","marketing","seo","sales","copywriting","analytics","excel","powerpoint","notion","prometheus","grafana","linux","agile","scrum","machine learning","ai","data","mongodb","postgres","redis","graphql","next.js","vue","angular","swift","kotlin","flutter","devops","sre","security","photography","film","editing"];

export function parseCV(cvText, fallbackName, role) {
  const text = String(cvText || "").slice(0, 8000);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const name = (fallbackName || "").trim() || (lines[0] || "Your Name").slice(0, 48);
  const lower = text.toLowerCase();
  const skills = [...new Set(SKILL_BANK.filter((s) => lower.includes(s)))].slice(0, 12);
  const expLines = lines.filter((l) => /(19|20)\d{2}/.test(l) && l.length < 120).slice(0, 5);
  const roleLabel = { engineer: "Engineer", designer: "Designer", founder: "Founder", other: "Professional" }[role] || "Professional";
  return { name, skills, expLines, roleLabel };
}

// Rough cut in the CineFolio jersey palette (navy / crimson / gold / bone).
// __PHOTO__ is swapped client-side; the photo never leaves the browser.
export function previewHTML({ name, skills, expLines, roleLabel }) {
  const first = esc((name || "").split(" ")[0] || name);
  const chips = skills.map((s) => `<span class="chip">${esc(s)}</span>`).join("") || '<span class="chip">your craft here</span>';
  const exps = expLines.map((l) => `<div class="exp"><span class="tick"></span>${esc(l)}</div>`).join("") || '<div class="exp"><span class="tick"></span>Your story, scene by scene.</div>';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)} — rough cut</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;700;800&family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@400;600&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--navy:#0E1C3F;--navy2:#132550;--red:#E63946;--gold:#D9A441;--bone:#F4EFE6;--green:#0E9E62;--dim:rgba(244,239,230,.62)}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--navy);color:var(--bone);font-family:Inter,sans-serif;overflow-x:hidden}
.bar{position:fixed;left:0;right:0;height:34px;background:rgba(10,17,38,.92);z-index:5;display:flex;align-items:center;justify-content:space-between;padding:0 14px;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.22em;color:var(--dim);backdrop-filter:blur(6px)}
.bar.top{top:0;border-bottom:1px solid rgba(244,239,230,.08)}.bar.bot{bottom:0;border-top:1px solid rgba(244,239,230,.08)}
.rec{color:var(--red);animation:bl 1.2s steps(2) infinite}@keyframes bl{50%{opacity:.2}}
.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:70px 6vw;position:relative}
.hero:before{content:"";position:absolute;inset:0;background:radial-gradient(60% 50% at 50% 38%,rgba(217,164,65,.14),transparent 70%)}
.photo{width:150px;height:150px;border-radius:50%;object-fit:cover;border:3px solid var(--gold);box-shadow:0 0 70px rgba(217,164,65,.3);margin-bottom:26px;position:relative}
.tc{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.42em;color:var(--red);margin-bottom:14px;position:relative}
h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(2.4rem,9vw,5.4rem);line-height:.95;text-transform:uppercase;position:relative}
h1 em{font-family:'Instrument Serif',serif;font-style:italic;font-weight:400;color:var(--gold);text-transform:none}
.role{margin-top:14px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.34em;color:var(--dim);text-transform:uppercase;position:relative}
.chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:32px auto 0;max-width:640px;position:relative}
.chip{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.14em;padding:8px 13px;border:1px solid rgba(244,239,230,.25);text-transform:uppercase;border-radius:2px}
.chip:nth-child(3n){border-color:var(--red);color:#ff8d96}.chip:nth-child(4n){border-color:var(--gold);color:var(--gold)}
.sec{max-width:760px;margin:0 auto;padding:74px 6vw}
.sec h2{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.5rem;text-transform:uppercase;margin-bottom:22px}
.sec h2 span{color:var(--red)}
.exp{display:flex;gap:12px;align-items:baseline;padding:13px 0;border-bottom:1px solid rgba(244,239,230,.1);font-size:.95rem;color:var(--dim)}
.tick{width:8px;height:8px;background:var(--green);flex:0 0 auto;transform:rotate(45deg)}
.note{margin:0 6vw 90px;max-width:760px;margin-inline:auto;padding:22px;border:1px dashed rgba(217,164,65,.4);font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.12em;color:var(--gold);text-align:center}
</style></head><body>
<div class="bar top"><span>CINEFOLIO · ROUGH CUT</span><span class="rec">● REC</span></div>
<section class="hero"><img class="photo" src="__PHOTO__" alt="">
<div class="tc">SCENE 01 — THE REVEAL</div>
<h1>${first}<br><em>in production</em></h1>
<div class="role">${esc(roleLabel)} — feature presentation</div>
<div class="chips">${chips}</div></section>
<section class="sec"><h2><span>02</span> — Selected scenes</h2>${exps}</section>
<div class="note">THIS IS AN INSTANT ROUGH CUT. THE DIRECTOR'S CUT — CINEMATIC SCENES, MOTION, SOUND — IS RENDERED BY THE STUDIO PIPELINE.</div>
<div class="bar bot"><span>${esc(name).toUpperCase()}</span><span>CINEFOLIO.STUDIO</span></div>
</body></html>`;
}

// POST /studio/generate { email, name, role, cvText }
export async function generate(event, ctx) {
  const b = bodyOf(event);
  if (!b) return bad("invalid json");
  if (b.company) return ok({ ok: true, html: "", orderId: uuid(), production: false }); // honeypot
  const email = String(b.email || "").trim().toLowerCase();
  if (!isEmail(email)) return bad("valid email required");
  const cvText = clampStr(b.cvText, 8000);
  const parsed = parseCV(cvText, clampStr(b.name, 80), clampStr(b.role, 24));
  const orderId = uuid();
  const claims = claimsOf(event); // JWT optional on this route in dev; orders link to user when present
  const sub = claims?.sub || "anon";
  const secrets = await ctx.secrets();
  const production = Boolean(secrets.AGENT_WEBHOOK_URL && secrets.AGENT_WEBHOOK_SECRET && secrets.CF_CALLBACK_SECRET);

  await ctx.ddb.put(
    {
      PK: `ORDER#${orderId}`, SK: "META", type: "order", orderId,
      GSI1PK: `USER#${sub}`, GSI1SK: `ORDER#${now()}`,
      GSI2PK: "STATUS#queued", GSI2SK: now(),
      email, name: parsed.name, role: parsed.roleLabel, skills: parsed.skills,
      status: "queued", production, createdAt: now(), updatedAt: now(),
    },
    "attribute_not_exists(PK)" // idempotency: uuid collision or client retry can't double-create
  );

  if (production) {
    // Self-describing job for the agent. deliver.* tells it exactly how to return the cut.
    // Derive our own base URL from the request (no circular TF dependency on the stage URL).
    const callbackUrl = `https://${event.requestContext?.domainName || "api.invalid"}/callback`;
    const payload = {
      kind: "cinefolio.order", orderId, email,
      name: parsed.name, role: parsed.roleLabel, skills: parsed.skills, cvText,
      instructions:
        "Produce a single-file cinematic portfolio HTML (CineFolio jersey brand: navy #0E1C3F, crimson #E63946, gold #D9A441, bone #F4EFE6, green #0E9E62). Max 900KB, self-contained, no external JS. POST it raw to deliver.url with deliver.headers within 6 minutes.",
      deliver: { method: "POST", url: callbackUrl, headers: { "X-CF-Secret": secrets.CF_CALLBACK_SECRET, "X-CF-Order": orderId, "content-type": "text/html" } },
    };
    try {
      await ctx.fetchFn(secrets.AGENT_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${secrets.AGENT_WEBHOOK_SECRET}` },
        body: JSON.stringify(payload),
      });
      await ctx.queue.send(ctx.config.ordersQueueUrl, { orderId, dispatchedAt: now() }); // pipeline audit trail (P3 consumer)
    } catch {
      await setStatus(ctx, orderId, "dispatch_failed");
    }
  }

  return ok({ ok: true, orderId, production, html: previewHTML(parsed) });
}

async function setStatus(ctx, orderId, status, extra = {}) {
  const names = { "#s": "status" };
  const sets = ["#s = :s", "GSI2PK = :g", "updatedAt = :u"];
  const vals = { ":s": status, ":g": `STATUS#${status}`, ":u": now() };
  for (const [k, v] of Object.entries(extra)) { sets.push(`${k} = :${k}`); vals[`:${k}`] = v; }
  await ctx.ddb.update({
    Key: { PK: `ORDER#${orderId}`, SK: "META" },
    UpdateExpression: `SET ${sets.join(", ")}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: vals,
    ConditionExpression: "attribute_exists(PK)",
  });
}

const ORDER_ID_RE = /^[a-f0-9-]{8,64}$/i;

// POST /callback — the agent returns the director's cut (raw HTML body, secret header)
export async function callback(event, ctx) {
  const secrets = await ctx.secrets();
  const given = event.headers?.["x-cf-secret"] || event.headers?.["X-CF-Secret"];
  if (!secrets.CF_CALLBACK_SECRET || !safeEqual(given, secrets.CF_CALLBACK_SECRET)) return json(401, { ok: false });
  const orderId = event.headers?.["x-cf-order"] || event.headers?.["X-CF-Order"] || qs(event, "orderId");
  if (!orderId || !ORDER_ID_RE.test(orderId)) return bad("bad orderId");
  const html = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "";
  const trimmed = html.trimStart().toLowerCase();
  if (!trimmed.startsWith("<!doctype html")) return bad("body must be a full html document");
  if (Buffer.byteLength(html, "utf8") > 900 * 1024) return bad("html too large (900KB max)", 413);

  const order = await ctx.ddb.get({ PK: `ORDER#${orderId}`, SK: "META" });
  if (!order) return bad("unknown order", 404);

  const key = `orders/${orderId}/cut.html`;
  await ctx.s3.putObject(ctx.config.artifactsBucket, key, html);
  await setStatus(ctx, orderId, "ready", { cutKey: key });
  return ok({ ok: true, orderId, stored: key });
}

// GET /studio/status?orderId=...
export async function status(event, ctx) {
  const orderId = qs(event, "orderId");
  if (!orderId || !ORDER_ID_RE.test(orderId)) return bad("bad orderId");
  const order = await ctx.ddb.get({ PK: `ORDER#${orderId}`, SK: "META" });
  if (!order) return bad("unknown order", 404);
  return ok({ ok: true, orderId, status: order.status, production: order.production });
}

// GET /studio/cut?orderId=... — returns the director's cut HTML itself
export async function cut(event, ctx) {
  const orderId = qs(event, "orderId");
  if (!orderId || !ORDER_ID_RE.test(orderId)) return bad("bad orderId");
  const order = await ctx.ddb.get({ PK: `ORDER#${orderId}`, SK: "META" });
  if (!order?.cutKey || order.status !== "ready") return bad("cut not ready", 404);
  const html = await ctx.s3.getObjectText(ctx.config.artifactsBucket, order.cutKey);
  return { statusCode: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }, body: html };
}
