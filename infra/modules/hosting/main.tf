# HOSTING — CloudFront distribution serving ALL client sites from one S3 bucket.
# Multi-tenant: an edge Function rewrites the host's slug to an S3 prefix.
# Custom domain (*.cinefolio.site) is gated behind enable_custom_domain so the
# first dev apply completes on the native cloudfront.net domain with no ACM/DNS.
variable "name_prefix" { type = string }
variable "published_bucket" { type = string }
variable "published_bucket_arn" { type = string }
variable "published_bucket_regional_domain" { type = string }
variable "enable_custom_domain" {
  type    = bool
  default = false
}
variable "sites_domain" {
  type    = string
  default = "" # e.g. cinefolio.site — required only when enable_custom_domain=true
}
variable "acm_certificate_arn" {
  type    = string
  default = "" # us-east-1 wildcard cert ARN, supplied when enabling custom domain
}
variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_cloudfront_origin_access_control" "sites" {
  name                              = "${var.name_prefix}-sites-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Pointer store: slug -> "{siteId}/releases/{n}". The API flips these atomically.
resource "aws_cloudfront_key_value_store" "sites" {
  name    = "${var.name_prefix}-sites"
  comment = "slug to release-path pointers for multi-tenant hosting"
}

resource "aws_cloudfront_function" "router" {
  name                         = "${var.name_prefix}-slug-router"
  runtime                      = "cloudfront-js-2.0"
  code                         = file("${path.module}/functions/router.js")
  publish                      = true
  key_value_store_associations = [aws_cloudfront_key_value_store.sites.arn]
}

resource "aws_cloudfront_distribution" "sites" {
  enabled             = true
  comment             = "${var.name_prefix} multi-tenant client sites"
  default_root_object = "index.html"
  price_class         = "PriceClass_100" # EU + NA edges (cost control)
  aliases             = var.enable_custom_domain ? ["*.${var.sites_domain}"] : []

  origin {
    origin_id                = "sites-s3"
    domain_name              = var.published_bucket_regional_domain
    origin_access_control_id = aws_cloudfront_origin_access_control.sites.id
  }

  default_cache_behavior {
    target_origin_id       = "sites-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.router.arn
    }
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/sites/_demo/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  dynamic "viewer_certificate" {
    for_each = var.enable_custom_domain ? [1] : []
    content {
      acm_certificate_arn      = var.acm_certificate_arn
      ssl_support_method       = "sni-only"
      minimum_protocol_version = "TLSv1.2_2021"
    }
  }
  dynamic "viewer_certificate" {
    for_each = var.enable_custom_domain ? [] : [1]
    content {
      cloudfront_default_certificate = true
    }
  }

  tags = var.tags
}

# Bucket policy: only this distribution may read the published bucket.
# ListBucket is granted so a MISSING object returns an honest 404 instead of
# S3's AccessDenied (which reads like a permissions incident to a visitor).
data "aws_iam_policy_document" "bucket" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${var.published_bucket_arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.sites.arn]
    }
  }
  statement {
    sid       = "AllowCloudFrontList"
    actions   = ["s3:ListBucket"]
    resources = [var.published_bucket_arn]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.sites.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "published" {
  bucket = var.published_bucket
  policy = data.aws_iam_policy_document.bucket.json
}

# The CDN root has to answer something friendly. Before this, hitting the raw
# cloudfront.net domain (or a slug without a KVS pointer) served the router's
# _demo fallback, which was never seeded: S3 answered NoSuchKey. Seed a real
# landing so root visits explain the product instead of leaking XML errors.
resource "aws_s3_object" "demo_landing" {
  bucket        = var.published_bucket
  key           = "sites/_demo/index.html"
  content_type  = "text/html; charset=utf-8"
  cache_control = "public, max-age=300"
  content       = <<-HTML
    <!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>CineFolio Studios</title>
    <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@400;600&family=Inter:wght@400;500&display=swap" rel="stylesheet">
    <style>
      :root{--navy:#0E1C3F;--navy2:#132550;--red:#E63946;--gold:#D9A441;--bone:#F4EFE6;--green:#0E9E62;--dim:rgba(244,239,230,.66);--line:rgba(244,239,230,.14)}
      *{margin:0;padding:0;box-sizing:border-box}
      body{background:var(--navy);color:var(--bone);font-family:Inter,sans-serif;min-height:100vh;display:grid;place-items:center;padding:40px 20px;position:relative;overflow:hidden}
      body::before{content:"";position:absolute;inset:-10%;background:radial-gradient(50% 40% at 30% 30%,rgba(200,16,46,.22),transparent 60%),radial-gradient(45% 40% at 78% 45%,rgba(217,164,65,.18),transparent 60%),radial-gradient(35% 40% at 55% 80%,rgba(14,158,98,.14),transparent 62%);filter:blur(20px)}
      .card{position:relative;max-width:560px;background:rgba(19,37,80,.55);border:1px solid var(--line);border-radius:22px;padding:44px 40px;backdrop-filter:blur(14px);box-shadow:0 30px 80px rgba(4,8,20,.5)}
      .card::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;border-radius:22px 22px 0 0;background:linear-gradient(90deg,#C8102E,#D9A441,#0E9E62)}
      .kicker{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.34em;color:var(--gold);text-transform:uppercase;margin-bottom:16px}
      h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(2rem,5vw,3rem);line-height:1;text-transform:uppercase;margin-bottom:16px}
      h1 em{font-family:'Instrument Serif',serif;font-style:italic;font-weight:400;color:var(--gold);text-transform:none}
      p{color:var(--dim);font-size:15px;line-height:1.65;margin-bottom:14px}
      p b{color:var(--bone);font-weight:600}
      code{font-family:'IBM Plex Mono',monospace;font-size:12px;background:rgba(10,17,38,.7);border:1px solid var(--line);border-radius:6px;padding:2px 8px;color:var(--gold);white-space:nowrap}
      .cta{display:inline-flex;align-items:center;gap:10px;margin-top:22px;background:var(--red);color:#fff;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:12px 22px;border-radius:9px;box-shadow:0 6px 18px rgba(200,16,46,.28)}
      .cta:hover{filter:brightness(1.08)}
      .foot{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.24em;color:rgba(244,239,230,.42);text-align:center;margin-top:30px;text-transform:uppercase}
    </style></head><body>
    <div class="card">
      <div class="kicker">CineFolio Studios · The Backlot</div>
      <h1>You're at the <em>studio gate.</em></h1>
      <p>This is the multi-tenant hosting for portfolios filmed by the studio. Every film lives at its <b>own slug</b>, either on <code>{slug}.cinefolio.site</code> or, in dev, at <code>/_preview/{slug}/</code>.</p>
      <p>Looking for a specific portfolio? Ask its author for the link. Filming your own? Open the console and pick <b>The Set</b>.</p>
      <a class="cta" href="https://d2f6618tf0eldv.cloudfront.net" target="_top">Open the console →</a>
      <div class="foot">Made with AI cameras and taste · Est. Budapest</div>
    </div>
    </body></html>
  HTML
}

output "distribution_id" { value = aws_cloudfront_distribution.sites.id }
output "distribution_domain" { value = aws_cloudfront_distribution.sites.domain_name }
output "distribution_arn" { value = aws_cloudfront_distribution.sites.arn }

output "kvs_arn" { value = aws_cloudfront_key_value_store.sites.arn }
