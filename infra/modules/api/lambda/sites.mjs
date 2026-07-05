// sites.mjs — site lifecycle with IMMUTABLE RELEASES (ADR #1).
// Layout:  s3://published/sites/{siteId}/releases/{n}/index.html
// Pointer: CloudFront KVS  slug -> "{siteId}/releases/{n}"   (atomic flip, no invalidation)
// Fallback (if KVS data plane unavailable): copy release -> sites/{slug}/current/ + invalidate.
// DynamoDB: SITE#{id}/META (GSI1 SLUG#{slug} for uniqueness), SITE#{id}/RELEASE#{00n}.
import { ok, bad, json, claimsOf, isAdmin, bodyOf, pathParam, qs, clampStr, uuid, now, slugify } from "./lib.mjs";

const relSK = (n) => `RELEASE#${String(n).padStart(5, "0")}`;

async function ownedSite(ctx, siteId, claims) {
  const site = await ctx.ddb.get({ PK: `SITE#${siteId}`, SK: "META" });
  if (!site) return { err: bad("site not found", 404) };
  if (site.owner !== claims.sub && !isAdmin(claims)) return { err: json(403, { ok: false, error: "not your site" }) };
  return { site };
}

// POST /sites { slug?, title?, orderId? }
export async function createSite(event, ctx) {
  const claims = claimsOf(event);
  const b = bodyOf(event);
  if (!b) return bad("invalid json");
  const siteId = uuid().slice(0, 8);
  const slug = slugify(b.slug || b.title || siteId);
  if (["www", "app", "api", "admin", "mail", "_demo"].includes(slug)) return bad("reserved slug");
  try {
    // slug uniqueness via GSI1 mirror item (conditional put owns the slug)
    await ctx.ddb.put(
      { PK: `SLUG#${slug}`, SK: "CLAIM", type: "slugclaim", siteId, GSI1PK: `SLUG#${slug}`, GSI1SK: "SITE" },
      "attribute_not_exists(PK)"
    );
  } catch (e) {
    if (e?.name === "ConditionalCheckFailedException") return bad("slug taken", 409);
    throw e;
  }
  const site = {
    PK: `SITE#${siteId}`, SK: "META", type: "site", siteId, slug,
    title: clampStr(b.title, 120) || slug, owner: claims.sub, orderId: b.orderId || null,
    status: "draft", releases: 0, liveRelease: null, createdAt: now(), updatedAt: now(),
    GSI1PK: `USER#${claims.sub}`, GSI1SK: `SITE#${now()}`,
  };
  await ctx.ddb.put(site, "attribute_not_exists(PK)");
  return ok({ ok: true, site: pub(site, ctx) });
}

// GET /sites — my sites
export async function listSites(event, ctx) {
  const claims = claimsOf(event);
  const items = await ctx.ddb.query({
    IndexName: "GSI1",
    KeyConditionExpression: "GSI1PK = :p AND begins_with(GSI1SK, :s)",
    ExpressionAttributeValues: { ":p": `USER#${claims.sub}`, ":s": "SITE#" },
    ScanIndexForward: false,
  });
  return ok({ ok: true, sites: items.map((s) => pub(s, ctx)) });
}

// GET /sites/{id}
export async function getSite(event, ctx) {
  const { site, err } = await ownedSite(ctx, pathParam(event, "id"), claimsOf(event));
  if (err) return err;
  const releases = await ctx.ddb.query({
    KeyConditionExpression: "PK = :p AND begins_with(SK, :s)",
    ExpressionAttributeValues: { ":p": site.PK, ":s": "RELEASE#" },
    ScanIndexForward: false,
    Limit: 10,
  });
  return ok({ ok: true, site: pub(site, ctx), releases: releases.map((r) => ({ n: r.n, createdAt: r.createdAt, source: r.source })) });
}

// POST /sites/{id}/publish { html? , orderId? } — html direct, or pull a ready order's cut
export async function publish(event, ctx) {
  const claims = claimsOf(event);
  const { site, err } = await ownedSite(ctx, pathParam(event, "id"), claims);
  if (err) return err;
  const b = bodyOf(event);
  if (!b) return bad("invalid json");

  let html = typeof b.html === "string" ? b.html : null;
  let source = "direct";
  if (!html && b.orderId) {
    const order = await ctx.ddb.get({ PK: `ORDER#${b.orderId}`, SK: "META" });
    if (!order?.cutKey || order.status !== "ready") return bad("order cut not ready", 409);
    html = await ctx.s3.getObjectText(ctx.config.artifactsBucket, order.cutKey);
    source = `order:${b.orderId}`;
  }
  if (!html || !html.trimStart().toLowerCase().startsWith("<!doctype html")) return bad("html document required");
  if (Buffer.byteLength(html, "utf8") > 2 * 1024 * 1024) return bad("bundle too large", 413);

  const n = (site.releases || 0) + 1;
  const releasePrefix = `sites/${site.siteId}/releases/${n}`;
  await ctx.s3.putObject(ctx.config.publishedBucket, `${releasePrefix}/index.html`, html);
  const staged = b.stage === true;
  await ctx.ddb.put({ PK: site.PK, SK: relSK(n), type: "release", n, source, staged, by: claims.sub, createdAt: now() });

  if (staged) {
    // draft workflow: the release exists and is previewable, but the pointer
    // (and therefore the live site) does not move until "go live" (rollback to n).
    await ctx.ddb.update({
      Key: { PK: site.PK, SK: "META" },
      UpdateExpression: "SET releases = :n, stagedRelease = :n, updatedAt = :t",
      ConditionExpression: "releases = :prev",
      ExpressionAttributeValues: { ":n": n, ":t": now(), ":prev": site.releases || 0 },
    }).catch((e) => {
      if (e?.name === "ConditionalCheckFailedException") throw Object.assign(new Error("concurrent publish, retry"), { statusCode: 409 });
      throw e;
    });
    return ok({ ok: true, siteId: site.siteId, release: n, staged: true, previewUrl: stagedUrl(ctx, site.siteId, n) });
  }

  const flip = await flipPointer(ctx, site.slug, `${site.siteId}/releases/${n}`, site.slug);
  // optimistic lock: two concurrent publishes can't both claim release n
  await ctx.ddb.update({
    Key: { PK: site.PK, SK: "META" },
    UpdateExpression: "SET releases = :n, liveRelease = :n, #s = :live, publishedAt = :t, updatedAt = :t, pointerMode = :pm",
    ConditionExpression: "releases = :prev",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":n": n, ":live": "live", ":t": now(), ":pm": flip.mode, ":prev": site.releases || 0 },
  }).catch((e) => {
    if (e?.name === "ConditionalCheckFailedException") throw Object.assign(new Error("concurrent publish, retry"), { statusCode: 409 });
    throw e;
  });

  return ok({ ok: true, siteId: site.siteId, release: n, pointer: flip.mode, url: previewUrl(ctx, site.slug) });
}

// GET /sites/{id}/source?release=n — download a release's HTML (owner/admin)
export async function source(event, ctx) {
  const claims = claimsOf(event);
  const { site, err } = await ownedSite(ctx, pathParam(event, "id"), claims);
  if (err) return err;
  const n = Number(qs(event, "release") || site.liveRelease);
  if (!Number.isInteger(n) || n < 1 || n > (site.releases || 0)) return bad("bad release");
  const html = await ctx.s3.getObjectText(ctx.config.publishedBucket, `sites/${site.siteId}/releases/${n}/index.html`);
  return {
    statusCode: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="${site.slug}-release-${n}.html"`,
      "cache-control": "no-store",
    },
    body: html,
  };
}

// POST /sites/{id}/rollback { to? } — flip the pointer to any retained release.
// Default: previous release. Also RELIGHTS a taken-down site (pointer restored,
// status back to live) — publish/unpublish/republish is a full cycle.
export async function rollback(event, ctx) {
  const claims = claimsOf(event);
  const { site, err } = await ownedSite(ctx, pathParam(event, "id"), claims);
  if (err) return err;
  if (!site.liveRelease && !site.stagedRelease) return bad("nothing has premiered yet", 409);
  const b = bodyOf(event) || {};
  const target = Number(b.to || (site.status === "taken_down" ? site.liveRelease
    : site.liveRelease ? site.liveRelease - 1 : site.stagedRelease)); // first go-live of a staged-only site
  const relight = site.status === "taken_down" && target === site.liveRelease;
  if (!Number.isInteger(target) || target < 1 || target > site.releases || (target === site.liveRelease && !relight)) {
    return bad("bad target release");
  }
  const rel = await ctx.ddb.get({ PK: site.PK, SK: relSK(target) });
  if (!rel) return bad("release not found", 404);

  const flip = await flipPointer(ctx, site.slug, `${site.siteId}/releases/${target}`, site.slug);
  const clearStage = site.stagedRelease === target;
  await ctx.ddb.update({
    Key: { PK: site.PK, SK: "META" },
    UpdateExpression: `SET liveRelease = :n, updatedAt = :t, pointerMode = :pm, #s = :live${clearStage ? ", stagedRelease = :null" : ""}`,
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":n": target, ":t": now(), ":pm": flip.mode, ":live": "live", ...(clearStage ? { ":null": null } : {}) },
  });
  return ok({ ok: true, siteId: site.siteId, liveRelease: target, pointer: flip.mode, status: "live" });
}

// DELETE /sites/{id} — takedown (pointer removal; releases stay for audit/restore)
export async function takedown(event, ctx) {
  const claims = claimsOf(event);
  const { site, err } = await ownedSite(ctx, pathParam(event, "id"), claims);
  if (err) return err;
  try { await ctx.kvs.del(ctx.config.kvsArn, site.slug); } catch { /* fallback mode or never flipped */ }
  await ctx.ddb.update({
    Key: { PK: site.PK, SK: "META" },
    UpdateExpression: "SET #s = :s, updatedAt = :t",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":s": "taken_down", ":t": now() },
  });
  return ok({ ok: true, siteId: site.siteId, status: "taken_down" });
}

// Pointer flip: KVS first (atomic, zero invalidation). If the KVS data plane is
// unavailable in this runtime, degrade to S3 copy + targeted invalidation.
async function flipPointer(ctx, slug, releasePath, fallbackSlugPrefix) {
  try {
    await ctx.kvs.put(ctx.config.kvsArn, slug, releasePath);
    return { mode: "kvs" };
  } catch {
    // Router's KVS-miss fallback serves /sites/{slug}/... directly, so copy the
    // release to the slug root (releases stay immutable; this is just the pointer).
    const from = `sites/${releasePath}/index.html`;
    const to = `sites/${fallbackSlugPrefix}/index.html`;
    await ctx.s3.copyObject(ctx.config.publishedBucket, from, to);
    try { await ctx.cdn.invalidate(ctx.config.distributionId, [`/sites/${fallbackSlugPrefix}/*`]); } catch { /* dev tolerable */ }
    return { mode: "s3copy" };
  }
}

const previewUrl = (ctx, slug) => `https://${ctx.config.cdnDomain}/_preview/${slug}/`;
const stagedUrl = (ctx, siteId, n) => `https://${ctx.config.cdnDomain}/_r/${siteId}/${n}/`;

const pub = (s, ctx) => ({
  siteId: s.siteId, slug: s.slug, title: s.title, status: s.status,
  releases: s.releases, liveRelease: s.liveRelease, stagedRelease: s.stagedRelease ?? null,
  audienceOf: s.audienceOf || null, pointerMode: s.pointerMode,
  createdAt: s.createdAt, publishedAt: s.publishedAt,
  previewUrl: previewUrl(ctx, s.slug),
  ...(s.stagedRelease ? { stagedUrl: stagedUrl(ctx, s.siteId, s.stagedRelease) } : {}),
});

// POST /sites/{id}/duplicate { slug?, title? } — audience versions: same film,
// a different cut for a different crowd (UX cut, frontend cut, consulting cut…).
// Copies the LIVE release into a brand-new site and premieres it.
export async function duplicate(event, ctx) {
  const claims = claimsOf(event);
  const { site, err } = await ownedSite(ctx, pathParam(event, "id"), claims);
  if (err) return err;
  if (!site.liveRelease) return bad("premiere the original first", 409);
  const b = bodyOf(event) || {};
  const newId = uuid().slice(0, 8);
  const slug = slugify(b.slug || `${site.slug}-cut`);
  if (["www", "app", "api", "admin", "mail", "_demo"].includes(slug)) return bad("reserved slug");
  try {
    await ctx.ddb.put(
      { PK: `SLUG#${slug}`, SK: "CLAIM", type: "slugclaim", siteId: newId, GSI1PK: `SLUG#${slug}`, GSI1SK: "SITE" },
      "attribute_not_exists(PK)"
    );
  } catch (e) {
    if (e?.name === "ConditionalCheckFailedException") return bad("slug taken", 409);
    throw e;
  }
  await ctx.s3.copyObject(
    ctx.config.publishedBucket,
    `sites/${site.siteId}/releases/${site.liveRelease}/index.html`,
    `sites/${newId}/releases/1/index.html`
  );
  await ctx.ddb.put({ PK: `SITE#${newId}`, SK: relSK(1), type: "release", n: 1, source: `duplicate:${site.siteId}`, by: claims.sub, createdAt: now() });
  const flip = await flipPointer(ctx, slug, `${newId}/releases/1`, slug);
  const newSite = {
    PK: `SITE#${newId}`, SK: "META", type: "site", siteId: newId, slug,
    title: clampStr(b.title, 120) || `${site.title} — Cut`, owner: claims.sub,
    audienceOf: site.siteId, status: "live", releases: 1, liveRelease: 1,
    pointerMode: flip.mode, createdAt: now(), publishedAt: now(), updatedAt: now(),
    GSI1PK: `USER#${claims.sub}`, GSI1SK: `SITE#${now()}`,
  };
  await ctx.ddb.put(newSite, "attribute_not_exists(PK)");
  return ok({ ok: true, site: pub(newSite, ctx) });
}
