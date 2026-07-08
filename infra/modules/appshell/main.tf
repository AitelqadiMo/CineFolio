# APPSHELL — S3 + CloudFront for the client SPA (dashboard/auth/admin).
# Separate distribution from client sites: different cache policy, different blast radius.
variable "name_prefix" { type = string }
variable "account_id" { type = string }
# The console + public landing live at the APEX (and www): the unified SPA
# serves the cinematic marketing landing to logged-out visitors, so the bare
# domain belongs to this distribution. Client films keep *.{domain} on the
# sites distribution; explicit aliases here win over that wildcard.
variable "enable_custom_domain" {
  type    = bool
  default = false
}
variable "domain_aliases" {
  type    = list(string)
  default = [] # e.g. ["cinefolio.dev", "www.cinefolio.dev"]
}
variable "acm_certificate_arn" {
  type    = string
  default = "" # the sites wildcard cert covers apex (SAN) and www (wildcard)
}
variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_s3_bucket" "app" {
  bucket = "${var.name_prefix}-app-shell-${var.account_id}"
  tags   = merge(var.tags, { Role = "app-shell" })
}

resource "aws_s3_bucket_public_access_block" "app" {
  bucket                  = aws_s3_bucket.app.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "app" {
  bucket = aws_s3_bucket.app.id
  versioning_configuration { status = "Enabled" }
}

# SSE-S3: this bucket serves the public SPA through CloudFront OAC (OAC cannot
# decrypt CMK-encrypted objects; the bundle is public content anyway).
resource "aws_s3_bucket_server_side_encryption_configuration" "app" {
  bucket = aws_s3_bucket.app.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "app" {
  name                              = "${var.name_prefix}-app-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "app" {
  enabled             = true
  comment             = "${var.name_prefix} app shell (SPA)"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  aliases             = var.enable_custom_domain ? var.domain_aliases : []

  origin {
    origin_id                = "app-s3"
    domain_name              = aws_s3_bucket.app.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.app.id
  }

  default_cache_behavior {
    target_origin_id       = "app-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  }

  # SPA routing: deep links (/dashboard, /admin) resolve to index.html
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
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

data "aws_iam_policy_document" "app_bucket" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.app.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.app.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "app" {
  bucket = aws_s3_bucket.app.id
  policy = data.aws_iam_policy_document.app_bucket.json
}

output "app_bucket" { value = aws_s3_bucket.app.id }
output "app_distribution_id" { value = aws_cloudfront_distribution.app.id }
output "app_cdn_domain" { value = aws_cloudfront_distribution.app.domain_name }
