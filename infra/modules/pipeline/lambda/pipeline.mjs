// pipeline.mjs — Step Functions worker: one Lambda, four actions.
//   validate     : order exists + circuit breaker + secrets present
//   dispatch     : fire the agent webhook WITH the task token (waitForTaskToken)
//   finalize     : mark order ready (SES premiere email lands here next)
//   human_review : terminal failure -> flag order + page the operator via SNS
// State transitions live HERE (and in the callback's SendTaskSuccess), so the
// state machine — not hope — owns every order's fate.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SSMClient, GetParametersByPathCommand } from "@aws-sdk/client-ssm";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const region = process.env.AWS_REGION || "eu-central-1";
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), { marshallOptions: { removeUndefinedValues: true } });
const ssm = new SSMClient({ region });
const sns = new SNSClient({ region });
const TABLE = process.env.TABLE_NAME;
const TOPIC = process.env.ALARM_TOPIC_ARN;

let secretsCache = null;
async function secrets() {
  if (secretsCache) return secretsCache;
  const out = {};
  let NextToken;
  do {
    const r = await ssm.send(new GetParametersByPathCommand({ Path: process.env.SSM_PREFIX || "/cinefolio/dev", WithDecryption: true, NextToken }));
    for (const p of r.Parameters || []) out[p.Name.split("/").pop()] = p.Value;
    NextToken = r.NextToken;
  } while (NextToken);
  secretsCache = out;
  return out;
}

const getOrder = (orderId) =>
  doc.send(new GetCommand({ TableName: TABLE, Key: { PK: `ORDER#${orderId}`, SK: "META" } })).then((r) => r.Item || null);

async function setStatus(orderId, status, extra = {}) {
  const sets = ["#s = :s", "GSI2PK = :g", "updatedAt = :u"];
  const vals = { ":s": status, ":g": `STATUS#${status}`, ":u": new Date().toISOString() };
  const names = { "#s": "status" };
  for (const [k, v] of Object.entries(extra)) {
    names[`#x${k}`] = k;
    sets.push(`#x${k} = :x${k}`);
    vals[`:x${k}`] = v;
  }
  await doc.send(new UpdateCommand({
    TableName: TABLE,
    Key: { PK: `ORDER#${orderId}`, SK: "META" },
    UpdateExpression: `SET ${sets.join(", ")}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: vals,
    ConditionExpression: "attribute_exists(PK)",
  }));
}

class OrderInvalid extends Error {
  constructor(msg) { super(msg); this.name = "OrderInvalid"; }
}

export const handler = async (event) => {
  const { action, orderId, taskToken, cutKey, cause } = event;
  console.log(JSON.stringify({ level: "info", action, orderId }));

  if (action === "validate") {
    const order = await getOrder(orderId);
    if (!order) throw new OrderInvalid("unknown order");
    if (!["queued", "dispatch_failed", "filming"].includes(order.status)) throw new OrderInvalid(`status ${order.status} not dispatchable`);
    const sec = await secrets();
    if (sec.PIPELINE_ENABLED === "false") throw new Error("circuit breaker open"); // retryable -> ends in human_review
    if (!sec.AGENT_WEBHOOK_URL || !sec.AGENT_WEBHOOK_SECRET || !sec.CF_CALLBACK_SECRET) throw new Error("pipeline secrets missing");
    return { ok: true, email: order.email, name: order.name };
  }

  if (action === "dispatch") {
    const order = await getOrder(orderId);
    if (!order) throw new OrderInvalid("unknown order");
    const sec = await secrets();
    // The task token rides on the order so the /callback route can resume the execution.
    await setStatus(orderId, "filming", { taskToken });
    // CineScroll kit: a dependency-free scroll engine the agent adapts instead
    // of inventing. Progress variable, staggered reveals, pinned scenes with
    // video scrub, reduced-motion fallbacks. Inline, no external JS.
    const SCROLL_KIT = [
      "<script>",
      "(()=>{const d=document.documentElement;",
      "const prog=()=>{const m=document.body.scrollHeight-innerHeight;d.style.setProperty('--scroll',m>0?(scrollY/m).toFixed(4):0)};",
      "addEventListener('scroll',prog,{passive:true});addEventListener('resize',prog,{passive:true});prog();",
      "const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)e.target.classList.add('inview')}),{threshold:.2});",
      "document.querySelectorAll('[data-reveal]').forEach(el=>io.observe(el));",
      "document.querySelectorAll('[data-pin]').forEach(sec=>{const v=sec.querySelector('video[data-scrub]');",
      "const onS=()=>{const r=sec.getBoundingClientRect();const span=r.height-innerHeight;if(span<=0)return;",
      "const p=Math.min(1,Math.max(0,-r.top/span));sec.style.setProperty('--pin',p.toFixed(4));",
      "if(v&&v.duration&&!matchMedia('(prefers-reduced-motion: reduce)').matches){v.currentTime=v.duration*p}};",
      "addEventListener('scroll',onS,{passive:true});onS();});})();",
      "</scr"+"ipt>",
      "<style>",
      "[data-reveal]{opacity:0;transform:translateY(30px);transition:opacity .9s cubic-bezier(.22,1,.36,1),transform .9s cubic-bezier(.22,1,.36,1)}",
      "[data-reveal].inview{opacity:1;transform:none}",
      "[data-reveal='2']{transition-delay:.12s}[data-reveal='3']{transition-delay:.24s}",
      "[data-pin]{height:280vh;position:relative}[data-pin]>.stage{position:sticky;top:0;height:100vh;overflow:hidden}",
      "@media(prefers-reduced-motion:reduce){[data-reveal]{opacity:1;transform:none;transition:none}[data-pin]{height:auto}[data-pin]>.stage{position:static;height:auto}}",
      "</style>",
    ].join("\n");

    const payload = {
      kind: "cinefolio.order",
      orderId,
      email: order.email, name: order.name, role: order.role, skills: order.skills || [],
      cvText: order.cvText || "",
      assets: order.assets || null, // { photo, covers: [{name,url}], links } — the client's own material
      kit: SCROLL_KIT, // paste-and-adapt scroll engine: progress var, reveals, pinned video scrub
      brief: order.brief || null, // template/palette/customIdea from the Studio workspace
      revisionNotes: order.revisionNotes || null, // set when this run is the included revision
      instructions: [
        "You are the director on a commissioned portfolio film. The client's resume (cvText), their photo and project shots (assets), and their creative brief ride on this order. Build the portfolio that gets this specific person hired: read the resume for the arc of the career, pick the register their industry respects, and art-direct with conviction. Any style is valid; the jersey palette (navy #0E1C3F, crimson #E63946, gold #D9A441, bone #F4EFE6, green #0E9E62) is the house default, never a constraint.",
        "THE PORTFOLIO IS A SCROLL-STORY. Scrolling index.html must feel like living this person's story, not reading a document: an opening title scene, then the career told in acts that reveal as the visitor scrolls, at least one pinned scene where scrolling drives the motion, and a closing scene that lands on contact plus the resume. Use the kit field (paste it into the page and adapt): --scroll is the page progress variable, data-reveal elements stagger in, data-pin sections pin their .stage while --pin runs 0 to 1, and video[data-scrub] inside a pinned section scrubs with the scroll. Reduced-motion fallbacks are already in the kit; keep them.",
        "AT LEAST ONE GENERATED VIDEO IS REQUIRED in the scroll experience. Generate a short cinematic clip (5 to 8 seconds, 720p, no likeness of the client unless assets.photo drives it) with your video tools, upload it via upload.url as assets/hero.mp4 (8MB max; compress or trim to fit), and use it either as a scroll-scrubbed pinned scene (muted, playsinline, preload=auto, no controls) or as an autoplaying muted loop behind the title. Always set a poster image and keep the page alive without the video (reduced motion or slow network).",
        "Generate still imagery with your image tools where it elevates the acts (atmospheres, section backdrops, project mood frames). Work FAST: generate all media first in parallel, upload as each finishes, then write the pages. Target delivery well under the window; twenty polished minutes beats a slow masterpiece.",
        "HOW MEDIA SHIPS, this is a hard contract: your platform's own media URLs are NOT publicly reachable and will 404 for visitors. Every image, video or pdf you generate must be UPLOADED via upload.url before you deliver the pages: one POST per file, append the relative path to the url (example: upload.url + 'assets/hero-01.jpg'), send the raw file bytes as the request body with the file's content-type header and upload.headers. Then reference each file in your html by that same relative path (src=\"assets/hero-01.jpg\"). Allowed types: jpg, png, webp, gif, svg, mp4, webm, woff2, pdf. 8MB per file. The client's own photos (assets.photo, assets.covers) are already public URLs, use them directly.",
        "NEVER reference a file you did not upload or deliver: every src and href in your pages must resolve, either to a relative path you uploaded via upload.url or delivered in the bundle, or to a public URL you know serves bytes (the client's asset URLs, Google Fonts). A dead link or broken image is a failed delivery.",
        "Likeness is sacred: the client's face may ONLY come from assets.photo and assets.covers. Use those exact URLs for any portrait or project imagery of them. Never generate, alter, or substitute a human likeness. If no photo is provided, art-direct without a face.",
        "Ship a working Download Resume affordance: render a print-clean resume.html from cvText with @media print styles, link it prominently from index.html, and wire a download or print button. If you can render a true PDF, also upload it as resume.pdf via upload.url and link that; if you cannot, link ONLY resume.html, never a pdf that does not exist. A visitor must be able to leave with the resume in hand.",
        "Structure: index.html plus projects/{slug}.html case-study pages for the strongest work in the resume. Every file is a self-contained html document (inline CSS, Google Fonts links allowed, no external JS beyond inline scripts). Responsive at 375, 768 and 1440; honor prefers-reduced-motion with static fallbacks; real hrefs for email and links.",
        "When revisionNotes is set this is a REVISION of your earlier cut for the same client: evolve the existing film per the notes, keep what worked, never start a new concept from scratch.",
        "Deliver within 25 minutes: POST JSON {\"files\":[...]} to deliver.url with deliver.headers. Pages: {\"path\":\"index.html\",\"html\":\"<!doctype html...\"}. Small binary assets (images, fonts, short loops) may ride the bundle as {\"path\":\"assets/hero.jpg\",\"content\":\"<base64>\",\"contentType\":\"image/jpeg\"} and are served next to the pages; reference them by relative path. Heavy video stays an external URL. Max 30 files, 3MB total, index.html required.",
      ].join("\n\n"),
      deliver: {
        method: "POST",
        url: `https://${process.env.API_DOMAIN}/callback`,
        headers: { "X-CF-Secret": sec.CF_CALLBACK_SECRET, "X-CF-Order": orderId, "content-type": "application/json" },
      },
      upload: {
        method: "POST",
        url: `https://${process.env.API_DOMAIN}/studio/asset?orderId=${orderId}&path=`,
        headers: { "X-CF-Secret": sec.CF_CALLBACK_SECRET },
        note: "append the relative file path to url; body = raw file bytes; set the file's content-type header; upload every generated asset BEFORE delivering pages",
      },
    };
    const r = await fetch(sec.AGENT_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sec.AGENT_WEBHOOK_SECRET}`,
        "x-webhook-secret": sec.AGENT_WEBHOOK_SECRET,
        // the platform validates THIS header name; the two above stay for
        // compatibility with any future non-platform build endpoint
        "X-Hyperagent-Webhook-Secret": sec.AGENT_WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      await setStatus(orderId, "dispatch_failed");
      throw new Error(`webhook responded ${r.status}`); // SFN retries with backoff
    }
    // success = we now WAIT: the callback resumes the execution via SendTaskSuccess.
    return { dispatched: true };
  }

  if (action === "finalize") {
    await setStatus(orderId, "ready", { cutKey: cutKey || undefined, taskToken: null });
    const from = process.env.SES_FROM;
    if (from) {
      try {
        const order = await getOrder(orderId);
        if (order?.email) {
          const { SESv2Client, SendEmailCommand } = await import("@aws-sdk/client-sesv2");
          const sesc = new SESv2Client({ region });
          const id = String(orderId).slice(0, 8).toUpperCase();
          const app = (process.env.APP_ORIGIN || "").replace(/\/$/, "");
          const html = `<!DOCTYPE html><html lang="en"><body style="margin:0;background:#F4EFE6"><div style="max-width:560px;margin:0 auto;padding:28px 16px;font-family:Arial,Helvetica,sans-serif"><div style="height:4px;border-radius:2px;background:linear-gradient(90deg,#C8102E,#D9A441,#0E9E62)"></div><div style="background:#fff;border:1px solid rgba(14,28,63,.12);border-radius:14px;padding:30px 32px;margin-top:14px"><div style="font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#D9A441;margin-bottom:10px">Premiere</div><h1 style="margin:0 0 16px;font-size:22px;color:#0E1C3F;text-transform:uppercase">Your film is in.</h1><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#33415f">Order <b>${id}</b> premiered as a new release on your film.</p><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#33415f">Open My Films to watch it live, share it, or request the included revision.</p>${app ? `<a href="${app}" style="display:inline-block;margin-top:6px;background:#C8102E;color:#fff;text-decoration:none;font-size:13px;letter-spacing:.08em;text-transform:uppercase;padding:13px 22px;border-radius:7px">Watch your film</a>` : ""}</div><p style="text-align:center;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#8a90a3;margin-top:16px">CineFolio Studios · Your career, filmed.</p></div></body></html>`;
          await sesc.send(new SendEmailCommand({
            FromEmailAddress: from,
            Destination: { ToAddresses: [order.email] },
            Content: { Simple: { Subject: { Data: "Your Director's Cut is ready." }, Body: { Html: { Data: html } } } },
          }));
        }
      } catch (e) {
        console.error(JSON.stringify({ level: "warn", msg: "premiere email failed soft", orderId, err: e?.message }));
      }
    }
    return { ok: true };
  }

  if (action === "human_review") {
    try { await setStatus(orderId, "human_review", { taskToken: null, failCause: String(cause || "").slice(0, 400) }); } catch { /* order may be gone */ }
    if (TOPIC) {
      try {
        await sns.send(new PublishCommand({
          TopicArn: TOPIC,
          Subject: `CineFolio order ${String(orderId).slice(0, 8)} needs human review`,
          Message: `Order ${orderId} exhausted pipeline retries.\nCause: ${cause}\nOpen the admin console -> Orders -> human_review to retry or refund.`,
        }));
      } catch (e) { console.error(JSON.stringify({ level: "error", msg: "sns publish failed", err: e?.message })); }
    }
    return { ok: true };
  }

  throw new Error(`unknown action ${action}`);
};
