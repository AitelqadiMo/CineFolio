# CineFolio dev — eu-central-1
project     = "cinefolio"
env         = "dev"
region      = "eu-central-1"
alarm_email = "aitelqadi22@gmail.com"

app_origins = [
  "http://localhost:3000",
  "https://cine-folio.vercel.app",
]

# Client-site hosting starts on the native CloudFront domain.
# When cinefolio.site is registered + delegated to Route 53:
#   1) create a us-east-1 wildcard ACM cert for *.cinefolio.site
#   2) set the two lines below and re-apply
enable_custom_domain = false
sites_domain         = ""
