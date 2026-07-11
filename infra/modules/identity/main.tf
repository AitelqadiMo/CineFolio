# IDENTITY — Amazon Cognito user pool for client accounts (dev: email/password)
variable "name_prefix" { type = string }
variable "account_id" { type = string }
variable "callback_urls" {
  type    = list(string)
  default = ["http://localhost:3000/callback", "https://cine-folio.vercel.app/callback"]
}
variable "logout_urls" {
  type    = list(string)
  default = ["http://localhost:3000", "https://cine-folio.vercel.app"]
}
variable "ses_from" {
  type        = string
  default     = ""
  description = "Verified SES sender for auth email (welcome + branded Cognito codes); empty keeps Cognito's default sender."
}
variable "ses_identity_arn" {
  type        = string
  default     = ""
  description = "SES identity ARN Cognito sends through (DEVELOPER mode); empty keeps COGNITO_DEFAULT (50/day, unbranded sender)."
}
variable "app_origin" {
  type    = string
  default = ""
}
variable "ses_config_set" {
  type    = string
  default = ""
}
variable "log_retention_days" {
  type    = number
  default = 14
}
variable "tags" {
  type    = map(string)
  default = {}
}

# ---------- auth mailer: Cognito trigger lambda ----------
# CustomMessage -> branded verification/reset codes; PostConfirmation -> welcome.
# The bundle stitches in the SHARED template library from the api module, the
# same trick the pipeline worker uses: ONE copy of every template in the repo.
data "archive_file" "auth_mailer" {
  type        = "zip"
  output_path = "${path.module}/.build/auth-mailer.zip"

  source {
    content  = file("${path.module}/lambda/auth-mailer.mjs")
    filename = "auth-mailer.mjs"
  }
  source {
    content  = file("${path.module}/../api/lambda/email.mjs")
    filename = "email.mjs"
  }
}

data "aws_iam_policy_document" "auth_mailer_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "auth_mailer" {
  name               = "${var.name_prefix}-auth-mailer-role"
  assume_role_policy = data.aws_iam_policy_document.auth_mailer_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "auth_mailer" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:*:*:*"]
  }
  statement {
    sid       = "Email"
    actions   = ["ses:SendEmail"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "auth_mailer" {
  name   = "${var.name_prefix}-auth-mailer-policy"
  role   = aws_iam_role.auth_mailer.id
  policy = data.aws_iam_policy_document.auth_mailer.json
}

resource "aws_cloudwatch_log_group" "auth_mailer" {
  name              = "/aws/lambda/${var.name_prefix}-auth-mailer"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_lambda_function" "auth_mailer" {
  function_name    = "${var.name_prefix}-auth-mailer"
  role             = aws_iam_role.auth_mailer.arn
  runtime          = "nodejs20.x"
  handler          = "auth-mailer.handler"
  filename         = data.archive_file.auth_mailer.output_path
  source_code_hash = data.archive_file.auth_mailer.output_base64sha256
  timeout          = 10 # CustomMessage must answer fast; Cognito waits ~5s
  memory_size      = 128

  environment {
    variables = {
      SES_FROM       = var.ses_from
      APP_ORIGIN     = var.app_origin
      SES_CONFIG_SET = var.ses_config_set
    }
  }
  depends_on = [aws_cloudwatch_log_group.auth_mailer]
  tags       = var.tags
}

resource "aws_lambda_permission" "cognito_invoke" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auth_mailer.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}

# Cognito configured via the API needs an explicit SES sending-authorization
# policy on the identity (the console adds this silently; terraform must not).
# Account-pinned wildcard on the pool ARN avoids a create-order cycle with the
# pool's email_configuration below.
resource "aws_ses_identity_policy" "cognito_send" {
  count    = var.ses_identity_arn == "" ? 0 : 1
  identity = var.ses_identity_arn
  name     = "${var.name_prefix}-cognito-send"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCognitoSend"
      Effect    = "Allow"
      Principal = { Service = "cognito-idp.amazonaws.com" }
      Action    = ["ses:SendEmail", "ses:SendRawEmail"]
      Resource  = var.ses_identity_arn
      Condition = {
        StringEquals = { "aws:SourceAccount" = var.account_id }
        ArnLike      = { "aws:SourceArn" = "arn:aws:cognito-idp:*:${var.account_id}:userpool/*" }
      }
    }]
  })
}

resource "aws_cognito_user_pool" "main" {
  name                     = "${var.name_prefix}-users"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OPTIONAL"

  software_token_mfa_configuration { enabled = true }

  # branded auth email: CustomMessage rewrites verification/reset codes in the
  # house style, PostConfirmation sends the welcome. The lambda never blocks
  # auth (fail-soft by contract).
  lambda_config {
    custom_message    = aws_lambda_function.auth_mailer.arn
    post_confirmation = aws_lambda_function.auth_mailer.arn
  }

  # send through SES as the studio (DEVELOPER mode) once an identity is wired;
  # without it Cognito's default sender applies (unbranded, 50 mails/day).
  # The sending-authorization policy must exist BEFORE this configuration is
  # validated, hence the explicit depends_on.
  dynamic "email_configuration" {
    for_each = var.ses_identity_arn == "" ? [] : [1]
    content {
      email_sending_account = "DEVELOPER"
      source_arn            = var.ses_identity_arn
      from_email_address    = "CineFolio Studios <${var.ses_from}>"
    }
  }
  depends_on = [aws_ses_identity_policy.cognito_send]

  password_policy {
    minimum_length                   = 10
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  tags = var.tags
}

resource "aws_cognito_user_pool_client" "spa" {
  name         = "${var.name_prefix}-spa"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret               = false # public SPA client (PKCE)
  prevent_user_existence_errors = "ENABLED"

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
  ]

  supported_identity_providers         = ["COGNITO"]
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  callback_urls                        = var.callback_urls
  logout_urls                          = var.logout_urls

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.name_prefix}-${var.account_id}"
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_user_group" "client" {
  name         = "client"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Standard client accounts"
  precedence   = 10
}

resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Studio operators"
  precedence   = 1
}

output "user_pool_id" { value = aws_cognito_user_pool.main.id }
output "user_pool_arn" { value = aws_cognito_user_pool.main.arn }
output "client_id" { value = aws_cognito_user_pool_client.spa.id }
output "issuer" { value = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.main.id}" }
output "hosted_ui_domain" { value = "${aws_cognito_user_pool_domain.main.domain}.auth.${data.aws_region.current.name}.amazoncognito.com" }

data "aws_region" "current" {}
