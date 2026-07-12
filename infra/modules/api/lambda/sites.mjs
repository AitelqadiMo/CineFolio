// sites.mjs — site lifecycle with IMMUTABLE RELEASES (ADR #1).
// Layout:  s3://published/sites/{siteId}/releases/{n}/index.html
// Pointer: CloudFront KVS  slug -> "{siteId}/releases/{n}"   (atomic flip, no invalidation)
// Fallback (if KVS data plane unavailable): copy release -> sites/{slug}/current/ + invalidate.
// DynamoDB: SITE#{id}/META (GSI1 SLUG#{slug} for uniqueness), SITE#{id}/RELEASE#{00n}.
import { ok, bad, json, claimsOf, isAdmin, bodyOf, pathParam, qs, clampStr, uuid, now, slugify, validateBundle, isPagePath, assetTypeOf, publishSlots, TRIAL_HOURS } from "./lib.mjs";
import { sendEmail, firstPremiereEmail, trialWarningEmail } from "./email.mjs";

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
    // the manifest is the callback's view; union it with the asset rows so an
    // asset uploaded after delivery (or before an older lambda) still ships
    const assetRows = await ctx.ddb.query({
      KeyConditionExpression: "PK = :p AND begins_with(SK, :s)",
      ExpressionAttributeValues: { ":p": `ORDER#${b.orderId}`, ":s": "ASSET#" },
    });
    const paths = [...new Set([
      ...(Array.isArray(order.cutFiles) && order.cutFiles.length ? order.cutFiles : ["index.html"]),
      ...assetRows.map((r) => r.path).filter(Boolean),
    ])];
    const pagePaths = paths.filter((p) => isPagePath(p));
    assetCopies = paths.filter((p) => !isPagePath(p));
    files = await Promise.all(pagePaths.map(async (p) => ({ path: p, html: await ctx.s3.getObjectText(ctx.config.artifactsBucket, `orders/${b.orderId}/cut/${p}`) })));
    source = `order:${b.orderId}`;
  }
  const pages = files.filter((f) => isPagePath(f.path));
  if (!pages.length || !pages.some((f) => f.path === "index.html")) return bad("bundle must include index.html");
  const problem = validateBundle(pages, { maxTotal: 5 * 1024 * 1024 });
  if (problem) return bad(problem, problem.includes("large") ? 413 : 400);

  // ---- premiere slots (pricing v3): drafts and staged releases are free, but
  // a site GOING LIVE occupies one of the plan's slots. Republishing a film
  // that is already live never re-checks (its slot is already spent), and a
  // takedown frees the slot. Two concurrent first-premieres can race past the
  // count — a soft limit by design, preferred over locking legitimate publishes.
  const staged = b.stage === true;
  const profile = staged ? null : await ctx.ddb.get({ PK: `USER#${claims.sub}`, SK: "PROFILE" });
  if (!staged && site.status !== "live") {
    const slots = publishSlots(profile);
    const mine = await ctx.ddb.query({
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :p AND begins_with(GSI1SK, :s)",
      ExpressionAttributeValues: { ":p": `USER#${claims.sub}`, ":s": "SITE#" },
    });
    const live = mine.filter((s) => s.status === "live" && s.siteId !== site.siteId).length;
    if (live >= slots) {
      return json(402, {
        ok: false,
        error: `your plan screens ${slots} premiere${slots === 1 ? "" : "s"} at a time — unpublish a film, or unlock the Director's Cut for three`,
        slots, live, checkout: "/billing/checkout",
      });
    }
  }
  const beaconBase = apiBaseOf(event, ctx);
  files = pages.map((f) => ({ path: f.path, html: withBeacon(f.html, beaconBase, site.slug) })); // every page carries the audience beacon

  const n = (site.releases || 0) + 1;
  const releasePrefix = `sites/${site.siteId}/releases/${n}`;
  const allPaths = [...files.map((f) => f.path), ...(assetCopies || [])];
  await Promise.all(files.map((f) => ctx.s3.putObject(ctx.config.publishedBucket, `${releasePrefix}/${f.path}`, f.html)));
  if (assetCopies?.length) {
    // images/fonts/video from the cut: byte-for-byte cross-bucket copy, never through text
    await Promise.all(assetCopies.map((p) => ctx.s3.copyObjectAcross
      ? ctx.s3.copyObjectAcross(ctx.config.artifactsBucket, `orders/${b.orderId}/cut/${p}`, ctx.config.publishedBucket, `${releasePrefix}/${p}`)
      : ctx.s3.getObjectBytes(ctx.config.artifactsBucket, `orders/${b.orderId}/cut/${p}`)
        .then((bytes) => ctx.s3.putObject(ctx.config.publishedBucket, `${releasePrefix}/${p}`, bytes, assetTypeOf(p)))));
  }
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
    return ok({ ok: true, siteId: site.siteId, release: n, staged: true, pages: files.length, assets: (assetCopies || []).length, previewUrl: stagedUrl(ctx, site.siteId, n) });
  }

  const firstPremiere = !site.publishedAt; // captured BEFORE the update mutates the record

  // ---- the limited engagement (conversion, pricing v3): a free-plan account's
  // AI-born premiere screens for TRIAL_HOURS, then returns to the vault —
  // preserved, address held — until a plan unlock revives it. The Set's manual
  // films and every paid-plan premiere carry no clock. A re-release during the
  // window keeps the ORIGINAL clock (releases never extend it); publishing
  // after an upgrade clears it for good.
  const paidPlan = profile?.plan === "director" || profile?.plan === "coach";
  const aiBorn = Boolean(b.orderId || site.orderId);
  const trialEndsAt = !paidPlan && aiBorn
    ? (site.trialEndsAt || new Date(Date.now() + TRIAL_HOURS * 3600 * 1000).toISOString())
    : null;

  const flip = await flipPointer(ctx, site.slug, `${site.siteId}/releases/${n}`, site.slug, allPaths);
  // optimistic lock: two concurrent publishes can't both claim release n.
  // A cut premiered onto an existing film marks it AI-born (orderId sticks).
  await ctx.ddb.update({
    Key: { PK: site.PK, SK: "META" },
    UpdateExpression: `SET releases = :n, liveRelease = :n, #s = :live, publishedAt = :t, updatedAt = :t, pointerMode = :pm, trialEndsAt = :trial${b.orderId ? ", orderId = :oid" : ""}`,
    ConditionExpression: "releases = :prev",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":n": n, ":live": "live", ":t": now(), ":pm": flip.mode, ":trial": trialEndsAt, ":prev": site.releases || 0, ...(b.orderId ? { ":oid": b.orderId } : {}) },
  }).catch((e) => {
    if (e?.name === "ConditionalCheckFailedException") throw Object.assign(new Error("concurrent publish, retry"), { statusCode: 409 });
    throw e;
  });

  if (firstPremiere) {
    // premiere night: a film's FIRST go-live gets the share-kit email, once.
    // Later releases stay silent (the console tells that story). Fail-soft:
    // mail can never break a premiere. Runs after the optimistic lock, so a
    // losing concurrent publish can't send a duplicate.
    await sendEmail(ctx, claims.email, firstPremiereEmail(
      { slug: site.slug, title: site.title, url: previewUrl(ctx, site.slug), trialEndsAt },
      ctx.config.appOrigin || ""
    ));
  }

  return ok({ ok: true, siteId: site.siteId, release: n, pointer: flip.mode, pages: files.length, assets: (assetCopies || []).length, url: previewUrl(ctx, site.slug), trialEndsAt });
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

  // a staged-only film going live through "Go live" is a FIRST PREMIERE: the
  // console's normal publish path routes here, not through publish(). Stamp
  // publishedAt and roll the share kit exactly like a direct live publish.
  // Relights and rescreens carry a publishedAt already, so they stay silent.
  const firstPremiere = !site.publishedAt; // captured BEFORE the update mutates the record
  const flip = await flipPointer(ctx, site.slug, `${site.siteId}/releases/${target}`, site.slug, rel.filePaths);
  const clearStage = site.stagedRelease === target;
  await ctx.ddb.update({
    Key: { PK: site.PK, SK: "META" },
    UpdateExpression: `SET liveRelease = :n, updatedAt = :t, pointerMode = :pm, #s = :live${clearStage ? ", stagedRelease = :null" : ""}${firstPremiere ? ", publishedAt = :t" : ""}`,
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":n": target, ":t": now(), ":pm": flip.mode, ":live": "live", ...(clearStage ? { ":null": null } : {}) },
  });

  if (firstPremiere) {
    await sendEmail(ctx, claims.email, firstPremiereEmail(
      { slug: site.slug, title: site.title, url: previewUrl(ctx, site.slug) },
      ctx.config.appOrigin || ""
    ));
  }

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
  await darkenSite(ctx, site, "taken_down");
  return ok({ ok: true, siteId: site.siteId, status: "taken_down" });
}

// darken a live film — pointer, fallback copies, cache, status — shared by the
// owner's takedown and the limited-engagement expiry. The releases themselves
// are never touched: the vault keeps everything, only the marquee goes dark.
async function darkenSite(ctx, site, statusLabel) {
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
    ExpressionAttributeValues: { ":s": statusLabel, ":t": now() },
  });
}

// called from the view beacon: an expired limited engagement darkens itself on
// the first look past its end time. Lazy by design — a trial nobody views
// costs nothing up, and the beacon fires on every real visit.
export async function expireTrialIfDue(ctx, site) {
  if (!site || site.status !== "live" || !site.trialEndsAt) return false;
  if (site.trialEndsAt > now()) return false;
  await darkenSite(ctx, site, "trial_ended");
  return true;
}

// the hourly sweep (EventBridge -> the handler's cfSweep branch): darken every
// engagement past its end, and send the final-screening call exactly once
// inside the last 24 hours. The beacon handles viewed sites lazily; the sweep
// is the guarantee for the unviewed. Single-page scan, same as the Floor's —
// revisit pagination when the catalog outgrows one page.
export async function sweepTrials(ctx) {
  const page = await ctx.ddb.scan({
    FilterExpression: "#t = :t",
    ExpressionAttributeNames: { "#t": "type" },
    ExpressionAttributeValues: { ":t": "site" },
  });
  const all = page.items || [];
  let darkened = 0, warned = 0;
  const nowIso = now();
  const warnHorizon = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  for (const site of all) {
    if (site.status !== "live" || !site.trialEndsAt) continue;
    if (site.trialEndsAt <= nowIso) {
      try { await darkenSite(ctx, site, "trial_ended"); darkened++; }
      catch (e) { console.error(JSON.stringify({ level: "error", msg: "sweep darken failed", siteId: site.siteId, err: e?.message })); }
    } else if (site.trialEndsAt <= warnHorizon && !site.trialWarnedAt) {
      // stamp FIRST (conditional) so overlapping sweeps can never double-send;
      // the mail rides after, fail-soft as always
      try {
        await ctx.ddb.update({
          Key: { PK: site.PK, SK: "META" },
          UpdateExpression: "SET trialWarnedAt = :t, updatedAt = :t",
          ConditionExpression: "attribute_exists(PK) AND attribute_not_exists(trialWarnedAt)",
          ExpressionAttributeValues: { ":t": nowIso },
        });
      } catch (e) {
        if (e?.name === "ConditionalCheckFailedException") continue;
        throw e;
      }
      const owner = String(site.GSI1PK || "").startsWith("USER#") ? site.GSI1PK.slice(5) : null;
      const profile = owner ? await ctx.ddb.get({ PK: `USER#${owner}`, SK: "PROFILE" }) : null;
      if (profile?.email) {
        await sendEmail(ctx, profile.email, trialWarningEmail({ ...site, url: previewUrl(ctx, site.slug) }, ctx.config.appOrigin || ""));
        warned++;
      }
    }
  }
  return { darkened, warned, scanned: all.length };
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
// THE WHOLE RELEASE moves in fallback mode: for months this copied only
// index.html, which served the homepage while every case-study page, image
// and resume 404'd. The pointer must carry every file the release carries.
async function flipPointer(ctx, slug, releasePath, fallbackSlugPrefix, filePaths) {
  try {
    await ctx.kvs.put(ctx.config.kvsArn, slug, releasePath);
    return { mode: "kvs" };
  } catch {
    // Router's KVS-miss fallback serves /sites/{slug}/... directly, so copy the
    // release to the slug root (releases stay immutable; this is just the pointer).
    const paths = Array.isArray(filePaths) && filePaths.length ? filePaths : ["index.html"];
    await Promise.all(paths.map((p) => ctx.s3.copyObject(
      ctx.config.publishedBucket,
      `sites/${releasePath}/${p}`,
      `sites/${fallbackSlugPrefix}/${p}`
    ).catch((e) => {
      // one missing file must not kill the flip, but it must not be silent either
      console.error(JSON.stringify({ level: "warn", msg: "pointer copy skipped", slug, path: p, err: e?.message }));
    })));
    try { await ctx.cdn.invalidate(ctx.config.distributionId, [`/sites/${fallbackSlugPrefix}/*`, `/_preview/${fallbackSlugPrefix}/*`]); } catch { /* dev tolerable */ }
    return { mode: "s3copy", copied: paths.length };
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

// GET /sites/{id}/inspect — the film's release truth: for each release, the
// manifest we recorded at publish time vs the objects that actually exist in
// S3 right now, plus any assets the cut order uploaded. Owner or admin only.
// Answers the "why is my image 404ing" question without SSH into the console.
export async function inspect(event, ctx) {
  const claims = claimsOf(event);
  const { site, err } = await ownedSite(ctx, pathParam(event, "id"), claims);
  if (err) return err;
  const releaseRows = await ctx.ddb.query({
    KeyConditionExpression: "PK = :p AND begins_with(SK, :s)",
    ExpressionAttributeValues: { ":p": site.PK, ":s": "RELEASE#" },
    ScanIndexForward: false,
    Limit: 5,
  });
  const releases = await Promise.all(releaseRows.map(async (r) => {
    const prefix = `sites/${site.siteId}/releases/${r.n}/`;
    let live = null; // null = the list call itself failed; [] = genuinely empty
    try { live = await ctx.s3.listPrefix(ctx.config.publishedBucket, prefix); }
    catch (e) { console.error(JSON.stringify({ level: "warn", msg: "inspect list failed", prefix, err: e?.message })); }
    const manifest = Array.isArray(r.filePaths) && r.filePaths.length ? r.filePaths : ["index.html"];
    if (live === null) {
      // a denied list must SAY so, never masquerade as an empty release
      return { n: r.n, createdAt: r.createdAt, source: r.source || null, manifest, inS3: null, missing: null, extra: null, listError: "S3 list denied: the api role needs s3:ListBucket (run terraform apply)" };
    }
    const liveKeys = new Set(live.map((o) => o.key.replace(prefix, "")));
    const missing = manifest.filter((p) => !liveKeys.has(p));
    const extra = [...liveKeys].filter((k) => !manifest.includes(k));
    return {
      n: r.n, createdAt: r.createdAt, source: r.source || null,
      manifest,
      inS3: [...liveKeys],
      missing, // files the manifest promised but S3 doesn't have -> copy step failed for these
      extra,   // files in S3 that the manifest didn't list -> stale or manual
    };
  }));
  // if this film was born from an order, what did the agent actually ship?
  let orderAssets = null;
  if (site.orderId) {
    const rows = await ctx.ddb.query({
      KeyConditionExpression: "PK = :p AND begins_with(SK, :s)",
      ExpressionAttributeValues: { ":p": `ORDER#${site.orderId}`, ":s": "ASSET#" },
    });
    const order = await ctx.ddb.get({ PK: `ORDER#${site.orderId}`, SK: "META" });
    orderAssets = {
      orderId: site.orderId,
      cutFiles: order?.cutFiles || null,
      uploadedAssets: rows.map((r) => ({ path: r.path, bytes: r.bytes, contentType: r.contentType, at: r.createdAt })),
    };
  }
  return ok({ ok: true, siteId: site.siteId, slug: site.slug, liveRelease: site.liveRelease, releases, orderAssets });
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
  // page armor rides with the beacon: a phone can NEVER scroll sideways and
  // media can never blow out the viewport, whatever the cut's own CSS does.
  // Injected at publish, so every release — engine build or AI cut — is safe.
  const armor = `<style data-cf-armor>html,body{overflow-x:hidden}img,video{max-width:100%}h1,h2,h3{overflow-wrap:anywhere}</style>`;
  const s = `${armor}<script data-cf-beacon>try{fetch("${base}/hit",{method:"POST",mode:"cors",keepalive:!0,headers:{"content-type":"application/json"},body:JSON.stringify({page:"s/${slug}"})})}catch(e){}</script>`;
  return html.includes("</body>") ? html.replace("</body>", `${s}</body>`) : html + s;
}

// The film's public address. With the custom domain live, every live link is
// the real subdomain; the CDN /_preview/ path stays only as the fallback for
// environments without a domain. Staged previews keep the CDN path on purpose:
// they are private pre-premiere links, not the public address.
export const previewUrl = (ctx, slug) => (ctx.config.sitesDomain
  ? `https://${slug}.${ctx.config.sitesDomain}/`
  : `https://${ctx.config.cdnDomain}/_preview/${slug}/`);
const stagedUrl = (ctx, siteId, n) => `https://${ctx.config.cdnDomain}/_r/${siteId}/${n}/`;

const pub = (s, ctx) => ({
  siteId: s.siteId, slug: s.slug, title: s.title, status: s.status,
  orderId: s.orderId || null, // set when this film was born from an AI cut
  trialEndsAt: s.trialEndsAt || null, // limited engagement clock; null = permanent
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
  const flip = await flipPointer(ctx, slug, `${newId}/releases/1`, slug, srcPaths);
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
