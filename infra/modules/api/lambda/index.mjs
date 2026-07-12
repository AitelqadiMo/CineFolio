// CineFolio API — router. Auth is enforced at the gateway (JWT authorizer on
// protected routes); admin group checks happen in-handler. All handlers receive
// (event, ctx) where ctx carries every side-effecting dependency (testable).
import { json, bad, routeKeyOf } from "./lib.mjs";
import * as misc from "./misc.mjs";
import * as studio from "./studio.mjs";
import * as sites from "./sites.mjs";
import * as orders from "./orders.mjs";
import * as admin from "./admin.mjs";
import * as billing from "./billing.mjs";

export const ROUTES = {
  "GET /health": async (_e, ctx) => json(200, { ok: true, service: "cinefolio-api", env: ctx.config.appEnv, ts: new Date().toISOString() }),
  "GET /me": misc.getMe,
  "PUT /me": misc.putMe,
  "POST /media": misc.mediaUpload,
  "POST /media/direct": misc.mediaDirect,
  "GET /draft": misc.getDraft,
  "PUT /draft": misc.putDraft,
  "GET /profile": misc.getProfile,
  "PUT /profile": misc.putProfile,
  "POST /waitlist": misc.joinWaitlist,
  "GET /waitlist/count": misc.waitlistCount,
  "POST /contact": misc.contact,
  "POST /hit": misc.hit,
  "GET /admin/orders": misc.adminOrders,
  "POST /admin/orders/{id}/retry": studio.adminRetry,
  "GET /admin/stats": admin.stats,
  "GET /admin/sites": admin.sites,
  "GET /admin/users": admin.users,
  "GET /admin/contacts": admin.contacts,
  "GET /admin/pipeline": admin.pipelineGet,
  "POST /admin/pipeline": admin.pipelineSet,
  "POST /studio/generate": studio.generate,
  "POST /studio/order": studio.order,
  "GET /studio/status": studio.status,
  "GET /studio/cut": studio.cut,
  "GET /studio/cut/{orderId}/{path+}": studio.cutFile,
  "POST /callback": studio.callback,
  "POST /studio/asset": studio.asset,
  "GET /orders": orders.listOrders,
  "POST /orders/{id}/revision": orders.requestRevision,
  "GET /billing/checkout": billing.checkout,
  "POST /billing/webhook": billing.webhook,
  "GET /sites/{id}/stats": sites.stats,
  "GET /sites/{id}/inspect": sites.inspect,
  "POST /sites/{id}/domain": sites.connectDomain,
  "POST /sites": sites.createSite,
  "GET /sites": sites.listSites,
  "GET /sites/{id}": sites.getSite,
  "GET /sites/{id}/source": sites.source,
  "POST /sites/{id}/publish": sites.publish,
  "POST /sites/{id}/rollback": sites.rollback,
  "POST /sites/{id}/duplicate": sites.duplicate,
  "DELETE /sites/{id}": sites.takedown,
  "POST /sites/{id}/delete": sites.deleteSite,
};

let realCtx = null;
async function buildCtx() {
  if (realCtx) return realCtx;
  const aws = await import("./aws.mjs");
  realCtx = {
    ddb: aws.ddb, s3: aws.s3, kvs: aws.kvs, cdn: aws.cdn, queue: aws.queue, sfn: aws.sfn, presign: aws.presign, ses: aws.ses,
    secrets: aws.secrets, params: aws.params, fetchFn: aws.fetchFn,
    config: {
      appEnv: process.env.APP_ENV || "dev",
      ssmPrefix: process.env.SSM_PREFIX || "/cinefolio/dev",
      apiBase: (process.env.API_BASE || "").replace(/\/$/, ""),
      artifactsBucket: process.env.ARTIFACTS_BUCKET,
      publishedBucket: process.env.PUBLISHED_BUCKET,
      kvsArn: process.env.KVS_ARN,
      distributionId: process.env.DISTRIBUTION_ID,
      cdnDomain: process.env.CDN_DOMAIN,
      sitesDomain: process.env.SITES_DOMAIN || "",
      ordersQueueUrl: process.env.ORDERS_QUEUE_URL,
      sesFrom: process.env.SES_FROM || "",
      appOrigin: (process.env.APP_ORIGIN || "").replace(/\/$/, ""),
    },
  };
  return realCtx;
}

export function makeHandler(ctxFactory = buildCtx) {
  return async (event) => {
    const ctx = await ctxFactory();
    const fn = ROUTES[routeKeyOf(event)];
    if (!fn) return bad("not_found", 404);
    try {
      return await fn(event, ctx);
    } catch (e) {
      const code = e?.statusCode && e.statusCode >= 400 && e.statusCode < 500 ? e.statusCode : 500;
      console.error(JSON.stringify({ level: "error", route: routeKeyOf(event), msg: e?.message, name: e?.name }));
      return json(code, { ok: false, error: code === 500 ? "internal_error" : e.message });
    }
  };
}

export const handler = makeHandler();
