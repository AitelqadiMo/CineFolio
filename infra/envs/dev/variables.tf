variable "project" {
  type    = string
  default = "cinefolio"
}
variable "env" {
  type    = string
  default = "dev"
}
variable "region" {
  type    = string
  default = "eu-central-1"
}
variable "app_origins" {
  type        = list(string)
  description = "Allowed web origins (CORS, Cognito callbacks)"
  default     = ["http://localhost:3000", "https://cine-folio.vercel.app"]
}
variable "github_owner" {
  type    = string
  default = "AitelqadiMo"
}
variable "github_repo" {
  type    = string
  default = "CineFolio"
}
variable "alarm_email" {
  type        = string
  description = "Where budget + alarm notifications go"
  default     = "aitelqadi22@gmail.com"
}
variable "monthly_budget_usd" {
  type    = number
  default = 50
}

# Custom domain for hosted client sites — keep false until cinefolio.site DNS is delegated.
variable "enable_custom_domain" {
  type    = bool
  default = false
}
variable "sites_domain" {
  type    = string
  default = ""
}

# API CORS. Dev: "*" (SPA distribution domain only exists after first apply).
# Prod: pin to the real app origins.
variable "api_cors_origins" {
  type    = list(string)
  default = ["*"]
}
