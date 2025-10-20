# Deployment Playbook

The repository now splits CI/CD responsibilities by domain. This document captures the trigger logic, required secrets, and operational guidance for each workflow.

## Backend Service

- **CI**: `.github/workflows/backend-ci.yml`
  - Triggered on push/PR to `dev` or `main` touching `src/**`, `scripts/**`, or requirements files.
  - Runs linting via `ruff` and `black`, executes `pytest` when `tests/` is present, and publishes `backend-src` artifact (`dist/backend-src.tgz`, `dist/__version.txt`).
- **JP Deployment**: `.github/workflows/deploy-backend-jp.yml`
  - Launches automatically when `backend-ci` succeeds or manually via workflow dispatch (`artifact_run_id` input).
  - Downloads the CI artifact, uploads it to the JP host, installs Python dependencies if `requirements.txt` exists, runs optional `scripts/migrate.sh`, updates the `current` symlink, restarts the configured systemd service, and performs an HTTP health check with rollback support.
- **US Deployment**: `.github/workflows/deploy-backend-us.yml`
  - Mirrors the JP deployment pipeline but targets the US backend infrastructure.

Required backend secrets (configure under *Settings → Secrets and variables → Actions*):

| Environment | Secret | Purpose |
|-------------|--------|---------|
| JP | `JP_SSH_KEY` | Private key with deploy rights |
| JP | `JP_KNOWN_HOSTS` | Optional known_hosts entries |
| JP | `JP_HOST`, `JP_PORT`, `JP_USER` | SSH target |
| JP | `JP_BACKEND_BASE` | Base directory containing `releases/`, `current`, and `venv` |
| JP | `JP_BACKEND_SERVICE` | systemd service name to restart/reload |
| JP | `JP_BACKEND_HEALTHCHECK` | Optional HTTP endpoint for smoke test |
| US | `US_SSH_KEY` | Backend deploy key for US host |
| US | `US_KNOWN_HOSTS` | Optional known_hosts entries |
| US | `US_HOST`, `US_PORT`, `US_USER` | SSH target |
| US | `US_BACKEND_BASE` | Base directory for backend releases |
| US | `US_BACKEND_SERVICE` | systemd service to restart/reload |
| US | `US_BACKEND_HEALTHCHECK` | Optional HTTP endpoint |

## US Frontend

- **CI**: `.github/workflows/frontend-ci.yml`
  - Triggered on push/PR affecting `packages/us-frontend/**` or the root `package*.json`.
  - Installs dependencies with Node 20, attempts lint/tests when scripts exist, builds the Vite bundle, and uploads `us-frontend-dist` artifact (`frontend-dist.tgz`, `__version.txt`).
- **Deployment**: `.github/workflows/deploy-frontend-us.yml`
  - Runs after a successful `frontend-ci` or manually with an `artifact_run_id`.
  - Ships the artifact to the US web host, rotates the `current` symlink, optionally reloads nginx (or another systemd service), and runs a configurable HTTP health check with rollback protection.

Frontend secrets:

| Secret | Purpose |
|--------|---------|
| `US_WEB_SSH_KEY` | SSH key for web deploys |
| `US_WEB_KNOWN_HOSTS` | Optional known_hosts entries |
| `US_WEB_HOST`, `US_WEB_PORT`, `US_WEB_USER` | SSH target |
| `US_WEB_BASE` | Release root on the web server |
| `US_WEB_SERVICE` | Service (nginx) to reload/restart |
| `US_WEB_HEALTHCHECK` | Optional smoke-test endpoint |

## Smart Contracts

- **CI**: `.github/workflows/contracts-ci.yml`
  - Triggered on push/PR touching `contracts/**`.
  - Uses `py-solc-x` to install Solidity `0.8.20`, compiles every `.sol` file, and uploads `contract-artifacts` containing ABI/bin outputs plus a combined JSON report.
  - Extend this pipeline with static analyzers (e.g. `slither`) or deployment scripts as the Solidity codebase grows.

## Operational Notes

- All deployment workflows use `workflow_run` triggers to prevent untested code from reaching servers. Manual overrides are available through `workflow_dispatch` with an explicit `artifact_run_id`.
- Deployments upload versioned tarballs into `$BASE/releases/<release-name>` on remote hosts and maintain the `current` symlink. Previous `current` targets are retained for manual rollback.
- Health checks are optional but recommended. Provide an HTTPS endpoint returning a non-error status; failures automatically restore the prior release.
- Artifacts include a `__version.txt` detailing the originating commit (short SHA). This file is copied into each release for auditing.
- Concurrency groups (`deploy-backend-jp`, `deploy-backend-us`, `deploy-frontend-us`) ensure only one deployment per environment runs at a time.
- When adding new environments, copy the corresponding workflow and adjust the secrets and concurrency group. Keep permissions minimal (`contents: read`) unless additional scopes are required.

For further customization (database migrations, cache warming, monitoring hooks), extend the remote shell sections in the deployment workflows or wrap them in scripts checked into `scripts/` for reuse.
