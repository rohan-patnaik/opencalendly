# Production Deployment Checklist (GA)

Last updated: 19 Mar 2026 (IST)

## Pre-deploy

- [ ] Private staging is fully deployed and protected before public production is opened:
  - `staging.opencalendly.com`
  - `api-staging.opencalendly.com`
  - Cloudflare Access allowlist enforced
- [ ] Staging functional verification is complete for:
  - Google sign-in + calendar connect/sync/writeback
  - Microsoft sign-in + calendar connect/sync/writeback
  - one-on-one and team booking create/reschedule/cancel
  - organizer reads/writes
  - webhook subscription create + delivery batch
- [ ] Staging load verification is complete:
  - `npm run load:test:smoke`
  - `npm run load:test:baseline`
  - `npm run load:test:contention`
- [ ] Staging GA artifact is updated with:
  - final p95/p99 latency
  - conflict behavior under contention
  - queue backlog behavior
  - Sentry and Better Stack status
- [ ] `main` is green on required checks:
  - `lint-test-typecheck`
  - `GitGuardian Security Checks`
  - `trigger-coderabbit-review`
- [ ] If CodeRabbit or Greptile posted actionable PR comments, they are resolved before merge.
- [ ] All PR review threads are resolved.
- [ ] `npm run env:check` passes in deployment environment.
- [ ] `npm run env:check:production` passes in the deployment environment.
- [ ] Neon `DATABASE_URL` points to production branch/database.
- [ ] Required OAuth and email provider env vars are present.
- [ ] Dedicated production-only secrets are set:
  - `WEBHOOK_SECRET_ENCRYPTION_KEY`
  - `TELEMETRY_HMAC_KEY`
  - `SENTRY_DSN_API`
  - `SENTRY_DSN_WEB`
  - `SENTRY_ENVIRONMENT`
- [ ] `APP_BASE_URL`, `API_BASE_URL`, and `NEXT_PUBLIC_API_BASE_URL` all resolve to the production `https:` domains.
- [ ] Provider redirect URIs are reviewed against production domains:
  - Clerk social login/callback settings
  - Google OAuth callback
  - Microsoft OAuth callback
- [ ] Outbound egress assumptions are reviewed for production:
  - provider/auth APIs: Clerk, `oauth2.googleapis.com`, `openidconnect.googleapis.com`, `www.googleapis.com`, `login.microsoftonline.com`, `graph.microsoft.com`, `api.resend.com`
  - webhook safety checks can reach `cloudflare-dns.com`
  - organizer-managed webhooks are limited to validated public HTTPS destinations and the runtime can reach the HTTPS port encoded in those URLs
  - private-network and metadata-service egress remains blocked
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
- [ ] External observability vendors are configured:
  - Sentry project created for Web/API exception capture
  - Better Stack (or equivalent) uptime checks configured for Web and API health probes
- [ ] A staging smoke exception has been observed in Sentry for:
  - web
  - API
- [ ] Alert routing points to a real operator channel with an owner on call.

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
- [ ] Confirm the Worker environment contains:
  - `WEBHOOK_SECRET_ENCRYPTION_KEY`
  - `TELEMETRY_HMAC_KEY`
  - `SENTRY_DSN_API`
  - `SENTRY_ENVIRONMENT`
- [ ] Smoke test:
  - `GET /health`
  - public availability route
  - booking mutation route with `Idempotency-Key`
  - organizer webhook delivery to a public HTTPS receiver
  - Google or Microsoft calendar sync/writeback path in the target environment

## Web deploy (Cloudflare Pages)

- [ ] Build/deploy Next.js app to Pages (automated from GitHub Actions on `main` push, or manually if needed).
- [ ] Confirm the Pages build is running from the repository root so Vercel honors `apps/web` as the monorepo root directory.
- [ ] Custom domains are attached in Pages project:
  - `opencalendly.com`
  - `www.opencalendly.com`
- [ ] Confirm runtime env vars on Pages include API base URL and public config.
- [ ] Confirm runtime env vars on Pages include:
  - `SENTRY_DSN_WEB`
  - `SENTRY_ENVIRONMENT`
- [ ] Verify homepage, public booking page, and booking submission path.
- [ ] Confirm production security headers on sensitive routes:
  - `X-Frame-Options: DENY` on dashboard/organizer/auth/settings/booking-action pages
  - CSP references the production app/API origins only

## Post-deploy validation

- [ ] One-on-one booking happy path succeeds.
- [ ] Team round-robin and collective booking happy paths succeed.
- [ ] Webhook delivery run can process pending retries.
- [ ] Calendar sync status endpoint reports healthy provider states.
- [ ] Operator health endpoint reports the expected status and queue summaries:
  - `GET /v0/analytics/operator/health`
- [ ] Production response headers match the documented CSP/security-header baseline.
- [ ] No webhook or calendar provider failures are caused by outbound firewall/DNS policy.
- [ ] Dashboard analytics endpoint returns expected data.
- [ ] `npm run domain:check:production` passes.
- [ ] Better Stack uptime checks are green for:
  - web homepage
  - API `/health`
- [ ] Sentry receives and groups server-side exceptions from a smoke-test path.
- [ ] Staging sign-off evidence is recorded in the release PR description or release handoff.

## Rollback readiness

- [ ] Previous known-good API/Web deploy IDs are recorded.
- [ ] Neon restore branch procedure is prepared (see `docs/OPERATOR_RUNBOOK.md`).
- [ ] Incident communication channel is prepared before rollout.
- [ ] Alert thresholds are recorded in the on-call handoff:
  - auth exchange failure spikes
  - booking conflict/failure spikes
  - webhook queue backlog > 25
  - writeback queue backlog > 25
  - stale calendar provider sync > 30 minutes past expected freshness
