# OBSERVABILITY — alarm topic, cost budget, pipeline/API alarms, ops dashboard.
variable "name_prefix" { type = string }
variable "alarm_email" { type = string }
variable "monthly_budget_usd" {
  type    = number
  default = 50
}
# phase-3 wiring (pass "" to skip alarm creation during bootstrap ordering)
variable "api_id" {
  type    = string
  default = ""
}
variable "api_function_name" {
  type    = string
  default = ""
}
variable "pipeline_function_name" {
  type    = string
  default = ""
}
variable "orders_queue_name" {
  type    = string
  default = ""
}
variable "dlq_name" {
  type    = string
  default = ""
}
variable "state_machine_arn" {
  type    = string
  default = ""
}
variable "tags" {
  type    = map(string)
  default = {}
}

data "aws_region" "current" {}

resource "aws_sns_topic" "alarms" {
  name = "${var.name_prefix}-alarms"
  tags = var.tags
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_budgets_budget" "monthly" {
  name         = "${var.name_prefix}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 50
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alarm_email]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alarm_email]
  }
}

# ---------- the alarms that matter ----------
locals {
  wired = var.dlq_name != "" && var.api_id != "" && var.state_machine_arn != ""
}

# A dead-lettered order is a lost customer promise. Zero tolerance.
resource "aws_cloudwatch_metric_alarm" "dlq" {
  count               = local.wired ? 1 : 0
  alarm_name          = "${var.name_prefix}-orders-dlq-not-empty"
  alarm_description   = "An order hit the dead-letter queue. Someone's premiere is stuck."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = var.dlq_name }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  count               = local.wired ? 1 : 0
  alarm_name          = "${var.name_prefix}-api-5xx"
  alarm_description   = "API 5xx spike (>=5 in 5 minutes)."
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  dimensions          = { ApiId = var.api_id }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "sfn_failed" {
  count               = local.wired ? 1 : 0
  alarm_name          = "${var.name_prefix}-build-executions-failed"
  alarm_description   = "A build state machine execution FAILED outright (should end in human_review instead)."
  namespace           = "AWS/States"
  metric_name         = "ExecutionsFailed"
  dimensions          = { StateMachineArn = var.state_machine_arn }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "api_errors" {
  count               = local.wired ? 1 : 0
  alarm_name          = "${var.name_prefix}-api-lambda-errors"
  alarm_description   = "API Lambda threw (>=5 errors in 5 minutes)."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = var.api_function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"
  tags                = var.tags
}

# ---------- ops dashboard ----------
resource "aws_cloudwatch_dashboard" "ops" {
  count          = local.wired ? 1 : 0
  dashboard_name = "${var.name_prefix}-ops"
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", x = 0, y = 0, width = 12, height = 6,
        properties = {
          title = "API — requests, 4xx, 5xx", region = data.aws_region.current.name, stat = "Sum", period = 300,
          metrics = [
            ["AWS/ApiGateway", "Count", "ApiId", var.api_id],
            [".", "4xx", ".", "."],
            [".", "5xx", ".", "."],
          ]
        }
      },
      {
        type = "metric", x = 12, y = 0, width = 12, height = 6,
        properties = {
          title   = "API — p95 latency (ms)", region = data.aws_region.current.name, stat = "p95", period = 300,
          metrics = [["AWS/ApiGateway", "Latency", "ApiId", var.api_id]]
        }
      },
      {
        type = "metric", x = 0, y = 6, width = 12, height = 6,
        properties = {
          title = "Build pipeline — executions", region = data.aws_region.current.name, stat = "Sum", period = 300,
          metrics = [
            ["AWS/States", "ExecutionsStarted", "StateMachineArn", var.state_machine_arn],
            [".", "ExecutionsSucceeded", ".", "."],
            [".", "ExecutionsFailed", ".", "."],
            [".", "ExecutionsTimedOut", ".", "."],
          ]
        }
      },
      {
        type = "metric", x = 12, y = 6, width = 12, height = 6,
        properties = {
          title = "Orders queue + DLQ depth", region = data.aws_region.current.name, stat = "Maximum", period = 60,
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.orders_queue_name],
            [".", ".", ".", var.dlq_name, { color = "#d62728" }],
          ]
        }
      },
      {
        type = "metric", x = 0, y = 12, width = 24, height = 6,
        properties = {
          title = "Lambdas — errors + duration p95", region = data.aws_region.current.name, period = 300,
          metrics = [
            ["AWS/Lambda", "Errors", "FunctionName", var.api_function_name, { stat = "Sum" }],
            [".", ".", ".", var.pipeline_function_name, { stat = "Sum" }],
            [".", "Duration", ".", var.api_function_name, { stat = "p95", yAxis = "right" }],
            [".", ".", ".", var.pipeline_function_name, { stat = "p95", yAxis = "right" }],
          ]
        }
      },
    ]
  })
}

output "alarms_topic_arn" { value = aws_sns_topic.alarms.arn }
output "dashboard_name" { value = local.wired ? aws_cloudwatch_dashboard.ops[0].dashboard_name : "" }
