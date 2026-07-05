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

# ---------- pipeline worker Lambda ----------
data "archive_file" "worker" {
  type        = "zip"
  source_dir  = "${path.module}/lambda"
  output_path = "${path.module}/.build/pipeline.zip"
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
  timeout          = 30
  memory_size      = 256
  # crude global build-concurrency cap until a Map-based scheduler is needed
  reserved_concurrent_executions = 10

  environment {
    variables = {
      TABLE_NAME      = var.table_name
      SSM_PREFIX      = local.ssm_prefix
      API_DOMAIN      = var.api_domain
      ALARM_TOPIC_ARN = var.alarm_topic_arn
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
    StartAt = "Validate"
    States = {
      Validate = {
        Type       = "Task"
        Resource   = aws_lambda_function.worker.arn
        Parameters = { action = "validate", "orderId.$" = "$.orderId" }
        ResultPath = "$.validate"
        Retry      = [{ ErrorEquals = ["Lambda.ServiceException", "Lambda.TooManyRequestsException"], IntervalSeconds = 5, MaxAttempts = 2, BackoffRate = 2 }]
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
