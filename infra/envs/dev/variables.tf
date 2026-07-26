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

# Custom domain for hosted client sites: cinefolio.dev (purchased Jul 2026,
# DNS at Cloudflare). Two-step bring-up because CloudFront refuses a PENDING
# cert: apply once (cert created, validation records in outputs), add the
# validation CNAME at Cloudflare, wait for ISSUED, then flip this to true
# and apply again to attach the *.cinefolio.dev alias.
variable "enable_custom_domain" {
  type    = bool
  default = false
}
variable "sites_domain" {
  type    = string
  default = "cinefolio.dev"
}

# API CORS. Pinned to the real app origins: a wildcard let any site drive the
# API with a stolen token. Both apex and www are live (both 200), and the SPA is
# served at cinefolio.dev, so these two cover every legitimate browser origin.
# If a preview or staging origin is ever added, extend this list rather than
# widening to "*".
variable "api_cors_origins" {
  type    = list(string)
  default = ["https://cinefolio.dev", "https://www.cinefolio.dev"]
}
