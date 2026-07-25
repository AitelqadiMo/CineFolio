# ci-pending: CI workflows awaiting manual installation

These two GitHub Actions workflows are the CI safety net for the repo. They
could NOT be committed to their real home under `.github/workflows/` because
the connected GitHub integration token lacks the `workflow` OAuth scope.
Pushing any file under `.github/workflows/` is rejected by the GitHub API with:

    403 "Resource not accessible by integration" (failed to create tree)

Everything else in this PR (README truth pass, dead-code removal) pushed fine;
only the `.github/workflows/` path is blocked.

## Files

- `test.yml`  -> install to `.github/workflows/test.yml`
  Runs the `node:test` route suite (44 tests) on every push and PR. Node 20,
  no external services. Verified green locally (44/44).

- `infra.yml` -> install to `.github/workflows/infra.yml`
  Terraform plan on PRs touching `infra/**`, apply on pushes to `main`, via the
  GitHub OIDC deploy role (no long-lived keys). Successor to
  `infra/ci/deploy.yml`, which is left in place until this one is installed.

## Install (one manual step, by a human/token WITH the workflow scope)

    git mv ci-pending/test.yml  .github/workflows/test.yml
    git mv ci-pending/infra.yml .github/workflows/infra.yml
    git rm infra/ci/deploy.yml            # superseded by infra.yml
    rmdir ci-pending
    git commit -m "ci: install test and infra workflows"
    git push

That is the whole safety net live. Until then, the workflow content is final
and reviewed here.
