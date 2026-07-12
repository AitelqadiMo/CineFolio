// studio.mjs — the demand-test Studio flow on AWS primitives.
// generate: create order (idempotent) -> fire agent webhook -> return instant rough cut
// callback: agent posts the director's-cut HTML (secret header) -> S3 + status flip
// status/cut: client polling. Cut HTML lives in S3 (artifacts bucket), never DynamoDB.
import { ok, bad, json, bodyOf, qs, isEmail, clampStr, uuid, now, safeEqual, claimsOf, isAdmin, validateBundle, isPagePath, assetTypeOf, BUNDLE_ASSET_PATH_RE } from "./lib.mjs";
import { sendOrderEmail } from "./email.mjs";

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

// POST /studio/generate { email, name, role, cvText } — the ANONYMOUS demo
// surface. It returns the instant rough cut and records the lead, but it can
// no longer start a production run: AI cuts are an account entitlement now
// (three free per account, then paid), enforced by POST /studio/order.
export async function generate(event, ctx) {
  const b = bodyOf(event);
  if (!b) return bad("invalid json");
  if (b.company) return ok({ ok: true, html: "", orderId: uuid(), production: false }); // honeypot
  const email = String(b.email || "").trim().toLowerCase();
  if (!isEmail(email)) return bad("valid email required");
  const cvText = clampStr(b.cvText, 8000);
  const parsed = parseCV(cvText, clampStr(b.name, 80), clampStr(b.role, 24));
  const orderId = uuid();

  await ctx.ddb.put(
    {
      PK: `ORDER#${orderId}`, SK: "META", type: "order", orderId,
      GSI1PK: "USER#anon", GSI1SK: `ORDER#${now()}`,
      GSI2PK: "STATUS#preview", GSI2SK: now(),
      email, name: parsed.name, role: parsed.roleLabel, skills: parsed.skills,
      cvText,
      status: "preview", production: false, createdAt: now(), updatedAt: now(),
    },
    "attribute_not_exists(PK)"
  );
  return ok({ ok: true, orderId, production: false, html: previewHTML(parsed) });
}

export const FREE_CUTS = 3;

// POST /studio/order — the PRODUCTION surface (JWT enforced at the gateway).
// Every account holds three free AI cuts; the counter lives on the user record
// and is spent with a conditional update, so a double-click or a second tab
// can never mint a fourth. Beyond three: 402, the paid path.
// Body: { name, role, cvText, template, palette, customIdea, photo, covers, links, email? }
export async function order(event, ctx) {
  const claims = claimsOf(event);
  if (!claims?.sub) return json(401, { ok: false, error: "sign in to order an AI cut" });
  const b = bodyOf(event);
  if (!b) return bad("invalid json");
  const email = String(b.email || claims.email || "").trim().toLowerCase();
  if (!isEmail(email)) return bad("valid email required");
  const cvText = clampStr(b.cvText, 8000);
  const parsed = parseCV(cvText, clampStr(b.name, 80), clampStr(b.role, 24));

  // spend one free cut, race-safe. The profile row is lazy-upserted by GET /me;
  // cover the fresh-account path with an upsert-style two-step.
  let aiCuts = 0;
  let freeCut = true;
  try {
    const updated = await ctx.ddb.update({
      Key: { PK: `USER#${claims.sub}`, SK: "PROFILE" },
      UpdateExpression: "SET updatedAt = :u ADD aiCuts :one",
      ConditionExpression: "attribute_not_exists(aiCuts) OR aiCuts < :max",
      ExpressionAttributeValues: { ":one": 1, ":max": FREE_CUTS, ":u": now() },
      ReturnValues: "ALL_NEW",
    });
    aiCuts = updated?.aiCuts ?? 1;
  } catch (e) {
    if (e?.name !== "ConditionalCheckFailedException") throw e;
    // free cuts spent -> try a paid credit (landed by the billing webhook).
    // Same conditional-counter discipline: a double-click can never spend two.
    try {
      await ctx.ddb.update({
        Key: { PK: `USER#${claims.sub}`, SK: "PROFILE" },
        UpdateExpression: "SET updatedAt = :u ADD paidCredits :neg",
        ConditionExpression: "paidCredits >= :one",
        ExpressionAttributeValues: { ":neg": -1, ":one": 1, ":u": now() },
      });
      freeCut = false;
      aiCuts = FREE_CUTS; // the free counter stays at its cap; entitlement rides paidCredits now
    } catch (e2) {
      if (e2?.name === "ConditionalCheckFailedException") {
        // no credits anywhere: answer with the price AND the way to pay it
        return json(402, { ok: false, error: "free cuts used", freeCutsLeft: 0, price: 149, checkout: "/billing/checkout" });
      }
      throw e2;
    }
  }

  const orderId = uuid();
  const covers = Array.isArray(b.covers)
    ? b.covers.slice(0, 8).map((c) => ({ name: clampStr(c?.name, 80) || null, url: clampStr(c?.url, 600) || null })).filter((c) => c.url)
    : [];
  const secrets = await ctx.secrets();
  const production = Boolean(secrets.AGENT_WEBHOOK_URL && secrets.AGENT_WEBHOOK_SECRET && secrets.CF_CALLBACK_SECRET);

  await ctx.ddb.put(
    {
      PK: `ORDER#${orderId}`, SK: "META", type: "order", orderId,
      GSI1PK: `USER#${claims.sub}`, GSI1SK: `ORDER#${now()}`,
      GSI2PK: "STATUS#queued", GSI2SK: now(),
      email, name: parsed.name, role: parsed.roleLabel, skills: parsed.skills,
      cvText, // retained so the pipeline can (re)dispatch without the client
      assets: { // the client's own material: the agent films with THESE, never invented likenesses
        photo: clampStr(b.photo, 600) || null,
        covers,
        links: clampStr(b.links, 500) || null,
      },
      brief: { // creative direction from the Studio workspace (deterministic base + custom idea)
        template: clampStr(b.template, 24) || null,
        palette: clampStr(b.palette, 24) || null,
        customIdea: clampStr(b.customIdea, 1200) || null,
      },
      freeCut, paid: !freeCut, cutNumber: freeCut ? aiCuts : null,
      status: "queued", production, createdAt: now(), updatedAt: now(),
    },
    "attribute_not_exists(PK)" // idempotency: uuid collision or client retry can't double-create
  );

  if (production) {
    // Phase 3: the API only ENQUEUES. EventBridge Pipe -> Step Functions owns
    // dispatch (task token), retries, timeout, and the human-review fallback.
    try {
      await ctx.queue.send(ctx.config.ordersQueueUrl, { orderId });
    } catch (e) {
      console.error(JSON.stringify({ level: "error", msg: "enqueue failed", orderId, err: e?.message }));
      await setStatus(ctx, orderId, "dispatch_failed");
    }
    await sendOrderEmail(ctx, "received", { orderId, email, name: parsed.name });
  }

  return ok({ ok: true, orderId, production, paid: !freeCut, freeCutsLeft: Math.max(0, FREE_CUTS - aiCuts), html: previewHTML(parsed) });
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
const MAX_ASSET_BYTES = 8 * 1024 * 1024; // per file; API Gateway caps requests near 10MB

// POST /studio/asset?orderId=...&path=assets/hero.jpg — the agent ships every
// generated image, video or pdf HERE as raw bytes BEFORE delivering the pages,
// then references them by relative path. Same secret as the callback. Each
// upload is its own DynamoDB row (ORDER#id / ASSET#path), so parallel uploads
// never race, and the callback folds them into the cut's file manifest.
export async function asset(event, ctx) {
  const secrets = await ctx.secrets();
  const given = event.headers?.["x-cf-secret"] || event.headers?.["X-CF-Secret"];
  if (!secrets.CF_CALLBACK_SECRET || !safeEqual(given, secrets.CF_CALLBACK_SECRET)) return json(401, { ok: false });
  const orderId = qs(event, "orderId");
  if (!orderId || !ORDER_ID_RE.test(orderId)) return bad("bad orderId");
  const path = String(qs(event, "path") || "").toLowerCase();
  if (!BUNDLE_ASSET_PATH_RE.test(path) || isPagePath(path)) return bad("bad asset path (pages go to the callback)");
  const contentType = assetTypeOf(path);
  if (!contentType) return bad(`unsupported asset type: ${path}`);

  const order = await ctx.ddb.get({ PK: `ORDER#${orderId}`, SK: "META" });
  if (!order) return bad("unknown order", 404);

  const bytes = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64")
    : Buffer.from(event.body || "", "utf8");
  if (!bytes.length) return bad("empty asset body");
  if (bytes.length > MAX_ASSET_BYTES) return bad("asset too large (8MB max per file)", 413);

  await ctx.s3.putObject(ctx.config.artifactsBucket, `orders/${orderId}/cut/${path}`, bytes, contentType);
  await ctx.ddb.put({
    PK: `ORDER#${orderId}`, SK: `ASSET#${path}`, type: "orderasset",
    path, contentType, bytes: bytes.length, createdAt: now(),
  }); // idempotent by design: re-uploading a path overwrites both object and row
  // pages already delivered? fold this late arrival into the manifest so the
  // next premiere ships it without depending on upload order
  if (Array.isArray(order.cutFiles) && !order.cutFiles.includes(path)) {
    await ctx.ddb.update({
      Key: { PK: `ORDER#${orderId}`, SK: "META" },
      UpdateExpression: "SET cutFiles = :f",
      ExpressionAttributeValues: { ":f": [...order.cutFiles, path] },
      ConditionExpression: "attribute_exists(PK)",
    }).catch(() => { /* concurrent callback wins; publish unions the rows anyway */ });
  }
  return ok({ ok: true, orderId, path, bytes: bytes.length });
}

// every asset the agent uploaded for an order, race-free
async function uploadedAssets(ctx, orderId) {
  const rows = await ctx.ddb.query({
    KeyConditionExpression: "PK = :p AND begins_with(SK, :s)",
    ExpressionAttributeValues: { ":p": `ORDER#${orderId}`, ":s": "ASSET#" },
  });
  return rows.map((r) => r.path).filter(Boolean);
}

// POST /callback — the agent returns the director's cut (raw HTML body, secret header)
export async function callback(event, ctx) {
  const secrets = await ctx.secrets();
  const given = event.headers?.["x-cf-secret"] || event.headers?.["X-CF-Secret"];
  if (!secrets.CF_CALLBACK_SECRET || !safeEqual(given, secrets.CF_CALLBACK_SECRET)) return json(401, { ok: false });
  const orderId = event.headers?.["x-cf-order"] || event.headers?.["X-CF-Order"] || qs(event, "orderId");
  if (!orderId || !ORDER_ID_RE.test(orderId)) return bad("bad orderId");
  const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "";
  // v2: the agent delivers a whole web app as JSON { files: [{ path, html }] };
  // a raw single html document stays accepted so v1 agents keep working
  let files;
  if (raw.trimStart().startsWith("{")) {
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { return bad("invalid json body"); }
    files = Array.isArray(parsed?.files) ? parsed.files : null;
  } else {
    files = [{ path: "index.html", html: raw }];
  }
  const problem = validateBundle(files, { maxTotal: 3 * 1024 * 1024 });
  if (problem) return bad(problem, problem.includes("large") ? 413 : 400);

  const order = await ctx.ddb.get({ PK: `ORDER#${orderId}`, SK: "META" });
  if (!order) return bad("unknown order", 404);

  const key = `orders/${orderId}/cut/index.html`;
  await Promise.all(files.map((f) => isPagePath(f.path)
    ? ctx.s3.putObject(ctx.config.artifactsBucket, `orders/${orderId}/cut/${f.path}`, f.html)
    : ctx.s3.putObject(ctx.config.artifactsBucket, `orders/${orderId}/cut/${f.path}`, Buffer.from(f.content, "base64"), assetTypeOf(f.path))));
  // the file manifest rides on the order so publish and finalize need no state
  // machine changes. Assets uploaded ahead via /studio/asset fold in here.
  const uploaded = await uploadedAssets(ctx, orderId);
  const manifest = [...new Set([...files.map((f) => f.path), ...uploaded])];
  await ctx.ddb.update({
    Key: { PK: `ORDER#${orderId}`, SK: "META" },
    UpdateExpression: "SET cutFiles = :f",
    ExpressionAttributeValues: { ":f": manifest },
    ConditionExpression: "attribute_exists(PK)",
  });

  if (order.taskToken) {
    // Pipeline mode: resume the Step Functions execution; Finalize owns the
    // status flip. If the token expired (build outlived the timeout), fall
    // through to a direct flip — a delivered cut must never be lost.
    try {
      await ctx.sfn.sendTaskSuccess(order.taskToken, { orderId, cutKey: key });
      return ok({ ok: true, orderId, stored: key, resumed: true });
    } catch (e) {
      console.error(JSON.stringify({ level: "error", msg: "task token resume failed, flipping directly", orderId, err: e?.message }));
    }
  }
  await setStatus(ctx, orderId, "ready", { cutKey: key });
  return ok({ ok: true, orderId, stored: key });
}

// POST /admin/orders/{id}/retry — re-enqueue a stuck order (admin only)
export async function adminRetry(event, ctx) {
  const claims = claimsOf(event);
  if (!isAdmin(claims)) return json(403, { ok: false, error: "admin only" });
  const orderId = event.pathParameters?.id;
  if (!orderId || !ORDER_ID_RE.test(orderId)) return bad("bad orderId");
  const order = await ctx.ddb.get({ PK: `ORDER#${orderId}`, SK: "META" });
  if (!order) return bad("unknown order", 404);
  if (!["dispatch_failed", "human_review", "filming", "queued"].includes(order.status)) {
    return bad(`status ${order.status} is not retryable`, 409);
  }
  await setStatus(ctx, orderId, "queued", { taskToken: null });
  await ctx.queue.send(ctx.config.ordersQueueUrl, { orderId });
  return ok({ ok: true, orderId, status: "queued" });
}

// GET /studio/status?orderId=...
export async function status(event, ctx) {
  const orderId = qs(event, "orderId");
  if (!orderId || !ORDER_ID_RE.test(orderId)) return bad("bad orderId");
  const order = await ctx.ddb.get({ PK: `ORDER#${orderId}`, SK: "META" });
  if (!order) return bad("unknown order", 404);
  return ok({ ok: true, orderId, status: order.status, production: order.production, failCause: order.failCause || null });
}

// GET /studio/cut?orderId=...&path=... — serves any file of the delivered cut,
// so the pre-premiere preview resolves its relative images, video and pdf.
export async function cut(event, ctx) {
  const orderId = qs(event, "orderId");
  if (!orderId || !ORDER_ID_RE.test(orderId)) return bad("bad orderId");
  const order = await ctx.ddb.get({ PK: `ORDER#${orderId}`, SK: "META" });
  if (!order?.cutKey || order.status !== "ready") return bad("cut not ready", 404);
  const path = String(qs(event, "path") || "index.html").toLowerCase();
  if (!BUNDLE_ASSET_PATH_RE.test(path)) return bad("bad path");
  const known = Array.isArray(order.cutFiles) && order.cutFiles.length ? order.cutFiles : ["index.html"];
  if (!known.includes(path)) return bad("not part of this cut", 404);
  if (isPagePath(path)) {
    const html = await ctx.s3.getObjectText(ctx.config.artifactsBucket, `orders/${orderId}/cut/${path}`);
    return { statusCode: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }, body: html };
  }
  const bytes = await ctx.s3.getObjectBytes(ctx.config.artifactsBucket, `orders/${orderId}/cut/${path}`);
  return {
    statusCode: 200,
    headers: { "content-type": assetTypeOf(path) || "application/octet-stream", "cache-control": "no-store" },
    body: bytes.toString("base64"),
    isBase64Encoded: true,
  };
}
