# Production Deployment Checklist (v1.0.0)

Last updated: 28 Feb 2026 (IST)

## Pre-deploy

- [ ] `main` is green on required checks:
  - `lint-test-typecheck`
  - `CodeRabbit`
  - `Greptile Review`
  - `GitGuardian Security Checks`
  - `trigger-coderabbit-review`
- [ ] All PR review threads are resolved.
- [ ] `npm run env:check` passes in deployment environment.
- [ ] Neon `DATABASE_URL` points to production branch/database.
- [ ] Required OAuth and email provider env vars are present.
- [ ] GitHub Actions deploy workflow is enabled:
  - `.github/workflows/deploy-production.yml`
- [ ] Required GitHub repository secrets are configured:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
- [ ] Optional GitHub repository variables reviewed:
  - `CLOUDFLARE_PAGES_PROJECT` (default: `opencalendly-web`)
  - `CLOUDFLARE_PAGES_PRODUCTION_BRANCH` (default: `main`)
- [ ] Porkbun URL forwarding is disabled for `opencalendly.com`/`www`.
- [ ] Domain wiring doc has been applied: `docs/CLOUDFLARE_DOMAIN_SETUP.md`.

## Database and schema

- [ ] Apply committed migrations only (do not generate new migrations during deploy):
  - `npm run db:migrate`
- [ ] Confirm there are no uncommitted schema/migration changes before deploy.
- [ ] Confirm migration journal updated as expected.
- [ ] Validate critical tables exist (bookings, action tokens, idempotency, webhooks, calendar writeback).

## API deploy (Cloudflare Worker)

- [ ] Deploy API worker with current config/bindings (automated from GitHub Actions on `main` push, or manually if needed).
- [ ] Production route is active: `api.opencalendly.com/*`.
- [ ] Confirm Hyperdrive binding points to production Neon connection.
- [ ] Confirm secrets are set in Worker environment:
  - `DATABASE_URL`, `SESSION_SECRET`, provider secrets, `RESEND_API_KEY`
- [ ] Smoke test:
  - `GET /health`
  - public availability route
  - booking mutation route with `Idempotency-Key`

## Web deploy (Cloudflare Pages)

- [ ] Build/deploy Next.js app to Pages (automated from GitHub Actions on `main` push, or manually if needed).
- [ ] Custom domains are attached in Pages project:
  - `opencalendly.com`
  - `www.opencalendly.com`
- [ ] Confirm runtime env vars on Pages include API base URL and public config.
- [ ] Verify homepage, public booking page, and booking submission path.

## Post-deploy validation

- [ ] One-on-one booking happy path succeeds.
- [ ] Team round-robin and collective booking happy paths succeed.
- [ ] Webhook delivery run can process pending retries.
- [ ] Calendar sync status endpoint reports healthy provider states.
- [ ] Dashboard analytics endpoint returns expected data.
- [ ] `npm run domain:check:production` passes.

## Rollback readiness

- [ ] Previous known-good API/Web deploy IDs are recorded.
- [ ] Neon restore branch procedure is prepared (see `docs/OPERATOR_RUNBOOK.md`).
- [ ] Incident communication channel is prepared before rollout.
