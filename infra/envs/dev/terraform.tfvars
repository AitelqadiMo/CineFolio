# CineFolio dev — eu-central-1
project     = "cinefolio"
env         = "dev"
region      = "eu-central-1"
alarm_email = "aitelqadi22@gmail.com"

# MUST include the console's own origin or browser media uploads are
# CORS-blocked and silently degrade to the API proxy fallback.
app_origins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://d2f6618tf0eldv.cloudfront.net", # the app shell's native domain
  "https://cinefolio.dev",                 # apex: landing + console
  "https://www.cinefolio.dev",
]

# cinefolio.dev purchased Jul 2026 (Cloudflare Registrar, DNS at Cloudflare).
# Two-step bring-up, because CloudFront refuses a PENDING certificate:
#   apply 1: cert is created; add the validation CNAME from
#            `terraform output sites_cert_validation` at Cloudflare (DNS only)
#   apply 2: once the cert reads ISSUED, flip enable_custom_domain = true
#            and re-apply; then add the wildcard CNAME
#            *  ->  d3ssuqn0z03akv.cloudfront.net   (DNS only)
enable_custom_domain = true # cert ISSUED and *.cinefolio.dev live since Jul 8 2026
sites_domain         = "cinefolio.dev"

# Studio inbox: receives via Cloudflare Email Routing (info@ -> founder's
# mailbox), sends via SES. Setting this creates the SES identity above and
# turns on contact-form email notifications.
ses_from = "info@cinefolio.dev"

# Email CTAs land on the real console, not the raw CloudFront domain.
app_origin = "https://www.cinefolio.dev"

