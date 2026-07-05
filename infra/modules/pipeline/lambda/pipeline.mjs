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
      instructions:
        "Produce a single-file cinematic portfolio HTML (CineFolio jersey brand: navy #0E1C3F, crimson #E63946, gold #D9A441, bone #F4EFE6, green #0E9E62). Max 900KB, self-contained, no external JS. POST it raw to deliver.url with deliver.headers within 25 minutes.",
      deliver: {
        method: "POST",
        url: `https://${process.env.API_DOMAIN}/callback`,
        headers: { "X-CF-Secret": sec.CF_CALLBACK_SECRET, "X-CF-Order": orderId, "content-type": "text/html" },
      },
    };
    const r = await fetch(sec.AGENT_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sec.AGENT_WEBHOOK_SECRET}`,
        "x-webhook-secret": sec.AGENT_WEBHOOK_SECRET,
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
    // P3-next: SES premiere email fires here.
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
