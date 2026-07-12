// email.mjs — THE template library for every CineFolio email. One brand shell,
// one builder per email, each returning { subject, html, text }. Builders are
// PURE (no ctx, no imports): the pipeline and auth-mailer lambdas bundle this
// exact file via their terraform archives, so senders can never drift apart.
// Doctrine: inline code templates only (versioned, testable against fakes),
// fail-soft sends (mail never breaks a money flow), plaintext part always.
//
// Design system, "the call sheet": table-based layout (survives Outlook),
// hidden preheader, navy header band with the mono wordmark + tri-color
// hairline, white card, mono gold kicker, bold caps title, optional mono
// details rows and a code hero, crimson CTA. Zero images, zero webfonts:
// nothing to block, nothing to break. Every color is the jersey palette.

const BRAND = {
  navy: "#0E1C3F", red: "#C8102E", gold: "#D9A441", bone: "#F4EFE6",
  green: "#0E9E62", ink: "#33415f", dim: "#8a90a3", hairline: "rgba(14,28,63,.12)",
};

const MONO = "'Courier New',Courier,monospace";
const SANS = "Arial,Helvetica,sans-serif";

export const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// x: { preheader, details: [[label, value]], code, secondary }
function shell(kicker, title, lines, cta, x = {}) {
  const rows = lines.map((l) =>
    `<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:1.7;color:${BRAND.ink};">${l}</p>`).join("");

  const codeHero = x.code ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 20px;">
          <tr><td align="center" style="background:${BRAND.bone};border:1px dashed ${BRAND.gold};border-radius:10px;padding:22px 12px;">
            <div style="font-family:${MONO};font-size:10px;letter-spacing:.3em;color:${BRAND.dim};text-transform:uppercase;padding-bottom:8px;">Your code</div>
            <div style="font-family:${MONO};font-size:30px;font-weight:bold;letter-spacing:.28em;color:${BRAND.navy};">${x.code}</div>
          </td></tr>
        </table>` : "";

  const details = x.details?.length ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;">
          ${x.details.map(([k, v]) => `
          <tr>
            <td style="font-family:${MONO};font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${BRAND.dim};padding:9px 0;border-top:1px solid ${BRAND.hairline};white-space:nowrap;">${k}</td>
            <td align="right" style="font-family:${MONO};font-size:12px;color:${BRAND.navy};padding:9px 0 9px 14px;border-top:1px solid ${BRAND.hairline};word-break:break-all;">${v}</td>
          </tr>`).join("")}
        </table>` : "";

  const button = cta ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">
          <tr><td align="center" bgcolor="${BRAND.red}" style="border-radius:8px;">
            <a href="${cta.url}" style="display:inline-block;font-family:${SANS};font-size:13px;font-weight:bold;letter-spacing:.1em;text-transform:uppercase;color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:8px;">${cta.label}</a>
          </td></tr>
        </table>` : "";

  const secondary = x.secondary
    ? `<p style="margin:18px 0 0;font-family:${SANS};font-size:12.5px;line-height:1.6;color:${BRAND.dim};border-top:1px solid ${BRAND.hairline};padding-top:14px;">${x.secondary}</p>`
    : "";

  const preheader = x.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(x.preheader)}${"&nbsp;&zwnj;".repeat(40)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bone};">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bone};">
  <tr><td align="center" style="padding:36px 14px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">

      <!-- header band: the studio slate -->
      <tr><td style="background:${BRAND.navy};border-radius:14px 14px 0 0;padding:20px 32px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="font-family:${MONO};font-size:12px;letter-spacing:.3em;color:${BRAND.bone};white-space:nowrap;">CINEFOLIO&nbsp;<span style="color:${BRAND.gold};">STUDIOS</span></td>
          <td align="right" style="font-family:${MONO};font-size:10px;letter-spacing:.22em;color:rgba(244,239,230,.55);white-space:nowrap;">EST.&nbsp;2026</td>
        </tr></table>
      </td></tr>
      <!-- tri-color hairline: the jersey mark -->
      <tr><td style="height:3px;line-height:3px;font-size:0;background:${BRAND.red};background:linear-gradient(90deg,${BRAND.red},${BRAND.gold},${BRAND.green});">&nbsp;</td></tr>

      <!-- the card -->
      <tr><td style="background:#ffffff;border:1px solid ${BRAND.hairline};border-top:0;border-radius:0 0 14px 14px;padding:34px 32px 30px;">
        <div style="font-family:${MONO};font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:${BRAND.gold};padding-bottom:12px;">${kicker}</div>
        <h1 style="margin:0 0 16px;font-family:${SANS};font-weight:800;font-size:24px;line-height:1.15;letter-spacing:.01em;text-transform:uppercase;color:${BRAND.navy};">${title}</h1>
        ${rows}
        ${codeHero}
        ${details}
        ${button}
        ${secondary}
      </td></tr>

      <!-- footer -->
      <tr><td align="center" style="padding:20px 10px 4px;">
        <p style="margin:0 0 6px;font-family:${MONO};font-size:10px;letter-spacing:.26em;text-transform:uppercase;color:${BRAND.dim};">CineFolio Studios · Your career, filmed.</p>
        <p style="margin:0;font-family:${MONO};font-size:10px;letter-spacing:.2em;"><a href="https://www.cinefolio.dev" style="color:${BRAND.dim};text-decoration:underline;">cinefolio.dev</a></p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// plaintext part: same content, tags stripped, our entities decoded.
// Multipart with a text alternative scores better with every major filter.
function textOf(title, lines, cta, x = {}) {
  const strip = (s) => String(s).replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");
  return [
    strip(title).toUpperCase(),
    "",
    ...lines.map(strip),
    ...(x.code ? ["", `YOUR CODE: ${strip(x.code)}`] : []),
    ...(x.details?.length ? ["", ...x.details.map(([k, v]) => `${strip(k)}: ${strip(v)}`)] : []),
    ...(cta ? ["", `${strip(cta.label)}: ${cta.url}`] : []),
    ...(x.secondary ? ["", strip(x.secondary)] : []),
    "",
    "CineFolio Studios · Your career, filmed.",
    "https://www.cinefolio.dev",
  ].join("\n");
}

function build(kicker, title, lines, cta, x = {}) {
  return { html: shell(kicker, title, lines, cta, x), text: textOf(title, lines, cta, x) };
}

const shortId = (orderId) => String(orderId || "").slice(0, 8).toUpperCase();
// the Lounge is the order's home in the console; fall back to the console root
const loungeUrl = (appOrigin, orderId) => (appOrigin ? `${appOrigin}/order/${orderId}` : "");

// ---------- account lifecycle ----------

export function welcomeEmail(user, appOrigin) {
  return {
    subject: "Welcome to the studio.",
    ...build("Studio pass active", "You're on the lot.", [
      "Your CineFolio account is live. Here is what your pass opens:",
      "<b>Build a film free.</b> The Set turns your resume into a finished portfolio site: pick a template family and a film stock, premiere to your own <b>yourname.cinefolio.dev</b> address in one click.",
      `<b>Three AI Director's Cuts included.</b> Send your brief through the studio pipeline and an AI director art-directs a bespoke scroll-story film, delivered to your lounge usually within the hour.`,
      `<b>Every premiere is versioned.</b> New releases in one click, instant rollback, share kit and audience stats on every film.`,
    ], appOrigin ? { url: appOrigin, label: "Enter the studio" } : null, {
      preheader: "Your studio pass is active: build a film free, premiere it, and spend your three AI cuts.",
      secondary: "You are receiving this one-time note because this address opened a CineFolio account. No newsletters follow.",
    }),
  };
}

// Cognito CustomMessage bodies: {code} arrives as the literal placeholder
// (event.request.codeParameter) and Cognito substitutes the real digits.
export function verifyCodeEmail(code) {
  return {
    subject: "Your CineFolio code: finish creating your account.",
    ...build("Admission", "Confirm your email.", [
      "Enter this code in the studio console to finish creating your account.",
    ], null, {
      code,
      preheader: "Your 6-digit CineFolio confirmation code is inside.",
      secondary: "Didn't create a CineFolio account? Ignore this email and nothing happens.",
    }),
  };
}

export function resetCodeEmail(code) {
  return {
    subject: "Your CineFolio password reset code.",
    ...build("Key change", "Reset your password.", [
      "Use this code in the studio console to set a new password.",
    ], null, {
      code,
      preheader: "Your CineFolio password reset code is inside.",
      secondary: "Didn't ask for a reset? Ignore this email; your password stays as it is.",
    }),
  };
}

// ---------- order lifecycle ----------

export function orderReceivedEmail(order, appOrigin) {
  const id = shortId(order.orderId);
  const cta = appOrigin ? { url: loungeUrl(appOrigin, order.orderId), label: "Watch it happen" } : null;
  return {
    subject: `Order ${id} received. Cameras are getting ready.`,
    ...build("Order received", "The studio has your brief.", [
      `${order.name ? `<b>${esc(order.name)}</b>, the` : "The"} cameras are being set for your Director's Cut. It is usually delivered within the hour, and this inbox hears the moment it lands.`,
      "Three director's notes ride on every order, so changes are part of the deal.",
    ], cta, {
      preheader: `Order ${id} is in the production queue. Your cut usually lands within the hour.`,
      details: [["Order", id], ["Status", "In the queue"], ["Included notes", "3"]],
    }),
  };
}

export function premiereReadyEmail(order, appOrigin) {
  const id = shortId(order.orderId);
  const cta = appOrigin ? { url: loungeUrl(appOrigin, order.orderId), label: "Watch the cut" } : null;
  return {
    subject: "Your Director's Cut is ready.",
    ...build("The cut is in", "Your film is ready to premiere.", [
      `The Director's Cut for order <b>${id}</b> just arrived from the studio floor.`,
      "Step into the lounge to watch it, then premiere it onto your film in one click, or send a director's note if anything should change.",
    ], cta, {
      preheader: "Your Director's Cut arrived. Watch it in the lounge and premiere it in one click.",
      details: [["Order", id], ["Status", "Ready to premiere"]],
    }),
  };
}

export function revisionReceivedEmail(order, appOrigin) {
  const id = shortId(order.orderId);
  const cta = appOrigin ? { url: loungeUrl(appOrigin, order.orderId), label: "Track it in the studio" } : null;
  return {
    subject: `Revision for order ${id} is in production.`,
    ...build("Revision", "The crew is on it.", [
      `Your director's note for order <b>${id}</b> reached the studio and the cameras are rolling again.`,
      "The revised cut lands back in your lounge, and you will hear from us here when it does.",
    ], cta, {
      preheader: "Your director's note reached the studio. The cameras are rolling again.",
      details: [["Order", id], ["Status", "Filming the revision"]],
    }),
  };
}

export function revisionPremiereEmail(order, appOrigin) {
  const id = shortId(order.orderId);
  const cta = appOrigin ? { url: loungeUrl(appOrigin, order.orderId), label: "Watch the new cut" } : null;
  return {
    subject: "Your revised cut is ready.",
    ...build("Revision delivered", "The new cut is in.", [
      `The studio reworked order <b>${id}</b> to your notes and the revised cut is waiting in your lounge.`,
      "Watch it, premiere it onto your film, or send another note if it is not right yet.",
    ], cta, {
      preheader: "The studio reworked your film to your notes. The revised cut is in your lounge.",
      details: [["Order", id], ["Status", "Revised cut ready"]],
    }),
  };
}

// honest delay note for human_review: the promise broke, a person is on it,
// nothing is needed from the client. No fake ETA, no jargon.
export function needsAttentionEmail(order, appOrigin) {
  const id = shortId(order.orderId);
  const cta = appOrigin ? { url: loungeUrl(appOrigin, order.orderId), label: "Check your order" } : null;
  return {
    subject: `Order ${id}: the studio needs a moment.`,
    ...build("Production note", "Your film hit a snag.", [
      `Order <b>${id}</b> is taking longer than it should, so a human at the studio is now looking at it personally.`,
      "Nothing is needed from you. You will hear from us here the moment your cut is ready, and if we cannot deliver, you will not pay a thing.",
    ], cta, {
      preheader: "Your order is taking longer than it should. A human is on it; nothing needed from you.",
      details: [["Order", id], ["Status", "With the studio crew"]],
    }),
  };
}

// ---------- site lifecycle ----------

// the share kit: fires once, on a film's FIRST premiere (engine builds and
// AI cuts alike). The live URL is the hero; the console is the follow-up.
export function firstPremiereEmail(site, appOrigin) {
  const trial = !!site.trialEndsAt;
  return {
    subject: trial ? `${site.title || site.slug} is live — a 72-hour limited engagement.` : `${site.title || site.slug} is live.`,
    ...build("Premiere night", "Your film is live.", [
      `<b>${esc(site.title || site.slug)}</b> just premiered to the world. This is the address to put in your bio, your resume header, your email signature:`,
      `<a href="${site.url}" style="color:${BRAND.navy};font-weight:bold;">${esc(site.url)}</a>`,
      ...(trial ? [
        "This premiere is a <b>limited engagement</b>: it screens for 72 hours, then the film returns to your vault — kept safe, address held for you. Love it? <b>The Director's Cut ($99, one time)</b> keeps it live for good and adds two more AI productions.",
      ] : []),
      "Every visit counts toward your audience stats in the console. New releases premiere in one click, and rollback means a premiere can never go wrong.",
    ], appOrigin ? { url: appOrigin, label: "Open my films" } : null, {
      preheader: trial ? `${site.title || site.slug} is screening for 72 hours at ${site.url}` : `${site.title || site.slug} just premiered at ${site.url}`,
      details: [["Live address", esc(site.url)], ["Status", trial ? "Limited engagement · 72 hours" : "Now showing"]],
    }),
  };
}

// ---------- billing ----------

// fires from the Lemon Squeezy webhook the moment a payment lands: the buyer
// paid the merchant of record, the credit is on their account, the studio door
// is the CTA. No order exists yet — the credit is spent when they send a brief.
export function paymentReceivedEmail(purchase, appOrigin) {
  const ref = esc(String(purchase?.identifier || purchase?.lsOrderId || "").slice(0, 32) || "your order");
  const n = Number(purchase?.credits) > 0 ? Number(purchase.credits) : 1;
  const amount = Number(purchase?.totalUsd) > 0 ? `$${purchase.totalUsd}` : null;
  return {
    subject: n === 1 ? "Payment received. Your production credit is live." : `Payment received. ${n} production credits are live.`,
    ...build("Box office", "The studio has your ticket.", [
      `Your payment is in, and <b>${n} production credit${n === 1 ? "" : "s"}</b> ${n === 1 ? "is" : "are"} now on your account.`,
      "Head to the studio, drop your resume and photos, and the AI director starts filming. A credit is only spent when you send a brief.",
    ], appOrigin ? { url: appOrigin, label: "Enter the studio" } : null, {
      preheader: `${n} production credit${n === 1 ? "" : "s"} on your account.`,
      details: [["Reference", ref], ...(amount ? [["Amount", amount]] : []), ["Credits", String(n)], ["Each includes", "AI production · revision messages · hosting"]],
    }),
  };
}

// ---------- fail-soft senders ----------

// low-level: send a built email to one recipient; never throws into the caller
export async function sendEmail(ctx, to, built) {
  const from = ctx.config?.sesFrom;
  if (!from || !to || !ctx.ses || !built) return { sent: false, reason: "not configured" };
  try {
    await ctx.ses.send(from, to, built.subject, built.html, { text: built.text });
    return { sent: true };
  } catch (e) {
    console.error(JSON.stringify({ level: "warn", msg: "email send failed soft", subject: built.subject, err: e?.message }));
    return { sent: false, reason: e?.message };
  }
}

const ORDER_KINDS = {
  received: orderReceivedEmail,
  premiere: premiereReadyEmail,
  revision: revisionReceivedEmail,
  revision_premiere: revisionPremiereEmail,
  attention: needsAttentionEmail,
};

export async function sendOrderEmail(ctx, kind, order) {
  const builder = ORDER_KINDS[kind];
  if (!builder) return { sent: false, reason: "unknown kind" };
  return sendEmail(ctx, order?.email, builder(order, ctx.config?.appOrigin || ""));
}
