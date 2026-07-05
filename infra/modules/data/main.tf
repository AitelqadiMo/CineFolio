# DATA — DynamoDB single-table + S3 buckets (client assets, published sites, build artifacts)
variable "name_prefix" { type = string }
variable "account_id" { type = string }
variable "kms_key_arn" { type = string }
variable "cors_allowed_origins" {
  type    = list(string)
  default = ["*"]
}
variable "tags" {
  type    = map(string)
  default = {}
}

# ---------- DynamoDB single-table ----------
resource "aws_dynamodb_table" "main" {
  name         = "${var.name_prefix}-app"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }
  attribute {
    name = "GSI1PK"
    type = "S"
  }
  attribute {
    name = "GSI1SK"
    type = "S"
  }
  attribute {
    name = "GSI2PK"
    type = "S"
  }
  attribute {
    name = "GSI2SK"
    type = "S"
  }

  # GSI1: slug -> site lookup (PK=SLUG#<slug>), and other lookups
  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }
  # GSI2: order queue / status views (PK=STATUS#<status>)
  global_secondary_index {
    name            = "GSI2"
    hash_key        = "GSI2PK"
    range_key       = "GSI2SK"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
  point_in_time_recovery { enabled = true }
  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }
  tags = var.tags
}

# ---------- S3 buckets ----------
locals {
  buckets = {
    assets    = "${var.name_prefix}-client-assets-${var.account_id}"   # private uploads (photos, CVs)
    published = "${var.name_prefix}-published-sites-${var.account_id}" # served via CloudFront (hosting module)
    artifacts = "${var.name_prefix}-build-artifacts-${var.account_id}" # pipeline logs + intermediates
  }
}

resource "aws_s3_bucket" "b" {
  for_each = local.buckets
  bucket   = each.value
  tags     = merge(var.tags, { Role = each.key })
}

resource "aws_s3_bucket_public_access_block" "b" {
  for_each                = aws_s3_bucket.b
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "b" {
  for_each = aws_s3_bucket.b
  bucket   = each.value.id
  versioning_configuration { status = "Enabled" }
}

# Encryption: PRIVATE buckets (assets, artifacts) use the CMK. The published-sites
# bucket serves public websites through CloudFront OAC, which cannot decrypt
# CMK-encrypted objects — public content gets SSE-S3 (AES256) by design.
resource "aws_s3_bucket_server_side_encryption_configuration" "b" {
  for_each = aws_s3_bucket.b
  bucket   = each.value.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = each.key == "published" ? "AES256" : "aws:kms"
      kms_master_key_id = each.key == "published" ? null : var.kms_key_arn
    }
    bucket_key_enabled = each.key == "published" ? null : true
  }
}

# Presigned browser uploads need CORS on the assets bucket
resource "aws_s3_bucket_cors_configuration" "assets" {
  bucket = aws_s3_bucket.b["assets"].id
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "POST", "GET"]
    allowed_origins = var.cors_allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# Lifecycle: expire raw client assets 90 days after delivery (GDPR minimization)
resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.b["assets"].id
  rule {
    id     = "expire-raw-assets"
    status = "Enabled"
    filter { prefix = "orders/" }
    expiration { days = 90 }
  }
}

output "table_name" { value = aws_dynamodb_table.main.name }
output "table_arn" { value = aws_dynamodb_table.main.arn }
output "assets_bucket" { value = aws_s3_bucket.b["assets"].id }
output "published_bucket" { value = aws_s3_bucket.b["published"].id }
output "published_bucket_arn" { value = aws_s3_bucket.b["published"].arn }
output "published_bucket_regional_domain" { value = aws_s3_bucket.b["published"].bucket_regional_domain_name }
output "artifacts_bucket" { value = aws_s3_bucket.b["artifacts"].id }
