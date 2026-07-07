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

output "distribution_id" { value = aws_cloudfront_distribution.sites.id }
output "distribution_domain" { value = aws_cloudfront_distribution.sites.domain_name }
output "distribution_arn" { value = aws_cloudfront_distribution.sites.arn }

output "kvs_arn" { value = aws_cloudfront_key_value_store.sites.arn }
