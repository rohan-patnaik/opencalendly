# Production Deployment Checklist (v1.0.0)

Last updated: 27 Feb 2026 (IST)

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

## Database and schema

- [ ] Run schema generation and migrations:
  - `npm run db:generate`
  - `npm run db:migrate`
- [ ] Confirm migration journal updated as expected.
- [ ] Validate critical tables exist (bookings, action tokens, idempotency, webhooks, calendar writeback).

## API deploy (Cloudflare Worker)

- [ ] Deploy API worker with current config/bindings.
- [ ] Confirm Hyperdrive binding points to production Neon connection.
- [ ] Confirm secrets are set in Worker environment:
  - `DATABASE_URL`, `SESSION_SECRET`, provider secrets, `RESEND_API_KEY`
- [ ] Smoke test:
  - `GET /health`
  - public availability route
  - booking mutation route with `Idempotency-Key`

## Web deploy (Cloudflare Pages)

- [ ] Build/deploy Next.js app to Pages.
- [ ] Confirm runtime env vars on Pages include API base URL and public config.
- [ ] Verify homepage, public booking page, and booking submission path.

## Post-deploy validation

- [ ] One-on-one booking happy path succeeds.
- [ ] Team round-robin and collective booking happy paths succeed.
- [ ] Webhook delivery run can process pending retries.
- [ ] Calendar sync status endpoint reports healthy provider states.
- [ ] Dashboard analytics endpoint returns expected data.

## Rollback readiness

- [ ] Previous known-good API/Web deploy IDs are recorded.
- [ ] Neon restore branch procedure is prepared (see `docs/OPERATOR_RUNBOOK.md`).
- [ ] Incident communication channel is prepared before rollout.
