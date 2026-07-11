// auth-mailer.mjs — Cognito trigger lambda for the account-lifecycle emails.
// Two jobs, one rule: NEVER block auth. Every path returns the event, every
// send is fail-soft, every error is swallowed after a log line.
//
//   CustomMessage_SignUp / _ResendCode  -> branded verification-code email
//   CustomMessage_ForgotPassword        -> branded reset-code email
//   PostConfirmation_ConfirmSignUp      -> welcome email via SES
//
// email.mjs is the SHARED template library: terraform stitches
// infra/modules/api/lambda/email.mjs into this bundle at plan time.
import { welcomeEmail, verifyCodeEmail, resetCodeEmail } from "./email.mjs";

const region = process.env.AWS_REGION || "eu-central-1";
const FROM = process.env.SES_FROM || "";
const APP_ORIGIN = (process.env.APP_ORIGIN || "").replace(/\/$/, "");

async function sendSoft(to, built) {
  if (!FROM || !to || !built) return;
  try {
    const { SESv2Client, SendEmailCommand } = await import("@aws-sdk/client-sesv2");
    const c = new SESv2Client({ region });
    const configSet = process.env.SES_CONFIG_SET || "";
    await c.send(new SendEmailCommand({
      FromEmailAddress: FROM,
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
    console.error(JSON.stringify({ level: "warn", msg: "auth email failed soft", err: e?.message }));
  }
}

export const handler = async (event) => {
  try {
    const src = event?.triggerSource || "";

    // Cognito substitutes the real digits for codeParameter after we return.
    if (src === "CustomMessage_SignUp" || src === "CustomMessage_ResendCode") {
      const b = verifyCodeEmail(event.request?.codeParameter || "{####}");
      event.response.emailSubject = b.subject;
      event.response.emailMessage = b.html;
      return event;
    }
    if (src === "CustomMessage_ForgotPassword") {
      const b = resetCodeEmail(event.request?.codeParameter || "{####}");
      event.response.emailSubject = b.subject;
      event.response.emailMessage = b.html;
      return event;
    }
    if (src.startsWith("CustomMessage_")) {
      return event; // any other flow keeps Cognito's default copy
    }

    // welcome fires on sign-up confirmation only, never on password-reset confirms
    if (src === "PostConfirmation_ConfirmSignUp") {
      const email = event.request?.userAttributes?.email;
      if (email) await sendSoft(email, welcomeEmail({ email }, APP_ORIGIN));
      return event;
    }

    return event;
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "auth-mailer swallowed", err: e?.message }));
    return event; // a mail problem must NEVER fail sign-up
  }
};
