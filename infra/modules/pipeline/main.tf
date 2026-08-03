# PIPELINE — the reliability core (phase 3, pillar A).
# SQS orders -> EventBridge Pipe -> Step Functions -> pipeline Lambda:
#   Validate -> Dispatch (waitForTaskToken, webhook to the agent) -> Finalize
# Retries with backoff, 30-min build timeout, HumanReview terminal state + SNS page.
# An order can end exactly three ways: ready, human_review, or noop (invalid) — never silence.
variable "name_prefix" { type = string }
variable "app_env" { type = string }
variable "table_name" { type = string }
variable "table_arn" { type = string }
variable "kms_key_arn" { type = string }
variable "api_domain" {
  type        = string
  description = "API host (no scheme) the agent calls back, e.g. 81ik4yem44.execute-api.eu-central-1.amazonaws.com"
}
variable "alarm_topic_arn" { type = string }
variable "artifacts_bucket" {
  type        = string
  description = "Artifacts bucket name; revision dispatches presign the existing cut's files from orders/*"
}
variable "artifacts_bucket_arn" { type = string }
variable "ses_from" {
  type    = string
  default = ""
}
variable "app_origin" {
  type    = string
  default = ""
}
variable "ses_config_set" {
  type        = string
  default     = ""
  description = "SES configuration set for bounce/complaint tracking; empty sends without one."
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
}

# ---------- queues (unchanged contract) ----------
resource "aws_sqs_queue" "dlq" {
  name                      = "${var.name_prefix}-orders-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
  tags                      = var.tags
}

resource "aws_sqs_queue" "orders" {
  name                       = "${var.name_prefix}-orders"
  visibility_timeout_seconds = 900
  message_retention_seconds  = 345600
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })
  tags = var.tags
}

# ---------- content-moderation configuration parameters ----------
# Creem (payment provider) mandates a prompt-moderation surface for any product
# that generates images or video; this pipeline generates both, so moderation is
# a hard compliance requirement. The deterministic screen in moderation.mjs runs
# with NO configuration at all — these parameters are ONLY for the optional
# network screens, and the pipeline reads them from the same SSM path it already
# loads at validate time.
#
# Two independent screens are configured here:
#   - the generic hosted hook (MODERATION_API_*), which we chose and which FAILS
#     OPEN to the deterministic floor on an outage, and
#   - the Creem provider screen (CREEM_MODERATION_*), which Creem's AI Wrapper
#     Compliance rules MANDATE and which FAILS CLOSED on an outage. Supplying
#     CREEM_MODERATION_API_KEY alone arms it: the URL DEFAULTS in code to Creem's
#     real endpoint, so CREEM_MODERATION_API_URL only needs a value to override
#     it (e.g. to point at Creem's test host). Keys start with `creem_`
#     (`creem_test_` for test mode).
#
# Same doctrine as the billing parameters: Terraform owns that the parameters
# EXIST, the operator owns their VALUES (set out-of-band via
# `aws ssm put-parameter --overwrite`, never committed). The placeholder "unset"
# is treated as UNCONFIGURED/DORMANT by moderation.mjs, so each screen stays
# dormant until a real key is supplied. A KEY IS NEVER HARDCODED HERE.
resource "aws_ssm_parameter" "moderation" {
  for_each = toset([
    "MODERATION_API_URL",        # generic hosted endpoint (POST JSON {input}); empty/unset = hook disabled
    "MODERATION_API_KEY",        # bearer key for the generic endpoint; treated as unconfigured while "unset"
    "CREEM_MODERATION_API_URL",  # Creem endpoint override; unset => code default https://api.creem.io/v1/moderation/prompt
    "CREEM_MODERATION_API_KEY",  # Creem x-api-key (creem_ / creem_test_); unset/"unset" = Creem screen dormant
  ])
  name  = "${local.ssm_prefix}/${each.key}"
  type  = "SecureString"
  value = "unset"
  tags  = var.tags

  lifecycle {
    ignore_changes = [value]
  }
}

# ---------- pipeline worker Lambda ----------
# The bundle = pipeline.mjs + the content-moderation screen + the SHARED email
# template library. email.mjs is sourced from the api module at plan time, so
# there is exactly ONE copy of every customer email in the repo and the two
# lambdas can never drift apart. moderation.mjs is pipeline-local: it is the
# content-screening gate the pipeline runs before every dispatch.
data "archive_file" "worker" {
  type        = "zip"
  output_path = "${path.module}/.build/pipeline.zip"

  source {
    content  = file("${path.module}/lambda/pipeline.mjs")
    filename = "pipeline.mjs"
  }
  source {
    content  = file("${path.module}/lambda/moderation.mjs")
    filename = "moderation.mjs"
  }
  source {
    content  = file("${path.module}/lambda/director-kit.mjs")
    filename = "director-kit.mjs"
  }
  source {
    content  = file("${path.module}/lambda/director-prompt.mjs")
    filename = "director-prompt.mjs"
  }
  source {
    content  = file("${path.module}/../api/lambda/email.mjs")
    filename = "email.mjs"
  }
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "worker" {
  name               = "${var.name_prefix}-pipeline-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "worker" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:*:*:*"]
  }
  statement {
    sid       = "Orders"
    actions   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
    resources = [var.table_arn]
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
    sid       = "Email"
    actions   = ["ses:SendEmail"]
    resources = ["*"]
  }
  statement {
    # revision dispatches presign GET urls for the delivered cut's files; the
    # signed url inherits THIS role's permissions, scoped to the cut prefix
    sid       = "CutRead"
    actions   = ["s3:GetObject"]
    resources = ["${var.artifacts_bucket_arn}/orders/*"]
  }
  statement {
    sid       = "Page"
    actions   = ["sns:Publish"]
    resources = [var.alarm_topic_arn]
  }
}

resource "aws_iam_role_policy" "worker" {
  name   = "${var.name_prefix}-pipeline-policy"
  role   = aws_iam_role.worker.id
  policy = data.aws_iam_policy_document.worker.json
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/${var.name_prefix}-pipeline"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_lambda_function" "worker" {
  function_name    = "${var.name_prefix}-pipeline"
  role             = aws_iam_role.worker.arn
  runtime          = "nodejs20.x"
  handler          = "pipeline.handler"
  filename         = data.archive_file.worker.output_path
  source_code_hash = data.archive_file.worker.output_base64sha256
  # 60s, not 30: the moderation gate now screens the FULL brief and dossier in
  # chunks through the network layers (see lambda/moderation.mjs). The worst
  # legal case (a 200KB dossier, the putProfile cap) is ~26 chunks in 3 pooled
  # waves of one 5s vendor timeout each, ~15s, plus presigns and the dispatch
  # webhook. 30s left no headroom for that worst case; 60s does, and costs
  # nothing when unused (billed by actual duration).
  timeout          = 60
  memory_size      = 256
  # NOTE: no reserved_concurrent_executions — small/new accounts have a total
  # Lambda concurrency limit that a reservation would starve (must leave >= 10
  # unreserved). Build concurrency is paced by the Pipe (batch 1) + SFN retries;
  # when the account quota is raised (Service Quotas -> Lambda concurrent
  # executions), a reservation can return here as a hard cap.

  environment {
    variables = {
      TABLE_NAME       = var.table_name
      SSM_PREFIX       = local.ssm_prefix
      API_DOMAIN       = var.api_domain
      ALARM_TOPIC_ARN  = var.alarm_topic_arn
      SES_FROM         = var.ses_from
      APP_ORIGIN       = var.app_origin
      SES_CONFIG_SET   = var.ses_config_set
      ARTIFACTS_BUCKET = var.artifacts_bucket
    }
  }
  depends_on = [aws_cloudwatch_log_group.worker]
  tags       = var.tags
}

# ---------- state machine ----------
data "aws_iam_policy_document" "sfn_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "sfn" {
  name               = "${var.name_prefix}-build-sfn-role"
  assume_role_policy = data.aws_iam_policy_document.sfn_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy" "sfn" {
  name = "${var.name_prefix}-build-sfn-policy"
  role = aws_iam_role.sfn.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:InvokeFunction"]
      Resource = [aws_lambda_function.worker.arn]
    }]
  })
}

resource "aws_sfn_state_machine" "build" {
  name     = "${var.name_prefix}-build"
  role_arn = aws_iam_role.sfn.arn
  tags     = var.tags

  definition = jsonencode({
    Comment = "CineFolio order build: validate -> dispatch (task token) -> finalize; failures page a human."
    StartAt = "Unwrap"
    States = {
      # EventBridge Pipes delivers SQS batches as an ARRAY even at batch_size 1,
      # so execution input is [{orderId}] — normalize it once here.
      # (Manual test executions must also pass [{"orderId":"..."}].)
      Unwrap = {
        Type       = "Pass"
        Parameters = { "orderId.$" = "$[0].orderId" }
        Next       = "Validate"
      }
      Validate = {
        Type       = "Task"
        Resource   = aws_lambda_function.worker.arn
        Parameters = { action = "validate", "orderId.$" = "$.orderId" }
        ResultPath = "$.validate"
        # Two retriers, DELIBERATELY separate because they mean different things:
        #   - AWS Lambda service faults (throttle / transient service error) retry
        #     as before.
        #   - ModerationUnavailable is thrown by validate ONLY when a moderation
        #     vendor was unreachable (Creem fail-closed: timeout / 5xx) with NO
        #     confirmed content verdict. It is a TRANSIENT outage, not a rejection,
        #     so it must retry with backoff and re-screen. This resource is the
        #     function ARN (direct integration), so the thrown error's name
        #     propagates verbatim and ErrorEquals matches it by name. When these
        #     retries exhaust, the States.ALL Catch below routes to HumanReview
        #     (operator-recoverable) rather than InvalidNoop (terminal). A genuine
        #     content violation throws OrderInvalid instead and is caught first,
        #     so it still terminates at InvalidNoop and never retries.
        Retry = [
          { ErrorEquals = ["Lambda.ServiceException", "Lambda.TooManyRequestsException"], IntervalSeconds = 5, MaxAttempts = 2, BackoffRate = 2 },
          { ErrorEquals = ["ModerationUnavailable"], IntervalSeconds = 10, MaxAttempts = 3, BackoffRate = 2 },
        ]
        Catch = [
          { ErrorEquals = ["OrderInvalid"], Next = "InvalidNoop" },
          { ErrorEquals = ["States.ALL"], ResultPath = "$.error", Next = "HumanReview" },
        ]
        Next = "Dispatch"
      }
      Dispatch = {
        Type           = "Task"
        Resource       = "arn:aws:states:::lambda:invoke.waitForTaskToken"
        TimeoutSeconds = 1800 # the 25-min build promise + margin
        Parameters = {
          FunctionName = aws_lambda_function.worker.arn
          Payload      = { action = "dispatch", "orderId.$" = "$.orderId", "taskToken.$" = "$$.Task.Token" }
        }
        ResultPath = "$.cut"
        # States.TaskFailed is a wildcard for any thrown error except States.Timeout,
        # so the dispatch-time dossier screen's ModerationUnavailable (transient
        # vendor outage) already retries here with backoff and, on exhaustion, the
        # States.ALL Catch parks the order in HumanReview (recoverable) rather than
        # a terminal reject. A dossier content violation throws OrderInvalid, which
        # also matches States.TaskFailed; it is rejected in-lambda (status flip +
        # credit refund) before the throw, so the human_review landing is just the
        # operator notice, and no unscreened dossier ever reaches the model.
        Retry      = [{ ErrorEquals = ["States.Timeout", "States.TaskFailed"], IntervalSeconds = 60, MaxAttempts = 2, BackoffRate = 2 }]
        Catch      = [{ ErrorEquals = ["States.ALL"], ResultPath = "$.error", Next = "HumanReview" }]
        Next       = "Finalize"
      }
      Finalize = {
        Type       = "Task"
        Resource   = aws_lambda_function.worker.arn
        Parameters = { action = "finalize", "orderId.$" = "$.orderId", "cutKey.$" = "$.cut.cutKey" }
        Retry      = [{ ErrorEquals = ["States.ALL"], IntervalSeconds = 10, MaxAttempts = 2, BackoffRate = 2 }]
        Catch      = [{ ErrorEquals = ["States.ALL"], ResultPath = "$.error", Next = "HumanReview" }]
        End        = true
      }
      HumanReview = {
        Type       = "Task"
        Resource   = aws_lambda_function.worker.arn
        Parameters = { action = "human_review", "orderId.$" = "$.orderId", "cause.$" = "States.JsonToString($.error)" }
        Retry      = [{ ErrorEquals = ["States.ALL"], IntervalSeconds = 10, MaxAttempts = 2, BackoffRate = 2 }]
        End        = true
      }
      InvalidNoop = { Type = "Succeed" }
    }
  })
}

# ---------- EventBridge Pipe: SQS -> Step Functions ----------
data "aws_iam_policy_document" "pipe_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["pipes.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "pipe" {
  name               = "${var.name_prefix}-orders-pipe-role"
  assume_role_policy = data.aws_iam_policy_document.pipe_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy" "pipe" {
  name = "${var.name_prefix}-orders-pipe-policy"
  role = aws_iam_role.pipe.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"], Resource = [aws_sqs_queue.orders.arn] },
      { Effect = "Allow", Action = ["states:StartExecution"], Resource = [aws_sfn_state_machine.build.arn] },
    ]
  })
}

resource "aws_pipes_pipe" "orders" {
  name     = "${var.name_prefix}-orders-to-build"
  role_arn = aws_iam_role.pipe.arn
  source   = aws_sqs_queue.orders.arn
  target   = aws_sfn_state_machine.build.arn

  source_parameters {
    sqs_queue_parameters {
      batch_size = 1
    }
  }
  target_parameters {
    step_function_state_machine_parameters {
      invocation_type = "FIRE_AND_FORGET"
    }
    input_template = "{\"orderId\": <$.body.orderId>}"
  }
  tags = var.tags
}

output "orders_queue_url" { value = aws_sqs_queue.orders.id }
output "orders_queue_arn" { value = aws_sqs_queue.orders.arn }
output "orders_queue_name" { value = aws_sqs_queue.orders.name }
output "dlq_arn" { value = aws_sqs_queue.dlq.arn }
output "dlq_name" { value = aws_sqs_queue.dlq.name }
output "state_machine_arn" { value = aws_sfn_state_machine.build.arn }
output "state_machine_name" { value = aws_sfn_state_machine.build.name }
output "worker_function_name" { value = aws_lambda_function.worker.function_name }
