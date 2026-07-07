// sites.mjs — site lifecycle with IMMUTABLE RELEASES (ADR #1).
// Layout:  s3://published/sites/{siteId}/releases/{n}/index.html
// Pointer: CloudFront KVS  slug -> "{siteId}/releases/{n}"   (atomic flip, no invalidation)
// Fallback (if KVS data plane unavailable): copy release -> sites/{slug}/current/ + invalidate.
// DynamoDB: SITE#{id}/META (GSI1 SLUG#{slug} for uniqueness), SITE#{id}/RELEASE#{00n}.
import { ok, bad, json, claimsOf, isAdmin, bodyOf, pathParam, qs, clampStr, uuid, now, slugify, validateBundle, isPagePath, assetTypeOf } from "./lib.mjs";

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/;

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
  return ok({ ok: true, site: pub(site, ctx), releases: releases.map((r) => ({ n: r.n, createdAt: r.createdAt, source: r.source, files: r.filePaths?.length || 1 })) });
}

// POST /sites/{id}/publish { html? , orderId? } — html direct, or pull a ready order's cut
export async function publish(event, ctx) {
  const claims = claimsOf(event);
  const { site, err } = await ownedSite(ctx, pathParam(event, "id"), claims);
  if (err) return err;
  const b = bodyOf(event);
  if (!b) return bad("invalid json");

  // a release is a BUNDLE now: [{ path, html }]; a bare html string stays valid
  let files = Array.isArray(b.files) && b.files.length ? b.files
    : typeof b.html === "string" && b.html ? [{ path: "index.html", html: b.html }] : null;
  let source = "direct";
  let assetCopies = null; // assets from an order copy byte-for-byte, never through text
  if (!files && b.orderId) {
    const order = await ctx.ddb.get({ PK: `ORDER#${b.orderId}`, SK: "META" });
    if (order?.status !== "ready" || (!order.cutKey && !Array.isArray(order.cutFiles))) return bad("order cut not ready", 409);
    const paths = Array.isArray(order.cutFiles) && order.cutFiles.length ? order.cutFiles : ["index.html"];
    const pagePaths = paths.filter((p) => isPagePath(p));
    assetCopies = paths.filter((p) => !isPagePath(p));
    files = await Promise.all(pagePaths.map(async (p) => ({ path: p, html: await ctx.s3.getObjectText(ctx.config.artifactsBucket, `orders/${b.orderId}/cut/${p}`) })));
    source = `order:${b.orderId}`;
  }
  const pages = files.filter((f) => isPagePath(f.path));
  if (!pages.length || !pages.some((f) => f.path === "index.html")) return bad("bundle must include index.html");
  const problem = validateBundle(pages, { maxTotal: 5 * 1024 * 1024 });
  if (problem) return bad(problem, problem.includes("large") ? 413 : 400);
  const beaconBase = apiBaseOf(event, ctx);
  files = pages.map((f) => ({ path: f.path, html: withBeacon(f.html, beaconBase, site.slug) })); // every page carries the audience beacon

  const n = (site.releases || 0) + 1;
  const releasePrefix = `sites/${site.siteId}/releases/${n}`;
  await Promise.all(files.map((f) => ctx.s3.putObject(ctx.config.publishedBucket, `${releasePrefix}/${f.path}`, f.html)));
  if (assetCopies?.length) {
    // images/fonts/video from the cut: byte-for-byte cross-bucket copy, never through text
    await Promise.all(assetCopies.map((p) => ctx.s3.copyObjectAcross
      ? ctx.s3.copyObjectAcross(ctx.config.artifactsBucket, `orders/${b.orderId}/cut/${p}`, ctx.config.publishedBucket, `${releasePrefix}/${p}`)
      : ctx.s3.getObjectBytes(ctx.config.artifactsBucket, `orders/${b.orderId}/cut/${p}`)
        .then((bytes) => ctx.s3.putObject(ctx.config.publishedBucket, `${releasePrefix}/${p}`, bytes, assetTypeOf(p)))));
  }
  const staged = b.stage === true;
  const allPaths = [...files.map((f) => f.path), ...(assetCopies || [])];
  await ctx.ddb.put({ PK: site.PK, SK: relSK(n), type: "release", n, source, staged, by: claims.sub, createdAt: now(), filePaths: allPaths });
  if (b.orderId) {
    // the order remembers its film: every future revision premieres HERE,
    // never as a second portfolio from scratch
    await ctx.ddb.update({
      Key: { PK: `ORDER#${b.orderId}`, SK: "META" },
      UpdateExpression: "SET siteId = :sid, premieredAt = :t, updatedAt = :t",
      ExpressionAttributeValues: { ":sid": site.siteId, ":t": now() },
      ConditionExpression: "attribute_exists(PK)",
    }).catch(() => { /* order row gone: the release still stands */ });
  }

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
  // optimistic lock: two concurrent publishes can't both claim release n.
  // A cut premiered onto an existing film marks it AI-born (orderId sticks).
  await ctx.ddb.update({
    Key: { PK: site.PK, SK: "META" },
    UpdateExpression: `SET releases = :n, liveRelease = :n, #s = :live, publishedAt = :t, updatedAt = :t, pointerMode = :pm${b.orderId ? ", orderId = :oid" : ""}`,
    ConditionExpression: "releases = :prev",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":n": n, ":live": "live", ":t": now(), ":pm": flip.mode, ":prev": site.releases || 0, ...(b.orderId ? { ":oid": b.orderId } : {}) },
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
  const reqPath = qs(event, "path") || "index.html";
  if (!/^(?:[a-z0-9_-]+\/)?[a-z0-9_-]+\.html$/.test(reqPath)) return bad("bad path");
  const html = await ctx.s3.getObjectText(ctx.config.publishedBucket, `sites/${site.siteId}/releases/${n}/${reqPath}`);
  return {
    statusCode: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="${site.slug}-release-${n}-${reqPath.replace("/", "-")}"`,
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

// DELETE /sites/{id} — takedown. The site must go DARK everywhere a viewer
// could reach it: the KVS pointer, the s3copy fallback objects the router
// serves on a KVS miss, and the CDN cache. Releases stay immutable in their
// prefixes for audit/relight; only the public pointers burn.
export async function takedown(event, ctx) {
  const claims = claimsOf(event);
  const { site, err } = await ownedSite(ctx, pathParam(event, "id"), claims);
  if (err) return err;
  try { await ctx.kvs.del(ctx.config.kvsArn, site.slug); } catch { /* fallback mode or never flipped */ }
  // purge the fallback pointer copies (sites/{slug}/...) so the router's
  // KVS-miss path has nothing to serve
  const releases = await ctx.ddb.query({
    KeyConditionExpression: "PK = :p AND begins_with(SK, :s)",
    ExpressionAttributeValues: { ":p": site.PK, ":s": "RELEASE#" },
  });
  const paths = [...new Set(releases.flatMap((r) => (r.filePaths?.length ? r.filePaths : ["index.html"])))];
  await Promise.all(paths.map((p) =>
    ctx.s3.deleteObject(ctx.config.publishedBucket, `sites/${site.slug}/${p}`).catch(() => { /* never copied */ })
  ));
  // evict every cached path a viewer could hold
  try {
    await ctx.cdn.invalidate(ctx.config.distributionId, [`/_preview/${site.slug}/*`, `/sites/${site.slug}/*`]);
  } catch { /* dev tolerable: cache TTL finishes the job */ }
  await ctx.ddb.update({
    Key: { PK: site.PK, SK: "META" },
    UpdateExpression: "SET #s = :s, updatedAt = :t",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":s": "taken_down", ":t": now() },
  });
  return ok({ ok: true, siteId: site.siteId, status: "taken_down" });
}

// POST /sites/{id}/delete: the real delete. Two-step by design: only a
// taken-down site can be deleted, so the pointer is already dark and a wrong
// click can never kill a live premiere. Releases, rows, and the slug claim
// all burn; the slug becomes reusable.
export async function deleteSite(event, ctx) {
  const claims = claimsOf(event);
  const { site, err } = await ownedSite(ctx, pathParam(event, "id"), claims);
  if (err) return err;
  if (site.status !== "taken_down") return bad("take the site down first, then delete", 409);
  const releases = await ctx.ddb.query({
    KeyConditionExpression: "PK = :p AND begins_with(SK, :s)",
    ExpressionAttributeValues: { ":p": site.PK, ":s": "RELEASE#" },
  });
  for (const rel of releases) {
    const paths = rel.filePaths?.length ? rel.filePaths : ["index.html"];
    await Promise.all(paths.map((p) =>
      ctx.s3.deleteObject(ctx.config.publishedBucket, `sites/${site.siteId}/releases/${rel.n}/${p}`).catch(() => { /* already gone */ })
    ));
    await ctx.ddb.del({ PK: site.PK, SK: relSK(rel.n) });
  }
  try { await ctx.kvs.del(ctx.config.kvsArn, site.slug); } catch { /* already dark */ }
  await ctx.ddb.del({ PK: `SLUG#${site.slug}`, SK: "CLAIM" });
  await ctx.ddb.del({ PK: site.PK, SK: "META" });
  return ok({ ok: true, deleted: site.siteId, slug: site.slug });
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

// GET /sites/{id}/stats — the film's audience, read from the daily hit counters
export async function stats(event, ctx) {
  const claims = claimsOf(event);
  const { site, err } = await ownedSite(ctx, pathParam(event, "id"), claims);
  if (err) return err;
  const days = 30;
  const keys = [...Array(days)].map((_, i) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  const rows = await Promise.all(keys.map((d) => ctx.ddb.get({ PK: `HIT#${d}`, SK: `s/${site.slug}` })));
  const daily = keys.map((date, i) => ({ date, count: rows[i]?.count || 0 })).reverse();
  const views = daily.reduce((a, x) => a + x.count, 0);
  const week = daily.slice(-7).reduce((a, x) => a + x.count, 0);
  return ok({ ok: true, siteId: site.siteId, slug: site.slug, views, week, daily });
}

// POST /sites/{id}/domain { domain } — records domain intent; DNS guidance is
// client-side and the TLS handshake finishes operator-side (dev scope).
export async function connectDomain(event, ctx) {
  const claims = claimsOf(event);
  const { site, err } = await ownedSite(ctx, pathParam(event, "id"), claims);
  if (err) return err;
  const b = bodyOf(event);
  if (!b) return bad("invalid json");
  const domain = String(b.domain || "").trim().toLowerCase();
  if (!DOMAIN_RE.test(domain) || domain.length > 253) return bad("valid domain required (like yourname.com)");
  await ctx.ddb.update({
    Key: { PK: site.PK, SK: "META" },
    UpdateExpression: "SET customDomain = :d, domainStatus = :s, domainRequestedAt = :t, updatedAt = :t",
    ExpressionAttributeValues: { ":d": domain, ":s": "pending_dns", ":t": now() },
    ConditionExpression: "attribute_exists(PK)",
  });
  return ok({ ok: true, siteId: site.siteId, domain, domainStatus: "pending_dns", target: ctx.config.cdnDomain });
}

// the audience beacon: one POST /hit per view, keyed s/{slug}, injected into
// every published release so free takes and director's cuts count alike.
// The API base comes from the live request (no config cycle), env as fallback.
const apiBaseOf = (event, ctx) => {
  const d = event?.requestContext?.domainName;
  return d ? `https://${d}` : ctx.config.apiBase || "";
};
function withBeacon(html, base, slug) {
  if (!base || html.includes("data-cf-beacon")) return html;
  const s = `<script data-cf-beacon>try{fetch("${base}/hit",{method:"POST",mode:"cors",keepalive:!0,headers:{"content-type":"application/json"},body:JSON.stringify({page:"s/${slug}"})})}catch(e){}</script>`;
  return html.includes("</body>") ? html.replace("</body>", `${s}</body>`) : html + s;
}

const previewUrl = (ctx, slug) => `https://${ctx.config.cdnDomain}/_preview/${slug}/`;
const stagedUrl = (ctx, siteId, n) => `https://${ctx.config.cdnDomain}/_r/${siteId}/${n}/`;

const pub = (s, ctx) => ({
  siteId: s.siteId, slug: s.slug, title: s.title, status: s.status,
  orderId: s.orderId || null, // set when this film was born from an AI cut
  releases: s.releases, liveRelease: s.liveRelease, stagedRelease: s.stagedRelease ?? null,
  audienceOf: s.audienceOf || null, pointerMode: s.pointerMode,
  customDomain: s.customDomain || null, domainStatus: s.domainStatus || null,
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
  const srcRel = await ctx.ddb.get({ PK: site.PK, SK: relSK(site.liveRelease) });
  const srcPaths = srcRel?.filePaths?.length ? srcRel.filePaths : ["index.html"];
  await Promise.all(srcPaths.map((p) => ctx.s3.copyObject(
    ctx.config.publishedBucket,
    `sites/${site.siteId}/releases/${site.liveRelease}/${p}`,
    `sites/${newId}/releases/1/${p}`
  )));
  await ctx.ddb.put({ PK: `SITE#${newId}`, SK: relSK(1), type: "release", n: 1, source: `duplicate:${site.siteId}`, by: claims.sub, createdAt: now(), filePaths: srcPaths });
  const flip = await flipPointer(ctx, slug, `${newId}/releases/1`, slug);
  const newSite = {
    PK: `SITE#${newId}`, SK: "META", type: "site", siteId: newId, slug,
    title: clampStr(b.title, 120) || `${site.title} Cut`, owner: claims.sub,
    audienceOf: site.siteId, status: "live", releases: 1, liveRelease: 1,
    pointerMode: flip.mode, createdAt: now(), publishedAt: now(), updatedAt: now(),
    GSI1PK: `USER#${claims.sub}`, GSI1SK: `SITE#${now()}`,
  };
  await ctx.ddb.put(newSite, "attribute_not_exists(PK)");
  return ok({ ok: true, site: pub(newSite, ctx) });
}
