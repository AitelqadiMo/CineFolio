// CloudFront Function (viewer-request) — multi-tenant slug router with KVS pointers.
// Pointer flow:   {slug}.cinefolio.site  --KVS-->  "{siteId}/releases/{n}"  -->  S3 prefix
// KVS miss flow:  serve /sites/{slug}/... directly (legacy layout + s3copy fallback + _demo).
import cf from 'cloudfront';

const kvs = cf.kvs();

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

  // directory requests -> index.html
  if (uri.endsWith("/")) {
    uri += "index.html";
  } else if (uri.lastIndexOf(".") < uri.lastIndexOf("/")) {
    uri += "/index.html";
  }

  req.uri = "/sites/" + target + uri;
  return req;
}
