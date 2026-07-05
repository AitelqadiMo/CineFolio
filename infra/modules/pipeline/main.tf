# PIPELINE — async production queue foundation (Step Functions + Fargate land in P3)
variable "name_prefix" { type = string }
variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_sqs_queue" "dlq" {
  name                      = "${var.name_prefix}-orders-dlq"
  message_retention_seconds = 1209600 # 14 days
  sqs_managed_sse_enabled   = true
  tags                      = var.tags
}

resource "aws_sqs_queue" "orders" {
  name                       = "${var.name_prefix}-orders"
  visibility_timeout_seconds = 900 # matches longest build step
  message_retention_seconds  = 345600
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })
  tags = var.tags
}

output "orders_queue_url" { value = aws_sqs_queue.orders.id }
output "orders_queue_arn" { value = aws_sqs_queue.orders.arn }
output "dlq_arn" { value = aws_sqs_queue.dlq.arn }
