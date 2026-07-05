// CloudFront Function (viewer-request) — multi-tenant slug router.
// Maps {slug}.cinefolio.site  ->  s3 origin path /sites/{slug}/...
// In dev (native cloudfront.net domain) it simply serves /sites/_demo/ so the
// distribution is testable before the slug KeyValueStore is wired in P2.
function handler(event) {
  var req = event.request;
  var host = (req.headers.host && req.headers.host.value) || "";
  var uri = req.uri;

  // derive slug from subdomain; fall back to _demo for the raw cloudfront domain
  var slug = "_demo";
  var parts = host.split(".");
  if (parts.length > 2 && parts[0] !== "www" && host.indexOf("cloudfront.net") === -1) {
    slug = parts[0];
  }

  // directory requests -> index.html
  if (uri.endsWith("/")) {
    uri += "index.html";
  } else if (uri.lastIndexOf(".") < uri.lastIndexOf("/")) {
    uri += "/index.html";
  }

  req.uri = "/sites/" + slug + uri;
  return req;
}
