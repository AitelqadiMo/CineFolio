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
  description = "Allowed web origins (CORS, Cognito callbacks). MUST include the app-shell CDN domain or browser media uploads are CORS-blocked and fall back to inline data URLs."
  default = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://cine-folio.vercel.app",
    "https://d2f6618tf0eldv.cloudfront.net", # the Studio Console app shell
  ]
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
