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
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
// the SHARED template library: terraform stitches infra/modules/api/lambda/email.mjs
// into this bundle, so pipeline and api emails can never drift apart.
import { premiereReadyEmail, revisionPremiereEmail, needsAttentionEmail, orderRejectedEmail } from "./email.mjs";
// the content-moderation screen. Creem mandates prompt moderation for any
// product that generates images or video, and this pipeline generates both, so
// EVERY brief is screened here before it can reach the AI director. The verdict
// carries verdict.transient so we can tell a real content violation (terminal)
// apart from a moderation-vendor outage (retryable); see the throw sites below.
import { moderate, moderationConfigFromSecrets } from "./moderation.mjs";
import { DIRECTOR_KIT } from "./director-kit.mjs";
import { buildDirectorInstructions, DIRECTOR_PROMPT_VERSION } from "./director-prompt.mjs";

const region = process.env.AWS_REGION || "eu-central-1";
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), { marshallOptions: { removeUndefinedValues: true } });
const ssm = new SSMClient({ region });
const sns = new SNSClient({ region });
const s3 = new S3Client({ region });
const TABLE = process.env.TABLE_NAME;
const TOPIC = process.env.ALARM_TOPIC_ARN;
const ARTIFACTS = process.env.ARTIFACTS_BUCKET || "";

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

// the client's curated dossier (My Profile / the onboarding guide writes it).
// Read fresh at dispatch time — not stored on the order — so edits made after
// ordering still reach the director, and revision runs see today's record.
// Fail-soft: a missing dossier never blocks a build; cvText remains the script.
const getDossier = async (order) => {
  const sub = String(order?.GSI1PK || "").startsWith("USER#") ? order.GSI1PK.slice(5) : null;
  if (!sub || sub === "anon") return null;
  try {
    const r = await doc.send(new GetCommand({ TableName: TABLE, Key: { PK: `USER#${sub}`, SK: "PORTFOLIO" } }));
    return r.Item?.data || null;
  } catch {
    return null;
  }
};

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

// A CONFIRMED content verdict: the brief is rejected on its merits. Routed by
// the state machine's Validate Catch to InvalidNoop (a terminal Succeed): a
// retry would screen the same text and reach the same answer, so it is final.
class OrderInvalid extends Error {
  constructor(msg) { super(msg); this.name = "OrderInvalid"; }
}

// A TRANSIENT moderation-vendor failure (Creem timeout / 5xx, fail-closed): we
// have NO verdict on the brief, only an unreachable screen. This is deliberately
// NOT OrderInvalid: an outage must never terminally reject an honest paid order
// and brand the customer a policy violator. The name is matched by the Validate
// task's Retry in main.tf so Step Functions retries with backoff; if it still
// fails, the Validate Catch (States.ALL) parks the order in human_review, which
// an operator CAN recover, instead of InvalidNoop, which they cannot. The
// security property is intact: we throw BEFORE returning, so an unscreened prompt
// never reaches dispatch. Stalling is acceptable; shipping unscreened is not.
class ModerationUnavailable extends Error {
  constructor(msg) { super(msg); this.name = "ModerationUnavailable"; }
}

// Page the operator via the existing alarm topic. Fail-soft on the PUBLISH
// itself (a paging hiccup must not change an order's outcome), matching how
// human_review pages. The CALLER decides the order's fate; this only notifies.
async function pageOperator(subject, message) {
  if (!TOPIC) return;
  try {
    await sns.send(new PublishCommand({ TopicArn: TOPIC, Subject: subject, Message: message }));
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "sns publish failed", err: e?.message }));
  }
}

// Restore the credit a terminal rejection would otherwise burn. studio.mjs
// spends ONE credit at order time, BEFORE enqueue, with a conditional ADD on the
// user profile: a free cut increments profile.aiCuts toward its cap, and a paid
// cut decrements profile.paidCredits. When moderation then terminally rejects the
// order, nothing used to give that credit back: the customer paid, got a
// violation notice, and lost the credit with no self-service path. This mirrors
// the spend in reverse so a rejected customer is made whole.
//
// It IS possible from this lambda: the pipeline role holds dynamodb:UpdateItem on
// the whole table (see main.tf "Orders" statement), the same table the profile
// row lives in, and the order row already carries the owner as GSI1PK=USER#<sub>
// (getDossier reads it the same way) plus freeCut/paid telling us which counter
// was spent. So we can restore it here rather than faking it or punting to admin.
//
// IDEMPOTENCY is the hard requirement: a Validate retry, a duplicate rejection,
// or an at-least-once re-delivery must NEVER refund twice. We CLAIM the refund
// with a conditional stamp on the ORDER row (creditRestoredAt, written only when
// it is absent); winning the claim is what gates the money, so at most one caller
// ever proceeds to touch the profile. A loser (already stamped) simply returns.
// We stamp-then-credit on purpose: the claim is the at-most-once guarantee, and
// a rare profile-write failure after a won claim is surfaced loudly (and the
// operator is already paged on rejection) rather than risking a double refund.
async function restoreCredit(order) {
  const orderId = order?.orderId;
  const sub = String(order?.GSI1PK || "").startsWith("USER#") ? order.GSI1PK.slice(5) : null;
  // anon/preview orders never spent an account credit, and an order that recorded
  // neither a free nor a paid spend has nothing to give back.
  if (!orderId || !sub || sub === "anon") return { refunded: false, reason: "no account owner" };
  if (!order.freeCut && !order.paid) return { refunded: false, reason: "no credit was spent" };

  // Claim: stamp the order at most once. attribute_not_exists(creditRestoredAt)
  // means only the FIRST caller wins; a retry/duplicate loses and refunds nothing.
  try {
    await doc.send(new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `ORDER#${orderId}`, SK: "META" },
      UpdateExpression: "SET creditRestoredAt = :t",
      ConditionExpression: "attribute_exists(PK) AND attribute_not_exists(creditRestoredAt)",
      ExpressionAttributeValues: { ":t": new Date().toISOString() },
    }));
  } catch (e) {
    if (e?.name === "ConditionalCheckFailedException") {
      // already refunded (or claimed) once: this is the idempotent no-op path.
      return { refunded: false, reason: "already restored" };
    }
    throw e; // a real DynamoDB fault: let it surface, we have not touched money yet
  }

  // Claim won: apply the reverse of the spend on the profile. Mirror studio.mjs
  // exactly. The floor conditions keep the counters honest if state ever drifts:
  // aiCuts is only decremented while it is > 0, so it never goes negative.
  const profileKey = { PK: `USER#${sub}`, SK: "PROFILE" };
  try {
    if (order.freeCut) {
      await doc.send(new UpdateCommand({
        TableName: TABLE,
        Key: profileKey,
        UpdateExpression: "SET updatedAt = :u ADD aiCuts :neg",
        ConditionExpression: "attribute_exists(aiCuts) AND aiCuts > :zero",
        ExpressionAttributeValues: { ":neg": -1, ":zero": 0, ":u": new Date().toISOString() },
      }));
    } else {
      // paid credit: hand it straight back so the customer can re-run their order.
      await doc.send(new UpdateCommand({
        TableName: TABLE,
        Key: profileKey,
        UpdateExpression: "SET updatedAt = :u ADD paidCredits :one",
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeValues: { ":one": 1, ":u": new Date().toISOString() },
      }));
    }
    return { refunded: true, kind: order.freeCut ? "free" : "paid" };
  } catch (e) {
    // The claim is stamped but the profile write failed. We do NOT unstamp: that
    // would reopen the double-refund window, and at-most-once wins over
    // at-least-once here. Surface it loudly; the rejection already paged a human,
    // who has the order id and can complete the refund by hand.
    console.error(JSON.stringify({ level: "error", msg: "credit restore claimed but profile write failed", orderId, sub, err: e?.message }));
    return { refunded: false, reason: "profile write failed after claim" };
  }
}

// fail-soft customer mail: a mail hiccup must never fail a pipeline state
const APP_ORIGIN = (process.env.APP_ORIGIN || "").replace(/\/$/, "");
async function mailCustomer(orderId, to, built) {
  const from = process.env.SES_FROM;
  if (!from || !to || !built) return;
  try {
    const { SESv2Client, SendEmailCommand } = await import("@aws-sdk/client-sesv2");
    const sesc = new SESv2Client({ region });
    const configSet = process.env.SES_CONFIG_SET || "";
    await sesc.send(new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [to] },
      ...(configSet ? { ConfigurationSetName: configSet } : {}),
      Content: {
        Simple: {
          Subject: { Data: built.subject },
          Body: { Html: { Data: built.html }, ...(built.text ? { Text: { Data: built.text } } : {}) },
        },
      },
    }));
  } catch (e) {
    console.error(JSON.stringify({ level: "warn", msg: "customer email failed soft", orderId, err: e?.message }));
  }
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

    // CONTENT MODERATION, the compliance gate. Screen the customer's free-text
    // inputs before anything is dispatched to the image/video director. The
    // deterministic layer always runs (offline, no cost); the hosted hook layers
    // on only when its SSM params are set. A hosted OUTAGE falls back to the
    // deterministic verdict (fail-open, never break a paid order); a hosted
    // POSITIVE violation rejects (fail-closed). See moderation.mjs for the why.
    const verdict = await moderate(
      // orderId rides along as the Creem external_id, so every screening call is
      // attributable to the order it protected when a reviewer audits us.
      // EVERY user-authored string that rides on the dispatch payload is in this
      // screen: the brief, the resume, the name, the revision notes when this is
      // a revision run, and the smaller strings (email, role, skills, template
      // and palette ids, asset names, urls, links). A field the model sees that
      // the screen does not is a bypass, which is exactly what Creem forbids;
      // revisionNotes was that bypass until this list matched the payload.
      {
        customIdea: order.brief?.customIdea,
        cvText: order.cvText,
        name: order.name,
        revisionNotes: order.revisionNotes,
        extra: [
          order.email,
          order.role,
          Array.isArray(order.skills) ? order.skills.join(" ") : order.skills,
          order.brief?.template,
          order.brief?.palette,
          order.assets?.photo,
          order.assets?.links,
          ...(Array.isArray(order.assets?.covers)
            ? order.assets.covers.flatMap((c) => [c?.name, c?.url])
            : []),
        ],
        orderId,
      },
      moderationConfigFromSecrets(sec),
    );
    // Record the verdict on the order row ALWAYS, allowed or not. This is the
    // audit trail a payment-provider reviewer asks for: proof that moderation
    // ran on this order and what it concluded. Fail-soft on the WRITE of a
    // clean verdict so a bookkeeping hiccup never blocks a legitimate build.
    if (verdict.allowed) {
      try {
        await setStatus(orderId, order.status, { moderation: { ...verdict, at: new Date().toISOString() } });
      } catch (e) {
        console.error(JSON.stringify({ level: "warn", msg: "moderation audit write failed soft", orderId, err: e?.message }));
      }
    } else if (verdict.transient) {
      // TRANSIENT vendor outage, NOT a verdict. Creem failed closed (timeout or
      // 5xx) with no confirmed violation, so we know NOTHING about this brief; a
      // brief the deterministic floor and hosted layer both cleared is blocked
      // ONLY because a compliance screen was unreachable this attempt. This must
      // NOT become a terminal reject: doing so permanently kills honest in-flight
      // paid orders during a brief outage and brands the customer a violator. The
      // doctrine is STALL, not reject. We leave the order in its current
      // dispatchable status (no terminal write), record the stall for the audit
      // trail (fail-soft), page for visibility, then throw ModerationUnavailable
      // so the Validate Retry backs off and re-screens; if it still fails the
      // Catch parks it in human_review, which an operator can recover. The
      // security floor is untouched: we throw BEFORE returning, so dispatch is
      // NEVER reached and no unscreened prompt goes to the model.
      const stallCause = `moderation unavailable: ${verdict.reasons.join("; ")}`;
      try {
        await setStatus(orderId, order.status, { moderation: { ...verdict, at: new Date().toISOString() } });
      } catch (e) {
        console.error(JSON.stringify({ level: "warn", msg: "moderation stall audit write failed soft", orderId, err: e?.message }));
      }
      await pageOperator(
        `CineFolio order ${String(orderId).slice(0, 8)} STALLED: moderation vendor unavailable`,
        `Order ${orderId} could not be screened because a moderation vendor was unreachable (fail-closed).\nReasons: ${verdict.reasons.join("; ")}\nCreem: ${verdict.creem || "n/a"}\nThe pipeline is retrying with backoff; if it exhausts retries the order lands in human_review (recoverable), NOT a terminal reject.`,
      );
      throw new ModerationUnavailable(stallCause); // retryable -> backoff, then human_review
    } else {
      // DELIBERATE EXCEPTION to this codebase's fail-soft doctrine: a confirmed
      // content violation MUST block. Move the order to a terminal rejected
      // state with a clear failCause and the full verdict, page a human, then
      // throw OrderInvalid so the state machine routes to InvalidNoop and the
      // order NEVER reaches Dispatch. The status write is NOT swallowed here:
      // if we cannot record the rejection we must not silently proceed, so the
      // throw still fires and the order lands non-dispatched.
      const failCause = `content moderation: ${verdict.reasons.join("; ")}`;
      try {
        await setStatus(orderId, "rejected", {
          taskToken: null,
          failCause: failCause.slice(0, 400),
          moderation: { ...verdict, at: new Date().toISOString() },
        });
      } catch (e) {
        console.error(JSON.stringify({ level: "error", msg: "rejected-status write failed", orderId, err: e?.message }));
      }
      // A terminal reject burned the customer's credit at order time; give it
      // back (idempotently) so a rejected customer is made whole. This is safe to
      // run after the status write and is a no-op on a retry (see restoreCredit).
      const refund = await restoreCredit(order).catch((e) => {
        console.error(JSON.stringify({ level: "error", msg: "credit restore failed", orderId, err: e?.message }));
        return { refunded: false, reason: "error" };
      });
      await pageOperator(
        `CineFolio order ${String(orderId).slice(0, 8)} REJECTED by content moderation`,
        `Order ${orderId} was blocked before dispatch.\nSeverity: ${verdict.severity}\nReasons: ${verdict.reasons.join("; ")}\nSource: ${verdict.source}\nCredit restored: ${refund.refunded ? refund.kind : `no (${refund.reason})`}\nOpen the admin console -> Orders -> rejected to review.`,
      );
      // tell the CUSTOMER, not only the operator: a rejected order used to be a
      // silent dead-end (no email, no in-app state) that looked like a healthy
      // render forever. Fail-soft on the mail, exactly like every other side
      // effect here: a mail hiccup must never mask the block.
      if (order?.email) await mailCustomer(orderId, order.email, orderRejectedEmail(order, APP_ORIGIN, refund.refunded)).catch(() => {});
      throw new OrderInvalid(failCause); // -> InvalidNoop (terminal, never dispatches)
    }

    return { ok: true, email: order.email, name: order.name };
  }

  if (action === "dispatch") {
    const order = await getOrder(orderId);
    if (!order) throw new OrderInvalid("unknown order");
    const sec = await secrets();
    // The task token rides on the order so the /callback route can resume the execution.
    await setStatus(orderId, "filming", { taskToken, directorContract: DIRECTOR_PROMPT_VERSION });
    // REVISION runs carry the existing cut: a presigned GET url for every file
    // of the delivered film (pages AND media), so the director EVOLVES the cut
    // instead of rebuilding it. Modified pages get rewritten; untouched media
    // is reused by relative path — it already lives next to the cut server-side
    // and the callback's manifest union keeps it. This is the margin protector:
    // a revision should cost editing, not a second film shoot.
    let dossier = await getDossier(order);
    // THE FILM IS NOT ALWAYS ABOUT THE ACCOUNT HOLDER. The dossier is the
    // account's curated record, and the director treats it as authoritative
    // (dossier WINS over cvText) — so attaching it to an order whose resume
    // belongs to a DIFFERENT person recasts the whole film as the account
    // holder (order 80a10e12 shipped the owner's film for a resume about
    // someone else). When both names exist and the dossier's name does not
    // appear anywhere in the order's resume text, the dossier stays home and
    // cvText alone is the script.
    const dossierName = String(dossier?.identity?.name || "").trim().toLowerCase();
    if (dossierName && order?.cvText && !String(order.cvText).toLowerCase().includes(dossierName)) {
      console.log(JSON.stringify({ level: "info", msg: "dossier withheld: order resume reads as a different person", orderId, dossierName }));
      dossier = null;
    }
    // The dossier is read FRESH here and handed to the model as the approved
    // screenplay, so screening only the frozen order snapshot at validate left
    // the largest model-facing free-text surface in the product unscreened.
    // Creem mandates that every prompt reaching an image or video model is
    // screened with no bypass path, and we assert that in our application, so
    // the dossier is screened here at the point of dispatch. Same doctrine as
    // validate: a confirmed violation blocks before the model ever sees it.
    if (dossier && typeof dossier === "object") {
      // The FULL dossier is screened: no slice. The profile write path accepts
      // up to 200KB of JSON and a cap here was a bypass window (clean text up
      // front, anything at all behind the cap reached the model unscreened).
      // moderate() chunks long text through the network layers, so every
      // character gets a verdict; see chunkText in moderation.mjs.
      const dossierText = JSON.stringify(dossier);
      const dv = await moderate(
        { customIdea: dossierText, cvText: "", name: order.name, orderId },
        moderationConfigFromSecrets(sec),
      );
      if (!dv.allowed && dv.transient) {
        // TRANSIENT vendor outage on the dossier screen, NOT a verdict. Same
        // distinction as validate: Creem was unreachable (timeout / 5xx) with no
        // confirmed violation, so we must STALL, not terminally reject. Leave the
        // order status alone (do NOT flip to rejected), record the stall for the
        // audit trail (fail-soft), page for visibility, and throw
        // ModerationUnavailable. At Dispatch this surfaces as States.TaskFailed,
        // which the Dispatch Retry already backs off on; if it exhausts, the
        // Dispatch Catch parks the order in human_review (recoverable). We throw
        // BEFORE the webhook fires, so the unscreened dossier never reaches the
        // model: the security floor is intact, we only stall.
        const stallCause = `moderation unavailable (dossier): ${(dv.reasons || []).join(", ") || "vendor outage"}`;
        try {
          await setStatus(orderId, order.status, { moderation: { ...dv, surface: "dossier", at: new Date().toISOString() } });
        } catch { /* the audit write must never mask the stall */ }
        await pageOperator("CineFolio: dossier screen STALLED (moderation vendor unavailable)", `Order ${orderId} could not be screened (fail-closed); the pipeline is retrying, then human_review if it exhausts. Reasons: ${(dv.reasons || []).join(", ") || "vendor outage"}`).catch(() => {});
        throw new ModerationUnavailable(stallCause);
      }
      if (!dv.allowed) {
        const cause = `content moderation (dossier): ${(dv.reasons || []).join(", ") || "policy"}`;
        try {
          await setStatus(orderId, "rejected", { taskToken: null, failCause: cause, moderation: { ...dv, surface: "dossier", at: new Date().toISOString() } });
        } catch { /* the audit write must never mask the block */ }
        // Terminal dossier rejection also burned a credit at order time; restore
        // it idempotently, exactly like the validate-surface rejection does.
        const refund = await restoreCredit(order).catch((e) => {
          console.error(JSON.stringify({ level: "error", msg: "credit restore failed (dossier)", orderId, err: e?.message }));
          return { refunded: false, reason: "error" };
        });
        await pageOperator("CineFolio: dossier blocked by moderation", `Order ${orderId} was rejected before dispatch. Reasons: ${(dv.reasons || []).join(", ") || "policy"}\nCredit restored: ${refund.refunded ? refund.kind : `no (${refund.reason})`}`).catch(() => {});
        // same customer-facing honesty as the validate surface: tell them the
        // brief was declined and the credit is back. Fail-soft on the mail.
        if (order?.email) await mailCustomer(orderId, order.email, orderRejectedEmail(order, APP_ORIGIN, refund.refunded)).catch(() => {});
        throw new OrderInvalid(cause);
      }
    }
    const isRevision = Boolean(order.revisionNotes);
    let existingCut = null;
    if (isRevision && Array.isArray(order.cutFiles) && order.cutFiles.length && ARTIFACTS) {
      try {
        existingCut = await Promise.all(order.cutFiles.map(async (p) => ({
          path: p,
          url: await getSignedUrl(s3, new GetObjectCommand({ Bucket: ARTIFACTS, Key: `orders/${orderId}/cut/${p}` }), { expiresIn: 1800 }),
        })));
      } catch (e) {
        // fail-soft: a presign hiccup downgrades the revision to a fresh build
        // rather than stalling the order in the queue
        console.error(JSON.stringify({ level: "warn", msg: "existing cut presign failed; dispatching without it", orderId, err: e?.message }));
        existingCut = null;
      }
    }

    const payload = {
      kind: "cinefolio.order",
      orderId,
      email: order.email, name: order.name, role: order.role, skills: order.skills || [],
      cvText: order.cvText || "",
      assets: order.assets || null, // { photo, covers: [{name,url}], links } — the client's own material
      kit: DIRECTOR_KIT, // tested first-party depth, reveal, pin, tilt, and mobile fallback grammar
      brief: order.brief || null, // template/palette/customIdea from the Studio workspace
      dossier, // the client's CURATED record (My Profile): identity, story, experience, projects, certificates, links — when present, the approved screenplay
      revision: isRevision, // true when this run evolves an earlier delivery
      revisionNotes: order.revisionNotes || null, // set when this run is the included revision
      existingCut, // [{ path, url }] presigned reads of the delivered cut (~30 min), null on first builds
      instructions: buildDirectorInstructions(),
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
    const order = await getOrder(orderId).catch(() => null);
    if (order?.email) {
      // a revision landing reads differently from a first delivery
      const built = (order.revisionsUsed || 0) > 0
        ? revisionPremiereEmail(order, APP_ORIGIN)
        : premiereReadyEmail(order, APP_ORIGIN);
      await mailCustomer(orderId, order.email, built);
    }
    return { ok: true };
  }

  if (action === "human_review") {
    try { await setStatus(orderId, "human_review", { taskToken: null, failCause: String(cause || "").slice(0, 400) }); } catch { /* order may be gone */ }
    // the client hears the truth too: retries are exhausted, a person is on it.
    // Their 25-minute promise must never break silently.
    const order = await getOrder(orderId).catch(() => null);
    if (order?.email) await mailCustomer(orderId, order.email, needsAttentionEmail(order, APP_ORIGIN));
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
