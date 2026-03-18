# GA Readiness Artifact — Security + Load Hardening

Date: 19 Mar 2026 (IST)

## Scope

This artifact records the GA hardening slice that tightened security controls, expanded operator health visibility, and added a repeatable `k6` load harness for correctness-sensitive flows.

## Implemented controls

### Security hardening

- Production env validation now fails when either of these is missing:
  - `WEBHOOK_SECRET_ENCRYPTION_KEY`
  - `TELEMETRY_HMAC_KEY`
- Production env validation now requires:
  - `APP_BASE_URL`
  - `API_BASE_URL`
  - `NEXT_PUBLIC_API_BASE_URL`
  to be non-local `https:` origins.
- Sensitive web routes now have regression coverage for `X-Frame-Options: DENY`.
- Embed routes remain frame-compatible.
- Session cookie behavior now has explicit regression coverage for:
  - localhost non-secure cookies
  - production secure cookies

### Audit / telemetry coverage

Structured audit events now cover:

- auth exchange failures
- availability reads
- booking commit outcomes
- booking-action misuse
- calendar connect/disconnect/sync
- webhook subscription create/update/toggle
- webhook delivery batches and permanent failures
- calendar writeback batches and permanent failures

### Operator health contract

`GET /v0/analytics/operator/health` now exposes:

- overall `status`
- machine-readable `alerts`
- `webhookQueue`
- `calendarWriteback`
- `calendarProviders`

Current degraded thresholds:

- webhook pending backlog > `25`
- writeback pending backlog > `25`
- any webhook failed backlog present
- any writeback failed backlog present
- stale connected provider sync
- connected provider error present

## Observability decisions for GA

- Exception capture vendor: `Sentry`
- Uptime / synthetic checks: `Better Stack`
- Existing logs, Neon data visibility, and operator endpoints remain the primary application-debug sources

## Local validation completed for this slice

- `npm run env:check`
- `npm run lint`
- `npm run test`
- `npm run typecheck`
- `git diff --check`

## Load harness added

Location:

- [load/k6/README.md](/Users/rpatnaik/Desktop/Work/Code/open-calendly/load/k6/README.md)
- [load/k6/smoke.js](/Users/rpatnaik/Desktop/Work/Code/open-calendly/load/k6/smoke.js)
- [load/k6/baseline.js](/Users/rpatnaik/Desktop/Work/Code/open-calendly/load/k6/baseline.js)
- [load/k6/contention.js](/Users/rpatnaik/Desktop/Work/Code/open-calendly/load/k6/contention.js)

Profiles:

- `smoke`
- `baseline`
- `contention`

## Required pre-GA production rehearsal

Before calling the app generally available, run these in a prod-like environment with dedicated test slots:

1. `npm run load:test:smoke`
2. `npm run load:test:baseline`
3. `npm run load:test:contention`

Record:

- p95/p99 latency for availability and booking mutation paths
- observed `409` conflict rate under same-slot contention
- queue backlog behavior during webhook and writeback worker execution
- any Sentry exceptions raised during the rehearsal
- Better Stack uptime probe results for Web and API

## Exit criteria

GA sign-off requires:

- no duplicate bookings under contention rehearsal
- explicit `409` conflict handling instead of silent overbooking
- queue workers remain bounded under rehearsal traffic
- no missing production-only secrets
- Sentry and Better Stack are both configured and green
