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
    const payload = {
      kind: "cinefolio.order",
      orderId,
      email: order.email, name: order.name, role: order.role, skills: order.skills || [],
      cvText: order.cvText || "",
      assets: order.assets || null, // { photo, covers: [{name,url}], links } — the client's own material
      brief: order.brief || null, // template/palette/customIdea from the Studio workspace
      revisionNotes: order.revisionNotes || null, // set when this run is the included revision
      instructions: [
        "You are the director on a commissioned portfolio film. The client's resume (cvText), their photo and project shots (assets), and their creative brief ride on this order. Build the portfolio that gets this specific person hired: read the resume for the arc of the career, pick the register their industry respects, and art-direct with conviction. Any style is valid; the jersey palette (navy #0E1C3F, crimson #E63946, gold #D9A441, bone #F4EFE6, green #0E9E62) is the house default, never a constraint.",
        "Cinematic motion is the product. Generate imagery with your image tools where it elevates the story (hero atmospheres, section backdrops, project mood frames) and build at least one video-as-frames sequence: a short run of generated stills scrubbed on scroll or crossfaded on a timer as the hero, the way award sites fake film with frames. Reference generated media by URL from your generation tools; keep the documents lean.",
        "Likeness is sacred: the client's face may ONLY come from assets.photo and assets.covers. Use those exact URLs for any portrait or project imagery of them. Never generate, alter, or substitute a human likeness. If no photo is provided, art-direct without a face.",
        "Ship a working Download Resume affordance: render a print-clean resume.html from cvText with @media print styles, link it prominently from index.html, and wire a download or print button. A visitor must be able to leave with the resume in hand.",
        "Structure: index.html plus projects/{slug}.html case-study pages for the strongest work in the resume. Every file is a self-contained html document (inline CSS, Google Fonts links allowed, no external JS beyond inline scripts). Responsive at 375, 768 and 1440; honor prefers-reduced-motion with static fallbacks; real hrefs for email and links.",
        "When revisionNotes is set this is a REVISION of your earlier cut for the same client: evolve the existing film per the notes, keep what worked, never start a new concept from scratch.",
        "Deliver within 25 minutes: POST JSON {\"files\":[...]} to deliver.url with deliver.headers. Pages: {\"path\":\"index.html\",\"html\":\"<!doctype html...\"}. Small binary assets (images, fonts, short loops) may ride the bundle as {\"path\":\"assets/hero.jpg\",\"content\":\"<base64>\",\"contentType\":\"image/jpeg\"} and are served next to the pages; reference them by relative path. Heavy video stays an external URL. Max 30 files, 3MB total, index.html required.",
      ].join("\n\n"),
      deliver: {
        method: "POST",
        url: `https://${process.env.API_DOMAIN}/callback`,
        headers: { "X-CF-Secret": sec.CF_CALLBACK_SECRET, "X-CF-Order": orderId, "content-type": "application/json" },
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
