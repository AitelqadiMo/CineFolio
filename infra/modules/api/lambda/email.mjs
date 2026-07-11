// email.mjs — THE template library for every CineFolio email. One brand shell,
// one builder per email, each returning { subject, html, text }. Builders are
// PURE (no ctx, no imports): the pipeline lambda bundles this exact file via
// its terraform archive, so api and pipeline can never drift apart again.
// Doctrine: inline code templates only (versioned, testable against fakes),
// fail-soft sends (mail never breaks a money flow), plaintext part always.

const BRAND = {
  navy: "#0E1C3F", red: "#C8102E", gold: "#D9A441", bone: "#F4EFE6", green: "#0E9E62",
};

export const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function shell(kicker, title, lines, cta) {
  const rows = lines.map((l) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#33415f">${l}</p>`).join("");
  const button = cta
    ? `<a href="${cta.url}" style="display:inline-block;margin-top:6px;background:${BRAND.red};color:#ffffff;text-decoration:none;font-size:13px;letter-spacing:.08em;text-transform:uppercase;padding:13px 22px;border-radius:7px">${cta.label}</a>`
    : "";
  return `<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;background:${BRAND.bone}">
<div style="max-width:560px;margin:0 auto;padding:28px 16px">
  <div style="height:4px;border-radius:2px;background:linear-gradient(90deg,${BRAND.red},${BRAND.gold},${BRAND.green})"></div>
  <div style="background:#ffffff;border:1px solid rgba(14,28,63,.12);border-radius:14px;padding:30px 32px;margin-top:14px;font-family:Arial,Helvetica,sans-serif">
    <div style="font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:${BRAND.gold};margin-bottom:10px">${kicker}</div>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.2;color:${BRAND.navy};text-transform:uppercase">${title}</h1>
    ${rows}
    ${button}
  </div>
  <p style="text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#8a90a3;margin-top:16px">CineFolio Studios · Your career, filmed.</p>
</div>
</body></html>`;
}

// plaintext part: same lines, tags stripped, our five entities decoded.
// Multipart with a text alternative scores better with every major filter.
function textOf(title, lines, cta) {
  const strip = (s) => String(s).replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  return [
    strip(title).toUpperCase(),
    "",
    ...lines.map(strip),
    ...(cta ? ["", `${strip(cta.label)}: ${cta.url}`] : []),
    "",
    "CineFolio Studios · Your career, filmed.",
  ].join("\n");
}

function build(kicker, title, lines, cta) {
  return { html: shell(kicker, title, lines, cta), text: textOf(title, lines, cta) };
}

const shortId = (orderId) => String(orderId || "").slice(0, 8).toUpperCase();
// the Lounge is the order's home in the console; fall back to the console root
const loungeUrl = (appOrigin, orderId) => (appOrigin ? `${appOrigin}/order/${orderId}` : "");

// ---------- order lifecycle ----------

export function orderReceivedEmail(order, appOrigin) {
  const id = shortId(order.orderId);
  const cta = appOrigin ? { url: loungeUrl(appOrigin, order.orderId), label: "Watch it happen" } : null;
  return {
    subject: `Order ${id} received. Cameras are getting ready.`,
    ...build("Order received", "The studio has your brief.", [
      `Order <b>${id}</b>${order.name ? ` for <b>${esc(order.name)}</b>` : ""} is in the production queue.`,
      "Your Director's Cut is usually delivered within the hour, and this inbox hears the moment it lands.",
      "Three director's notes ride on every order, so changes are part of the deal.",
    ], cta),
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
    ], cta),
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
    ], cta),
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
    ], cta),
  };
}

// honest delay note for human_review: the 25-minute promise broke, a person
// is on it, nothing is needed from the client. No fake ETA, no jargon.
export function needsAttentionEmail(order, appOrigin) {
  const id = shortId(order.orderId);
  const cta = appOrigin ? { url: loungeUrl(appOrigin, order.orderId), label: "Check your order" } : null;
  return {
    subject: `Order ${id}: the studio needs a moment.`,
    ...build("Production note", "Your film hit a snag.", [
      `Order <b>${id}</b> is taking longer than it should, so a human at the studio is now looking at it personally.`,
      "Nothing is needed from you. You will hear from us here the moment your cut is ready, and if we cannot deliver, you will not pay a thing.",
    ], cta),
  };
}

// ---------- site lifecycle ----------

// the share kit: fires once, on a film's FIRST premiere (engine builds and
// AI cuts alike). The live URL is the hero; the console is the follow-up.
export function firstPremiereEmail(site, appOrigin) {
  return {
    subject: `${site.title || site.slug} is live.`,
    ...build("Premiere night", "Your film is live.", [
      `<b>${esc(site.title || site.slug)}</b> just premiered to the world at <a href="${site.url}" style="color:${BRAND.navy}">${esc(site.url)}</a>.`,
      "Put it in your bio, your resume header, your email signature. Every visit counts toward your audience stats in the console.",
      "New releases premiere in one click, and rollback means a premiere can never go wrong.",
    ], appOrigin ? { url: appOrigin, label: "Open my films" } : null),
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
