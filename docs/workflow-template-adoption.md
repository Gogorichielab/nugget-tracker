# Organization workflow template adoption — issue #68

Source: [Gogorichielab/.github PR #2](https://github.com/Gogorichielab/.github/pull/2), merged September 6, 2026. Templates: [Azure Static Web Apps](https://github.com/Gogorichielab/.github/blob/main/workflow-templates/azure-static-web-apps.yml) and [stale maintenance](https://github.com/Gogorichielab/.github/blob/main/workflow-templates/stale-maintenance.yml).

The existing workflow files were adapted **in place** to avoid overlapping deployment or stale-maintenance jobs. These are copied templates, not reusable workflows. Updates in the organization template will not propagate automatically.

## Repository-specific adaptations

- Deployment keeps `main` push and PR opened/synchronize/reopened/closed events, the existing `build_and_deploy_job` and `close_pull_request_job` names, `src` app, `api` Functions, empty output directory, and `skip_app_build: true`.
- The existing `AZURE_STATIC_WEB_APPS_API_TOKEN_VICTORIOUS_CLIFF_0A4B70B0F` secret is used for **both** upload and close. No secrets are copied or renamed.
- The Cloudflare beacon substitution is retained, using a Python literal string replacement instead of inserting the token into a `sed` expression.
- Checkout and deployment actions use pinned upstream commit SHAs from the organization templates; checkout keeps submodules enabled.
- Internal PR previews require repository variable `SWA_ENABLE_PREVIEWS=true` and a reviewed `preview` environment; production deploys use the `production` environment. Fork and Dependabot PRs cannot receive deployment secrets. The existing GitHub Actions workflow does **not** provide secret-free CI for untrusted PRs; add that separately if required.
- Stale schedule stays Tuesday 08:28 UTC. Thresholds stay issues 60+7 days, PRs 30+7 days, with existing labels and messages. `workflow_dispatch` defaults to dry-run. Scheduled writes require `STALE_AUTOMATION_ENABLED=true` after dry-run review.
- Existing branch cleanup workflows and `mlb-sync-nightly.yml` are unchanged.

## Required checks before enabling/merging

1. Verify the enabled/disabled state of both workflows under **Actions**. This integration cannot confirm it; do not re-enable intentionally disabled workflows.
2. Configure and review `production` and `preview` environments, their branch policies, secret access and approval gates. **Important:** `production` must permit `main`; `preview` must permit PR deployment refs.
3. Confirm the existing deployment token is accessible in both environments (via repository or environment secret), and that `CLOUDFLAREKEY` is available for trusted deployments. Do not print secret values.
4. Run `actionlint .github/workflows/*.yml` and repository API tests (`cd api && npm test`) on this branch. These have **not** been executed by the connector.
5. Dispatch Maintenance with `dry_run=true`, review stale candidates, and only then set `STALE_AUTOMATION_ENABLED=true` if the schedule should resume. A manual `dry_run=false` run **does mutate** issues/PRs.
6. After reviewing preview permissions, set `SWA_ENABLE_PREVIEWS=true`, test trusted PR preview creation and close. Check any previously existing previews before disabling or changing preview policy.
7. Verify a `main` deployment keeps the Cloudflare beacon, public pages, and `/api/events` route functional. Inspect deployment job logs and required checks.
8. Keep this PR separate from the season-finale design PR; do not merge until production and preview checks pass.

## Rollback

Revert the adoption commits to restore the prior workflows. Reconcile `SWA_ENABLE_PREVIEWS`, `STALE_AUTOMATION_ENABLED`, and environment policies separately. Do not delete SWA resources, modify token values, or loosen branch protections.

## Validation record

- Static comparison of source templates and existing workflows: performed during authoring.
- GitHub Actions runtime workflow state: **not verified** (connector endpoint unavailable).
- `actionlint`, Node tests, stale dry-run, preview open/close, and production deployment: **not run**. Record URLs and results in the PR before merge.
