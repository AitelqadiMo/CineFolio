# CineFolio infra — dev convenience targets
# Prereqs: terraform >= 1.10, AWS creds for account 975050163168 in your shell/profile.
ACCOUNT_ID ?= 975050163168
STATE_BUCKET = cinefolio-dev-tfstate-$(ACCOUNT_ID)
DEV = envs/dev

.PHONY: bootstrap init plan apply destroy fmt validate output

## one-time: create the remote-state bucket (local state)
bootstrap:
	cd bootstrap && terraform init && terraform apply

## init dev against the remote state bucket
init:
	cd $(DEV) && terraform init -backend-config="bucket=$(STATE_BUCKET)"

plan:
	cd $(DEV) && terraform plan

apply:
	cd $(DEV) && terraform apply

output:
	cd $(DEV) && terraform output

fmt:
	terraform fmt -recursive

validate:
	cd $(DEV) && terraform validate

destroy:
	cd $(DEV) && terraform destroy
