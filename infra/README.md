# CineFolio Infrastructure (dev — eu-central-1)

Terraform for the CineFolio platform, phase 2. Serverless-first AWS: Cognito auth,
DynamoDB + S3 data, API Gateway + Lambda, and a single CloudFront distribution that
multi-tenants every client site from one S3 bucket via an edge slug router.

> Full rationale is in the SDLC & Architecture PDF. This README is the runbook.

## Layout

```
infra/
├── bootstrap/          # run ONCE — creates the S3 remote-state bucket (local state)
├── modules/
│   ├── kms/            # customer-managed key for data-at-rest
│   ├── data/           # DynamoDB single-table + S3 (assets, published, artifacts)
│   ├── identity/       # Cognito user pool + SPA client + groups
│   ├── api/            # Lambda (Node 20) + API Gateway HTTP API + JWT authorizer
│   ├── hosting/        # CloudFront + OAC + slug-router CloudFront Function
│   ├── pipeline/       # SQS orders queue + DLQ (Step Functions/Fargate land in P3)
│   ├── cicd/           # GitHub Actions OIDC provider + deploy role
│   └── observability/  # SNS alarm topic + monthly cost budget
├── envs/dev/           # the dev environment — wires modules together
├── ci/deploy.yml       # GitHub Actions workflow (move to .github/workflows/infra.yml)
└── Makefile
```

## Prerequisites

- Terraform >= 1.10 (uses S3-native state locking, no DynamoDB lock table)
- AWS credentials for account `975050163168` in your shell
  (`aws configure` or `AWS_PROFILE`). **Prefer a profile over exporting keys.**

## First deploy

```bash
# 1) create the remote-state bucket (once)
cd infra && make bootstrap

# 2) init dev against that bucket, then review + apply
make init
make plan      # read this carefully
make apply
```

Terraform prints the live outputs: API endpoint, Cognito IDs, and the CloudFront
domain for hosted sites.

## Smoke test after apply

```bash
cd envs/dev
curl "$(terraform output -raw api_endpoint)/health"    # -> {"ok":true,...}
# publish a demo client site into the multi-tenant bucket:
echo '<!doctype html><h1>Hello from CineFolio</h1>' > index.html
aws s3 cp index.html "s3://$(terraform output -raw published_bucket)/sites/_demo/index.html"
open "https://$(terraform output -raw sites_cdn_domain)/"   # serves /sites/_demo/
```

## Turning on custom domains (later)

Once `cinefolio.site` is registered and its DNS delegated to Route 53:

1. Create a **us-east-1** wildcard ACM cert for `*.cinefolio.site` (DNS-validated).
2. In `envs/dev/terraform.tfvars` set `enable_custom_domain = true`,
   `sites_domain = "cinefolio.site"`, and pass the cert ARN.
3. `make apply`, then point `*.cinefolio.site` at the CloudFront distribution.

## CI/CD

`ci/deploy.yml` authenticates with the OIDC role this stack creates
(`cinefolio-dev-gha-deploy`) — no long-lived keys in GitHub. Move it to
`.github/workflows/infra.yml` (the connected app can't write that path for you).

## Naming & tags

Resources are prefixed `cinefolio-dev-*`; globally-unique S3 buckets append the
account id. Everything carries `Project`, `Environment`, `ManagedBy`, `Owner` tags.
