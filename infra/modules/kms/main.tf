# KMS — one customer-managed key for data-at-rest across the platform (dev)
variable "name_prefix" { type = string }
variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_kms_key" "main" {
  description             = "${var.name_prefix} platform data key"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  tags                    = var.tags
}

resource "aws_kms_alias" "main" {
  name          = "alias/${var.name_prefix}"
  target_key_id = aws_kms_key.main.key_id
}

output "key_arn" { value = aws_kms_key.main.arn }
output "key_id" { value = aws_kms_key.main.key_id }
