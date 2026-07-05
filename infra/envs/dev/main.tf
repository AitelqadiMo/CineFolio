# CineFolio — DEV environment (eu-central-1). Wires all modules together.
terraform {
  required_version = ">= 1.10.0"
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 5.60" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }

  # Remote state — bucket is created by ../../bootstrap (run that first).
  # Fill the bucket name after bootstrap, then `terraform init`.
  backend "s3" {
    key          = "dev/terraform.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true # S3-native locking (Terraform >= 1.10), no DynamoDB table
    # bucket = "cinefolio-dev-tfstate-<ACCOUNT_ID>"  <-- set via `terraform init -backend-config=...`
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project     = var.project
      Environment = var.env
      ManagedBy   = "terraform"
      Owner       = "founder"
    }
  }
}

# CloudFront ACM certs must live in us-east-1 (used only when custom domain is enabled)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = {
      Project     = var.project
      Environment = var.env
      ManagedBy   = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  name_prefix = "${var.project}-${var.env}" # cinefolio-dev
  tags        = { Project = var.project, Environment = var.env }
}

module "kms" {
  source      = "../../modules/kms"
  name_prefix = local.name_prefix
  tags        = local.tags
}

module "data" {
  source               = "../../modules/data"
  name_prefix          = local.name_prefix
  account_id           = data.aws_caller_identity.current.account_id
  kms_key_arn          = module.kms.key_arn
  cors_allowed_origins = var.app_origins
  tags                 = local.tags
}

module "identity" {
  source        = "../../modules/identity"
  name_prefix   = local.name_prefix
  account_id    = data.aws_caller_identity.current.account_id
  callback_urls = [for o in var.app_origins : "${o}/callback"]
  logout_urls   = var.app_origins
  tags          = local.tags
}

module "api" {
  source               = "../../modules/api"
  name_prefix          = local.name_prefix
  app_env              = var.env
  table_name           = module.data.table_name
  table_arn            = module.data.table_arn
  assets_bucket        = module.data.assets_bucket
  artifacts_bucket     = module.data.artifacts_bucket
  published_bucket     = module.data.published_bucket
  kms_key_arn          = module.kms.key_arn
  cognito_issuer       = module.identity.issuer
  cognito_client_id    = module.identity.client_id
  orders_queue_url     = module.pipeline.orders_queue_url
  orders_queue_arn     = module.pipeline.orders_queue_arn
  kvs_arn              = module.hosting.kvs_arn
  distribution_id      = module.hosting.distribution_id
  cdn_domain           = module.hosting.distribution_domain
  cors_allowed_origins = var.api_cors_origins # "*" in dev: app CF domain is minted after first apply. Pin in prod.
  tags                 = local.tags
}

module "hosting" {
  source                           = "../../modules/hosting"
  name_prefix                      = local.name_prefix
  published_bucket                 = module.data.published_bucket
  published_bucket_arn             = module.data.published_bucket_arn
  published_bucket_regional_domain = module.data.published_bucket_regional_domain
  enable_custom_domain             = var.enable_custom_domain
  sites_domain                     = var.sites_domain
  tags                             = local.tags
}

module "appshell" {
  source      = "../../modules/appshell"
  name_prefix = local.name_prefix
  account_id  = data.aws_caller_identity.current.account_id
  kms_key_arn = module.kms.key_arn
  tags        = local.tags
}

module "pipeline" {
  source      = "../../modules/pipeline"
  name_prefix = local.name_prefix
  tags        = local.tags
}

module "cicd" {
  source       = "../../modules/cicd"
  name_prefix  = local.name_prefix
  github_owner = var.github_owner
  github_repo  = var.github_repo
  tags         = local.tags
}

module "observability" {
  source             = "../../modules/observability"
  name_prefix        = local.name_prefix
  alarm_email        = var.alarm_email
  monthly_budget_usd = var.monthly_budget_usd
  tags               = local.tags
}

# ---------- outputs ----------
output "app_url" { value = "https://${module.appshell.app_cdn_domain}" }
output "app_bucket" { value = module.appshell.app_bucket }
output "app_distribution_id" { value = module.appshell.app_distribution_id }
output "api_endpoint" { value = module.api.api_endpoint }
output "cognito_user_pool_id" { value = module.identity.user_pool_id }
output "cognito_client_id" { value = module.identity.client_id }
output "cognito_hosted_ui" { value = module.identity.hosted_ui_domain }
output "sites_cdn_domain" { value = module.hosting.distribution_domain }
output "dynamodb_table" { value = module.data.table_name }
output "assets_bucket" { value = module.data.assets_bucket }
output "published_bucket" { value = module.data.published_bucket }
output "orders_queue_url" { value = module.pipeline.orders_queue_url }
output "github_deploy_role_arn" { value = module.cicd.deploy_role_arn }
