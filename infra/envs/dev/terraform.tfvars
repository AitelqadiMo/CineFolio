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
  "https://cine-folio.vercel.app",
  "https://d2f6618tf0eldv.cloudfront.net", # the Studio Console app shell
]

# cinefolio.dev purchased Jul 2026 (Cloudflare Registrar, DNS at Cloudflare).
# Two-step bring-up, because CloudFront refuses a PENDING certificate:
#   apply 1: cert is created; add the validation CNAME from
#            `terraform output sites_cert_validation` at Cloudflare (DNS only)
#   apply 2: once the cert reads ISSUED, flip enable_custom_domain = true
#            and re-apply; then add the wildcard CNAME
#            *  ->  d3ssuqn0z03akv.cloudfront.net   (DNS only)
enable_custom_domain = false
sites_domain         = "cinefolio.dev"
