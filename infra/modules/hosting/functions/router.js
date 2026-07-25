// CloudFront Function (viewer-request) — multi-tenant slug router with KVS pointers.
// Pointer flow:   {slug}.cinefolio.dev  --KVS-->  "{siteId}/releases/{n}"  -->  S3 prefix
// KVS miss flow:  serve /sites/{slug}/... directly (legacy layout + s3copy fallback + _demo).
import cf from 'cloudfront';

const kvs = cf.kvs();

// A vaulted slug (a free-plan limited engagement whose 72 hours are up) points
// at this sentinel instead of a release path. The API writes it on expiry; see
// VAULT_SENTINEL in infra/modules/api/lambda/sites.mjs and keep the two in
// lockstep. It lets the edge tell a film that WAS published (address held, one
// unlock from coming back) apart from a slug that never existed, a distinction
// the router otherwise cannot make without a data lookup it is not allowed. A
// takedown leaves the slug fully dark, so it never lands here.
var VAULT_SENTINEL = "_vault";

// The vaulted page: honest and useful, never shaming, never fake urgency. It
// tells a visitor plainly that this portfolio is not currently published, then
// explains what CineFolio is and offers a clear path to build their own. It
// says nothing about who the owner is or why it is down: the owner did nothing
// wrong, and a real expiry is not a broken link, it is a run that ended. The
// owner is nudged privately by email; this page is only ever for the visitor.
var CONSOLE_URL = "https://d2f6618tf0eldv.cloudfront.net";
function vaultResponse() {
  var html = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Not currently screening · CineFolio</title><style>'
    + ':root{--navy:#0E1C3F;--navy2:#132550;--red:#E63946;--gold:#D9A441;--bone:#F4EFE6;--dim:rgba(244,239,230,.66);--line:rgba(244,239,230,.14)}'
    + '*{margin:0;padding:0;box-sizing:border-box}'
    + 'body{background:var(--navy);color:var(--bone);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;min-height:100vh;display:grid;place-items:center;padding:40px 20px;position:relative;overflow:hidden}'
    + 'body::before{content:"";position:absolute;inset:-10%;background:radial-gradient(50% 40% at 30% 30%,rgba(200,16,46,.20),transparent 60%),radial-gradient(45% 40% at 78% 45%,rgba(217,164,65,.16),transparent 60%),radial-gradient(35% 40% at 55% 80%,rgba(14,158,98,.12),transparent 62%);filter:blur(20px)}'
    + '.card{position:relative;max-width:560px;background:rgba(19,37,80,.55);border:1px solid var(--line);border-radius:22px;padding:44px 40px;box-shadow:0 30px 80px rgba(4,8,20,.5)}'
    + '.card::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;border-radius:22px 22px 0 0;background:linear-gradient(90deg,#C8102E,#D9A441,#0E9E62)}'
    + '.kicker{font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;font-size:10px;letter-spacing:.34em;color:var(--gold);text-transform:uppercase;margin-bottom:16px}'
    + 'h1{font-weight:800;font-size:clamp(1.9rem,5vw,2.7rem);line-height:1.05;text-transform:uppercase;margin-bottom:16px}'
    + 'p{color:var(--dim);font-size:15px;line-height:1.65;margin-bottom:14px}'
    + 'p b{color:var(--bone);font-weight:600}'
    + '.cta{display:inline-flex;align-items:center;gap:10px;margin-top:22px;background:var(--red);color:#fff;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:13px 24px;border-radius:9px;box-shadow:0 6px 18px rgba(200,16,46,.28)}'
    + '.foot{font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;font-size:9px;letter-spacing:.24em;color:rgba(244,239,230,.42);text-align:center;margin-top:30px;text-transform:uppercase}'
    + '</style></head><body><div class="card">'
    + '<div class="kicker">CineFolio Studios · Between screenings</div>'
    + '<h1>This portfolio is not currently screening.</h1>'
    + '<p>The film that lived at this address has finished its run for now. Nothing is wrong, and there is nothing you need to do.</p>'
    + '<p><b>CineFolio</b> is where people build a film of their career. You bring your resume and your work, the app renders it into a cinematic portfolio site, and it screens at your own address in one click.</p>'
    + '<p>Want one of your own? It is free to build your first film.</p>'
    + '<a class="cta" href="' + CONSOLE_URL + '" target="_top">Build your own film</a>'
    + '<div class="foot">cinefolio.dev · Your career, filmed.</div>'
    + '</div></body></html>';
  return {
    statusCode: 404,
    statusDescription: "Not Found",
    headers: {
      "content-type": { value: "text/html; charset=utf-8" },
      "cache-control": { value: "no-store" }
    },
    body: html
  };
}

async function handler(event) {
  var req = event.request;
  var host = (req.headers.host && req.headers.host.value) || "";
  var uri = req.uri;

  // client media (project covers, headshots) is stored at media/* in the same
  // bucket and served as-is — no slug rewrite.
  if (uri.indexOf("/media/") === 0) {
    return req;
  }

  // derive slug from subdomain; the raw cloudfront.net domain demos /sites/_demo/
  var slug = "_demo";
  var parts = host.split(".");
  if (parts.length > 2 && parts[0] !== "www" && host.indexOf("cloudfront.net") === -1) {
    slug = parts[0];
  }

  // staged-release preview: /_r/{siteId}/{n}/... shows a draft release that has
  // NOT gone live (the pointer has not moved).
  if (uri.indexOf("/_r/") === 0) {
    var r2 = uri.slice(4);
    var s1 = r2.indexOf("/");
    var sid = s1 === -1 ? r2 : r2.slice(0, s1);
    var r3 = s1 === -1 ? "/" : r2.slice(s1);
    var s2 = r3.indexOf("/", 1);
    var rel = s2 === -1 ? r3.slice(1) : r3.slice(1, s2);
    var rest = s2 === -1 ? "/" : r3.slice(s2);
    if (rest.charAt(rest.length - 1) === "/") rest += "index.html";
    req.uri = "/sites/" + sid + "/releases/" + rel + rest;
    return req;
  }

  // path preview: /_preview/{slug}/... serves any published site before custom
  // domains exist (the dashboard's "view live" link in dev).
  if (uri.indexOf("/_preview/") === 0) {
    var rest = uri.slice(10); // after "/_preview/"
    var cut = rest.indexOf("/");
    slug = (cut === -1 ? rest : rest.slice(0, cut)) || slug;
    uri = cut === -1 ? "/" : rest.slice(cut);
  }

  // atomic pointer lookup; on miss serve the slug prefix as-is
  var target = slug;
  try {
    var v = await kvs.get(slug);
    if (v) target = v;
  } catch (e) { /* no pointer for this slug */ }

  // a vaulted film: the pointer is the sentinel, not a release path. Serve the
  // honest "not currently screening" page directly from the edge, no origin
  // fetch, so a vaulted slug never leaks a stale object or an XML S3 error.
  if (target === VAULT_SENTINEL) {
    return vaultResponse();
  }

  // directory requests -> index.html
  if (uri.endsWith("/")) {
    uri += "index.html";
  } else if (uri.lastIndexOf(".") < uri.lastIndexOf("/")) {
    uri += "/index.html";
  }

  req.uri = "/sites/" + target + uri;
  return req;
}
