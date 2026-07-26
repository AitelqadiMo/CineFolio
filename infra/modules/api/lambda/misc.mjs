// misc.mjs — profile, waitlist, contact, hits, admin. All handlers take (event, ctx).
import { ok, bad, json, claimsOf, isAdmin, bodyOf, isEmail, clampStr, now, today, uuid, qs, NEW_FREE_CUTS, entitlementOf } from "./lib.mjs";
import { foundingSeatsLeft } from "./billing.mjs";
import { expireTrialIfDue } from "./sites.mjs";

// GET /me — lazy-upsert the profile on first authenticated call (no Cognito trigger needed)
export async function getMe(event, ctx) {
  const claims = claimsOf(event);
  const PK = `USER#${claims.sub}`;
  let item = await ctx.ddb.get({ PK, SK: "PROFILE" });
  if (!item) {
    item = {
      PK, SK: "PROFILE", type: "user",
      email: claims.email || null, name: claims.name || null,
      plan: "free", freeCutsLimit: NEW_FREE_CUTS, createdAt: now(),
    };
    try {
      await ctx.ddb.put(item, "attribute_not_exists(PK)");
    } catch { item = await ctx.ddb.get({ PK, SK: "PROFILE" }); } // lost the race, read winner
  }
  // the real founding-seat count rides the entitlement so the console can show
  // honest scarcity where a user decides to pay. One O(1) GetItem per request,
  // and fail-soft: a counter hiccup degrades the seat count to null (unknown)
  // rather than breaking sign-in, since /me is the gate to the whole console.
  const seatsLeft = await foundingSeatsLeft(ctx).catch(() => null);
  return ok({ ok: true, user: { sub: claims.sub, admin: isAdmin(claims), ...pub(item, seatsLeft) } });
}

// PUT /me { name?, company?, links? }
export async function putMe(event, ctx) {
  const claims = claimsOf(event);
  const b = bodyOf(event);
  if (!b) return bad("invalid json");
  const sets = [];
  const vals = {};
  if (b.name !== undefined) { sets.push("#n = :n"); vals[":n"] = clampStr(b.name, 80); }
  if (b.company !== undefined) { sets.push("company = :c"); vals[":c"] = clampStr(b.company, 120); }
  if (b.links !== undefined) { sets.push("links = :l"); vals[":l"] = clampStr(b.links, 500); }
  if (!sets.length) return bad("nothing to update");
  const item = await ctx.ddb.update({
    Key: { PK: `USER#${claims.sub}`, SK: "PROFILE" },
    UpdateExpression: `SET ${sets.join(", ")}, updatedAt = :u`,
    ExpressionAttributeNames: sets.some((s) => s.startsWith("#n")) ? { "#n": "name" } : undefined,
    ExpressionAttributeValues: { ...vals, ":u": now() },
    ReturnValues: "ALL_NEW",
  });
  return ok({ ok: true, user: pub(item) });
}

// identity fields + the shared entitlement snapshot (lib.mjs entitlementOf):
// plan, cut counters, paid credits, premiere slots — one shape everywhere.
// foundingSeatsLeft is a GLOBAL fact the pure snapshot cannot read on its own,
// so a caller that has read the real counter passes it through here; a caller
// that has not (PUT /me) passes nothing and the snapshot holds the founding
// price open rather than fabricating a seat number.
const pub = (i, foundingSeatsLeft = null) => ({
  email: i.email, name: i.name, company: i.company, links: i.links, createdAt: i.createdAt,
  ...entitlementOf(i, foundingSeatsLeft),
});

// POST /waitlist { email } — idempotent (conditional put) + O(1) counter
export async function joinWaitlist(event, ctx) {
  const b = bodyOf(event);
  if (!b) return bad("invalid json");
  if (b.company) return ok({ ok: true, joined: true }); // honeypot: pretend success
  const email = String(b.email || "").trim().toLowerCase();
  if (!isEmail(email)) return bad("valid email required");
  try {
    await ctx.ddb.put(
      { PK: `WAITLIST#${email}`, SK: "ENTRY", type: "waitlist", email, GSI1PK: "WAITLIST", GSI1SK: now(), createdAt: now() },
      "attribute_not_exists(PK)"
    );
    await ctx.ddb.update({
      Key: { PK: "COUNTER", SK: "WAITLIST" },
      UpdateExpression: "ADD #c :one",
      ExpressionAttributeNames: { "#c": "count" },
      ExpressionAttributeValues: { ":one": 1 },
    });
    return ok({ ok: true, joined: true });
  } catch (e) {
    if (e?.name === "ConditionalCheckFailedException") return ok({ ok: true, joined: true, already: true });
    throw e;
  }
}

// GET /waitlist/count
export async function waitlistCount(_event, ctx) {
  const item = await ctx.ddb.get({ PK: "COUNTER", SK: "WAITLIST" });
  return ok({ ok: true, count: item?.count || 0 });
}

// POST /contact { name, email, message }
// The note is stored first (DynamoDB is the system of record), then forwarded
// to the studio inbox via SES, best effort: a mail hiccup must never bounce
// the visitor. Reply-To carries the visitor so a plain reply reaches them.
const escHtml = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export async function contact(event, ctx) {
  const b = bodyOf(event);
  if (!b) return bad("invalid json");
  if (b.company) return ok({ ok: true }); // honeypot
  const email = String(b.email || "").trim().toLowerCase();
  const message = clampStr(b.message, 4000).trim();
  if (!isEmail(email) || message.length < 3) return bad("email and message required");
  const id = uuid();
  const name = clampStr(b.name, 120);
  await ctx.ddb.put({
    PK: `CONTACT#${id}`, SK: "MSG", type: "contact",
    GSI1PK: "CONTACT", GSI1SK: now(),
    name, email, message, createdAt: now(),
  });
  let mailed = false;
  const inbox = ctx.config.sesFrom; // studio inbox is the verified identity itself
  if (inbox) {
    try {
      await ctx.ses.send(
        inbox, inbox,
        `CineFolio note from ${name || email}`,
        `<div style="font-family:sans-serif;max-width:560px">
          <p style="font-size:11px;letter-spacing:.2em;color:#888;text-transform:uppercase">CineFolio · Contact form</p>
          <p><b>From:</b> ${escHtml(name ? `${name} ` : "")}&lt;${escHtml(email)}&gt;</p>
          <p style="white-space:pre-wrap;border-left:3px solid #C8102E;padding-left:12px">${escHtml(message)}</p>
          <p style="font-size:11px;color:#888">Ref ${id} · reply to this email to answer the visitor directly.</p>
        </div>`,
        { replyTo: email }
      );
      mailed = true;
    } catch (e) {
      console.error("contact mail failed", id, e?.name || e); // stored regardless
    }
  }
  return ok({ ok: true, id, mailed });
}

// POST /hit { page } — daily per-page atomic counters
export async function hit(event, ctx) {
  const b = bodyOf(event) || {};
  const page = clampStr(b.page || "home", 40).replace(/[^a-z0-9_/-]/gi, "") || "home";
  await ctx.ddb.update({
    Key: { PK: `HIT#${today()}`, SK: page },
    UpdateExpression: "ADD #c :one SET GSI1PK = :g, GSI1SK = :s",
    ExpressionAttributeNames: { "#c": "count" },
    ExpressionAttributeValues: { ":one": 1, ":g": "HIT", ":s": `${today()}#${page}` },
  });
  // a site view doubles as the limited-engagement check: an expired trial
  // darkens on the first look past its end time. Fail-soft, after the count —
  // expiry can never break the beacon.
  if (page.startsWith("s/")) {
    try {
      const claim = await ctx.ddb.get({ PK: `SLUG#${page.slice(2)}`, SK: "CLAIM" });
      if (claim?.siteId) {
        const site = await ctx.ddb.get({ PK: `SITE#${claim.siteId}`, SK: "META" });
        await expireTrialIfDue(ctx, site);
      }
    } catch { /* the count already landed; expiry rides the next view */ }
  }
  return ok({ ok: true });
}

// GET /draft + PUT /draft — the Studio brief follows the user across devices.
// One item per user; the client strips bulky inline images before sending.
export async function getDraft(event, ctx) {
  const claims = claimsOf(event);
  const item = await ctx.ddb.get({ PK: `USER#${claims.sub}`, SK: "DRAFT" });
  return ok({ ok: true, draft: item?.data || null, updatedAt: item?.updatedAt || null });
}

export async function putDraft(event, ctx) {
  const claims = claimsOf(event);
  if (!event.body || Buffer.byteLength(event.body, "utf8") > 300 * 1024) return bad("draft too large", 413);
  const b = bodyOf(event);
  if (!b || typeof b.draft !== "object") return bad("invalid draft");
  await ctx.ddb.put({ PK: `USER#${claims.sub}`, SK: "DRAFT", type: "draft", data: b.draft, updatedAt: now() });
  return ok({ ok: true, updatedAt: now() });
}

// GET /profile + PUT /profile: the client's portfolio dossier, the single
// source every film is cast from. One item per user, size-capped like drafts.
export async function getProfile(event, ctx) {
  const claims = claimsOf(event);
  const item = await ctx.ddb.get({ PK: `USER#${claims.sub}`, SK: "PORTFOLIO" });
  return ok({ ok: true, profile: item?.data || null, updatedAt: item?.updatedAt || null });
}

export async function putProfile(event, ctx) {
  const claims = claimsOf(event);
  if (!event.body || Buffer.byteLength(event.body, "utf8") > 200 * 1024) return bad("profile too large", 413);
  const b = bodyOf(event);
  if (!b || typeof b.profile !== "object" || b.profile === null) return bad("invalid profile");
  await ctx.ddb.put({ PK: `USER#${claims.sub}`, SK: "PORTFOLIO", type: "portfolio", data: b.profile, updatedAt: now() });
  return ok({ ok: true, updatedAt: now() });
}

// DELETE /account — real erasure, the thing the old "Delete my account" button
// only pretended to do (it opened a support email). GDPR/CCPA erasure is a hard
// requirement once we take money from strangers. This purges everything keyed
// to the user, in an order that is safe to re-run (a retry after a partial
// failure finishes the job rather than erroring):
//   1. every site the user owns: dark the edge pointer, drop every release's S3
//      objects, the release rows, the slug claim, and the META row;
//   2. the user's media objects under media/{sub}/;
//   3. their orders (GSI1 USER#{sub} / ORDER#);
//   4. the identity records: PROFILE, DRAFT, PORTFOLIO;
//   5. the Cognito auth identity (fail-soft: the account is already dataless, so
//      an AdminDeleteUser hiccup must not fail the erasure the user asked for).
// PURCHASE rows are intentionally retained: they are financial/tax records with
// a legitimate retention basis, they carry no dossier or site content, and they
// have no per-user index to query. The response reports authDeleted so an
// operator can see whether the Cognito side completed.
//
// Guardrail: the caller must echo their own email in the body, so a stray
// DELETE can never erase an account without the user typing their address.
const relSKForDelete = (n) => `RELEASE#${String(n).padStart(5, "0")}`;
export async function deleteAccount(event, ctx) {
  const claims = claimsOf(event) || {};
  const sub = claims.sub;
  if (!sub) return bad("no account on this session", 401);
  const b = bodyOf(event) || {};
  const typed = String(b.confirm || "").trim().toLowerCase();
  if (!claims.email || typed !== String(claims.email).toLowerCase()) {
    return bad("type your account email exactly to confirm deletion", 400);
  }

  let sitesPurged = 0, ordersPurged = 0, mediaPurged = 0;

  // 1) sites: owned via GSI1 USER#{sub} / SITE#
  const sites = await ctx.ddb.query({
    IndexName: "GSI1",
    KeyConditionExpression: "GSI1PK = :p AND begins_with(GSI1SK, :s)",
    ExpressionAttributeValues: { ":p": `USER#${sub}`, ":s": "SITE#" },
  });
  for (const site of sites) {
    const releases = await ctx.ddb.query({
      KeyConditionExpression: "PK = :p AND begins_with(SK, :s)",
      ExpressionAttributeValues: { ":p": site.PK, ":s": "RELEASE#" },
    });
    for (const rel of releases) {
      const paths = rel.filePaths?.length ? rel.filePaths : ["index.html"];
      await Promise.all(paths.map((p) =>
        ctx.s3.deleteObject(ctx.config.publishedBucket, `sites/${site.siteId}/releases/${rel.n}/${p}`).catch(() => {})
      ));
      await ctx.ddb.del({ PK: site.PK, SK: relSKForDelete(rel.n) });
    }
    if (site.slug) {
      try { await ctx.kvs.del(ctx.config.kvsArn, site.slug); } catch { /* already dark */ }
      await ctx.ddb.del({ PK: `SLUG#${site.slug}`, SK: "CLAIM" }).catch(() => {});
    }
    await ctx.ddb.del({ PK: site.PK, SK: "META" });
    sitesPurged++;
  }

  // 2) media objects for this user (best-effort; listPrefix + delete)
  try {
    const objs = await ctx.s3.listPrefix(ctx.config.publishedBucket, `media/${sub}/`);
    await Promise.all(objs.map((o) => ctx.s3.deleteObject(ctx.config.publishedBucket, o.key).catch(() => {})));
    mediaPurged = objs.length;
  } catch { /* listing unavailable: leave media, everything else still purges */ }

  // 3) orders (GSI1 USER#{sub} / ORDER#)
  const orders = await ctx.ddb.query({
    IndexName: "GSI1",
    KeyConditionExpression: "GSI1PK = :p AND begins_with(GSI1SK, :s)",
    ExpressionAttributeValues: { ":p": `USER#${sub}`, ":s": "ORDER#" },
  });
  for (const o of orders) {
    if (o.PK && o.SK) { await ctx.ddb.del({ PK: o.PK, SK: o.SK }); ordersPurged++; }
  }

  // 4) identity records
  for (const sk of ["PROFILE", "DRAFT", "PORTFOLIO"]) {
    await ctx.ddb.del({ PK: `USER#${sub}`, SK: sk }).catch(() => {});
  }

  // 5) Cognito identity, fail-soft (the account is already dataless)
  let authDeleted = false;
  try {
    if (ctx.cognitoAdmin && ctx.config.userPoolId) {
      await ctx.cognitoAdmin.deleteUser(ctx.config.userPoolId, claims.email);
      authDeleted = true;
    }
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "cognito delete failed (data already purged)", sub, err: e?.message }));
  }

  return ok({ ok: true, deleted: true, sitesPurged, ordersPurged, mediaPurged, authDeleted });
}

// POST /media { contentType, ext? } — presigned upload for project covers /
// headshots. Media lives in the PUBLISHED bucket under media/{sub}/ and is
// served through the sites CDN (router passes /media/* straight through).
export async function mediaUpload(event, ctx) {
  const claims = claimsOf(event);
  const b = bodyOf(event);
  if (!b) return bad("invalid json");
  const ct = String(b.contentType || "");
  const extMap = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  if (!extMap[ct]) return bad("images only (jpeg, png, webp, gif)");
  const key = `media/${claims.sub}/${uuid()}.${extMap[ct]}`;
  const uploadUrl = await ctx.presign.put(ctx.config.publishedBucket, key, ct);
  return ok({ ok: true, uploadUrl, publicUrl: `https://${ctx.config.cdnDomain}/${key}`, key, maxBytes: 4 * 1024 * 1024 });
}

// POST /media/direct { contentType, dataBase64 } — the belt to the presign's
// suspenders. When the browser's direct-to-S3 PUT is blocked (CORS, proxy,
// extension), the client ships the image THROUGH the API instead, and the
// Lambda writes it to the same media prefix. 6MB decoded cap (gateway limit).
export async function mediaDirect(event, ctx) {
  const claims = claimsOf(event);
  const b = bodyOf(event);
  if (!b) return bad("invalid json");
  const ct = String(b.contentType || "");
  const extMap = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  if (!extMap[ct]) return bad("images only (jpeg, png, webp, gif)");
  const data = String(b.dataBase64 || "");
  if (!data || !/^[A-Za-z0-9+/=\r\n]+$/.test(data)) return bad("dataBase64 required");
  const bytes = Buffer.from(data, "base64");
  if (!bytes.length) return bad("empty image");
  if (bytes.length > 6 * 1024 * 1024) return bad("image too large (6MB max)", 413);
  const key = `media/${claims.sub}/${uuid()}.${extMap[ct]}`;
  await ctx.s3.putObject(ctx.config.publishedBucket, key, bytes, ct);
  return ok({ ok: true, publicUrl: `https://${ctx.config.cdnDomain}/${key}`, key, bytes: bytes.length });
}

// GET /admin/orders?status=queued — admin-only order queue (GSI2)
export async function adminOrders(event, ctx) {
  const claims = claimsOf(event);
  if (!isAdmin(claims)) return json(403, { ok: false, error: "admin only" });
  const status = clampStr(qs(event, "status") || "queued", 24);
  const items = await ctx.ddb.query({
    IndexName: "GSI2",
    KeyConditionExpression: "GSI2PK = :p",
    ExpressionAttributeValues: { ":p": `STATUS#${status}` },
    ScanIndexForward: false,
    Limit: 50,
  });
  return ok({ ok: true, status, orders: items.map((o) => ({ orderId: o.orderId, email: o.email, name: o.name, role: o.role, status: o.status, createdAt: o.createdAt, updatedAt: o.updatedAt })) });
}
