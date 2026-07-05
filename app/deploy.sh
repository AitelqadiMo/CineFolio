#!/usr/bin/env bash
# Deploy the SPA to the app-shell bucket + invalidate CloudFront.
# Usage: ./deploy.sh   (run from app/, needs AWS creds + terraform outputs in ../infra/envs/dev)
set -euo pipefail
DEV=../infra/envs/dev
BUCKET=$(terraform -chdir=$DEV output -raw app_bucket)
DIST=$(terraform -chdir=$DEV output -raw app_distribution_id)
echo "==> building"
npm run build
echo "==> syncing to s3://$BUCKET"
aws s3 sync dist/ "s3://$BUCKET" --delete
echo "==> invalidating $DIST"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" >/dev/null
echo "==> live at: https://$(terraform -chdir=$DEV output -raw app_url | sed 's|https://||')"
