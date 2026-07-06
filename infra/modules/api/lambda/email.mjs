// email.mjs: transactional email for the money moments. Tolerant by design:
// when the sender identity is not configured (SES_FROM empty) or SES is still
// sandboxed, sends fail soft and are logged; the order flow never breaks on mail.
// Templates are inline, jersey-branded, and deliberately plain (inbox-safe).

const BRAND = {
  navy: "#0E1C3F", red: "#C8102E", gold: "#D9A441", bone: "#F4EFE6", green: "#0E9E62",
};

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

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function orderReceivedEmail(order, appOrigin) {
  const id = String(order.orderId || "").slice(0, 8).toUpperCase();
  return {
    subject: `Order ${id} received. Cameras are getting ready.`,
    html: shell("Order received", "The studio has your brief.", [
      `Order <b>${id}</b>${order.name ? ` for <b>${esc(order.name)}</b>` : ""} is in the production queue.`,
      "Your Director's Cut premieres as a new release in My Films within 24 hours, and this inbox hears the moment it lands.",
      "One revision is included whenever you want changes.",
    ], appOrigin ? { url: appOrigin, label: "Track it in the studio" } : null),
  };
}

export function premiereReadyEmail(order, appOrigin) {
  const id = String(order.orderId || "").slice(0, 8).toUpperCase();
  return {
    subject: "Your Director's Cut is ready.",
    html: shell("Premiere", "Your film is in.", [
      `Order <b>${id}</b> premiered as a new release on your film.`,
      "Open My Films to watch it live, share it, or request the included revision.",
    ], appOrigin ? { url: appOrigin, label: "Watch your film" } : null),
  };
}

export function revisionReceivedEmail(order, appOrigin) {
  const id = String(order.orderId || "").slice(0, 8).toUpperCase();
  return {
    subject: `Revision for order ${id} is in production.`,
    html: shell("Revision", "The crew is on it.", [
      `Your revision notes for order <b>${id}</b> reached the studio and the cameras are rolling again.`,
      "The revised cut premieres as a new release, and you will hear from us here when it does.",
    ], appOrigin ? { url: appOrigin, label: "Track it in the studio" } : null),
  };
}

// fire-soft sender: never throws into the caller's flow
export async function sendOrderEmail(ctx, kind, order) {
  const from = ctx.config?.sesFrom;
  const to = order?.email;
  if (!from || !to || !ctx.ses) return { sent: false, reason: "not configured" };
  const build = { received: orderReceivedEmail, premiere: premiereReadyEmail, revision: revisionReceivedEmail }[kind];
  if (!build) return { sent: false, reason: "unknown kind" };
  try {
    const { subject, html } = build(order, ctx.config.appOrigin || "");
    await ctx.ses.send(from, to, subject, html);
    return { sent: true };
  } catch (e) {
    console.error(JSON.stringify({ level: "warn", msg: "email send failed soft", kind, err: e?.message }));
    return { sent: false, reason: e?.message };
  }
}
