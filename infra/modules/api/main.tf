# API — Lambda + API Gateway HTTP API with Cognito JWT authorizer.
# Full P1/P2 route set; publish pointers flip via CloudFront KVS (fallback: S3 copy).
variable "name_prefix" { type = string }
variable "app_env" { type = string }
variable "table_name" { type = string }
variable "table_arn" { type = string }
variable "assets_bucket" { type = string }
variable "artifacts_bucket" { type = string }
variable "published_bucket" { type = string }
variable "kms_key_arn" { type = string }
variable "cognito_issuer" { type = string }
variable "cognito_client_id" { type = string }
variable "orders_queue_url" { type = string }
variable "orders_queue_arn" { type = string }
variable "kvs_arn" { type = string }
variable "distribution_id" { type = string }
variable "cdn_domain" { type = string }
variable "sites_domain" {
  type    = string
  default = "" # when set (custom domain live), previewUrl becomes https://{slug}.{sites_domain}/
}
variable "ses_from" {
  type        = string
  default     = ""
  description = "Verified SES sender for transactional email; empty disables sending (sandbox-safe)."
}
variable "app_origin" {
  type        = string
  default     = ""
  description = "Console origin used in email CTAs, e.g. https://d2f6618tf0eldv.cloudfront.net"
}
variable "ses_config_set" {
  type        = string
  default     = ""
  description = "SES configuration set for bounce/complaint tracking; empty sends without one."
}
variable "cors_allowed_origins" {
  type    = list(string)
  default = ["*"]
}
variable "log_retention_days" {
  type    = number
  default = 14
}
variable "tags" {
  type    = map(string)
  default = {}
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  ssm_prefix = "/cinefolio/${var.app_env}"

  # route_key => requires JWT
  routes = {
    "GET /health"                   = false
    "POST /waitlist"                = false
    "GET /waitlist/count"           = false
    "POST /contact"                 = false
    "POST /hit"                     = false
    "POST /studio/generate"         = false # anonymous rough cut only; production runs moved to /studio/order
    "POST /studio/order"            = true  # AI cuts: an account entitlement (3 free, then paid)
    "GET /studio/status"            = false
    "GET /studio/cut"               = false
    "GET /studio/cut/{orderId}/{path+}" = false # path-style preview: relative assets resolve in plain tabs and iframes
    "POST /callback"                = false # authenticated by X-CF-Secret (SSM) inside the handler
    "POST /studio/asset"            = false # same X-CF-Secret gate; the agent ships generated binaries here
    "GET /me"                       = true
    "PUT /me"                       = true
    "POST /media"                   = true
    "POST /media/direct"            = true # CORS-immune upload fallback through the API
    "GET /draft"                    = true
    "PUT /draft"                    = true
    "GET /admin/orders"             = true # + admin group check in-handler
    "POST /admin/orders/{id}/retry" = true # + admin group check in-handler
    "GET /admin/stats"              = true # the Floor: platform overview (admin group in-handler)
    "GET /admin/sites"              = true # the Floor: every film + owner join
    "GET /admin/users"              = true # the Floor: people directory
    "GET /admin/contacts"           = true # the Floor: visitor inbox
    "GET /admin/pipeline"           = true # the Floor: circuit-breaker state
    "POST /admin/pipeline"          = true # the Floor: the kill switch
    "POST /sites"                   = true
    "GET /sites"                    = true
    "GET /sites/{id}"               = true
    "GET /sites/{id}/stats"         = true
    "GET /sites/{id}/inspect"       = true # owner or admin: release truth vs manifest, for debugging
    "GET /sites/{id}/source"        = true
    "POST /sites/{id}/publish"      = true
    "POST /sites/{id}/rollback"     = true
    "POST /sites/{id}/duplicate"    = true
    "POST /sites/{id}/domain"       = true
    "POST /sites/{id}/delete"       = true
    "DELETE /sites/{id}"            = true
    "GET /orders"                   = true
    "POST /orders/{id}/revision"    = true
    "GET /profile"                  = true
    "PUT /profile"                  = true
    "GET /billing/checkout"         = true  # the buyer's personalized Lemon Squeezy checkout URL
    "POST /billing/webhook"         = false # authenticated by X-Signature HMAC (LS webhook secret) inside the handler
  }
}

# ---------- package the handler (tests excluded from the artifact) ----------
data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${path.module}/lambda"
  output_path = "${path.module}/.build/api.zip"
  excludes    = ["test", "test/api.test.mjs"]
}

# ---------- execution role ----------
data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api" {
  name               = "${var.name_prefix}-api-role"
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "api" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:*:*:*"]
  }
  statement {
    sid = "Data"
    actions = [
      "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
      "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:BatchGetItem", "dynamodb:BatchWriteItem",
      # the Floor's admin listings (stats/sites/users) scan by item type;
      # without this every scan is AccessDenied -> 500 on three desks.
      "dynamodb:Scan"
    ]
    resources = [var.table_arn, "${var.table_arn}/index/*"]
  }
  statement {
    sid     = "Objects"
    actions = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = [
      "arn:aws:s3:::${var.assets_bucket}/*",
      "arn:aws:s3:::${var.artifacts_bucket}/*",
      "arn:aws:s3:::${var.published_bucket}/*",
    ]
  }
  statement {
    # ListObjectsV2 needs ListBucket on the BUCKET ARN, not objects/*; without
    # this the release inspector's list silently failed and reported "in S3 0"
    # for releases that existed.
    sid     = "List"
    actions = ["s3:ListBucket"]
    resources = [
      "arn:aws:s3:::${var.published_bucket}",
      "arn:aws:s3:::${var.artifacts_bucket}",
    ]
  }
  statement {
    sid       = "Kms"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [var.kms_key_arn]
  }
  statement {
    sid       = "Secrets"
    actions   = ["ssm:GetParameter", "ssm:GetParametersByPath"]
    resources = ["arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_prefix}*"]
  }
  statement {
    # the Floor's kill switch: admin flips the pipeline circuit breaker from
    # the console. Write access is pinned to that ONE parameter.
    sid       = "BreakerWrite"
    actions   = ["ssm:PutParameter"]
    resources = ["arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_prefix}/PIPELINE_ENABLED"]
  }
  statement {
    # Sender identities are created out-of-band (SES console); scope to identity
    # ARNs once the production domain identity exists.
    sid       = "Email"
    actions   = ["ses:SendEmail"]
    resources = ["*"]
  }
  statement {
    sid       = "Queue"
    actions   = ["sqs:SendMessage"]
    resources = [var.orders_queue_arn]
  }
  statement {
    # SendTaskSuccess/Failure are token-authorized; IAM does not support
    # resource-scoping them to a state machine (token carries the authority).
    sid       = "PipelineResume"
    actions   = ["states:SendTaskSuccess", "states:SendTaskFailure"]
    resources = ["*"]
  }
  statement {
    sid       = "KvsPointer"
    actions   = ["cloudfront-keyvaluestore:DescribeKeyValueStore", "cloudfront-keyvaluestore:GetKey", "cloudfront-keyvaluestore:PutKey", "cloudfront-keyvaluestore:DeleteKey"]
    resources = [var.kvs_arn]
  }
  statement {
    sid       = "Invalidate"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = ["arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/${var.distribution_id}"]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "${var.name_prefix}-api-policy"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${var.name_prefix}-api"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_lambda_function" "api" {
  function_name    = "${var.name_prefix}-api"
  role             = aws_iam_role.api.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  timeout          = 20
  memory_size      = 256

  environment {
    variables = {
      APP_ENV          = var.app_env
      TABLE_NAME       = var.table_name
      ASSETS_BUCKET    = var.assets_bucket
      ARTIFACTS_BUCKET = var.artifacts_bucket
      PUBLISHED_BUCKET = var.published_bucket
      KVS_ARN          = var.kvs_arn
      DISTRIBUTION_ID  = var.distribution_id
      CDN_DOMAIN       = var.cdn_domain
      SITES_DOMAIN     = var.sites_domain
      ORDERS_QUEUE_URL = var.orders_queue_url
      SSM_PREFIX       = local.ssm_prefix
      SES_FROM         = var.ses_from
      APP_ORIGIN       = var.app_origin
      SES_CONFIG_SET   = var.ses_config_set
    }
  }
  depends_on = [aws_cloudwatch_log_group.api]
  tags       = var.tags
}

# ---------- HTTP API ----------
resource "aws_apigatewayv2_api" "http" {
  name          = "${var.name_prefix}-http"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = var.cors_allowed_origins
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["authorization", "content-type", "x-cf-secret", "x-cf-order"]
    max_age       = 3600
  }
  tags = var.tags
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.http.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${var.name_prefix}-jwt"
  jwt_configuration {
    audience = [var.cognito_client_id]
    issuer   = var.cognito_issuer
  }
}

resource "aws_apigatewayv2_route" "public" {
  for_each  = { for k, jwt in local.routes : k => jwt if !jwt }
  api_id    = aws_apigatewayv2_api.http.id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_route" "jwt" {
  for_each           = { for k, jwt in local.routes : k => jwt if jwt }
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = each.key
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = 25
    throttling_burst_limit = 50
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw.arn
    format = jsonencode({
      requestId = "$context.requestId", ip = "$context.identity.sourceIp",
      route     = "$context.routeKey", status = "$context.status", ms = "$context.responseLatency"
    })
  }
  tags = var.tags
}

resource "aws_cloudwatch_log_group" "apigw" {
  name              = "/aws/apigw/${var.name_prefix}-http"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

# ---------- billing (Lemon Squeezy) configuration parameters ----------
# Terraform owns that these parameters EXIST; the operator owns their VALUES,
# set out-of-band (aws ssm put-parameter --overwrite) and never committed.
# ignore_changes keeps applies from reverting a real value to the placeholder.
# The handler treats the placeholder as unconfigured (fail-soft 503), so a
# freshly applied environment can never verify webhooks against a known string.
resource "aws_ssm_parameter" "billing" {
  for_each = toset([
    "LS_BUY_URL_DC",     # Director's Cut checkout link
    "LS_BUY_URL_COACH",  # Coach's Slate checkout link
    "LS_WEBHOOK_SECRET", # webhook signing secret (X-Signature HMAC key)
    "LS_CREDITS_MAP",    # JSON: {"variant:<id>": credits} — packs beyond the flagship default
  ])
  name  = "${local.ssm_prefix}/${each.key}"
  type  = "SecureString"
  value = "unset"
  tags  = var.tags

  lifecycle {
    ignore_changes = [value]
  }
}

output "api_endpoint" { value = aws_apigatewayv2_stage.default.invoke_url }
output "function_name" { value = aws_lambda_function.api.function_name }
output "route_count" { value = length(local.routes) }
output "api_id" { value = aws_apigatewayv2_api.http.id }
