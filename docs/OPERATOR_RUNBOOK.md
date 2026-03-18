# Operator Runbook (GA)

Last updated: 19 Mar 2026 (IST)

## 1) Incident triage

1. Confirm user-facing impact:
   - booking create failures
   - availability returning empty unexpectedly
   - delayed or missing confirmation/cancellation emails
2. Check service health quickly:
   - API (prod/staging): `curl https://<api-domain>/health`
   - Web (prod/staging): `https://<web-domain>`
   - Local fallback (dev only): `curl http://localhost:8787/health`, `http://localhost:3000`
   - Operator health (authenticated): `GET /v0/analytics/operator/health`
3. Check latest CI and PR health for recent deploy changes.
4. Categorize severity:
   - P1: booking flow down or data corruption risk
   - P2: degraded behavior with workaround
   - P3: non-critical defects

## 2) Observability stack and alert thresholds

Primary tools for GA:

- Application logs + queue/data visibility: existing stack (Cloudflare + Neon + app logs)
- Exception capture: Sentry
- Uptime/synthetic probes: Better Stack

Alert thresholds:

- Auth exchange failures:
  - page Sentry/on-call when repeated `auth_exchange_*` failures exceed 5 in 10 minutes for the same environment
- Booking create failures:
  - investigate immediately when non-`409` booking-create failures exceed 5 in 10 minutes
- Webhook queue:
  - `webhook_backlog_high` when pending queue count exceeds `25`
  - immediate action when failed queue count is non-zero and growing
- Calendar writeback queue:
  - `writeback_backlog_high` when pending queue count exceeds `25`
  - immediate action when failed queue count is non-zero and growing
- Calendar provider freshness:
  - `calendar_sync_stale` when a connected provider is more than 30 minutes past the freshness grace window
- Uptime:
  - page on two consecutive failed Better Stack checks for Web or API

Alert-to-runbook mapping:

- `auth_exchange_*` failures:
  - inspect recent auth deploy/config changes
  - validate Clerk/Google/Microsoft callback configuration
  - confirm cookies/session signing secrets are stable
- `booking_commit_completed` failures:
  - confirm booking conflicts are explicit `409`s, not silent data errors
  - inspect availability checks and DB health
- `webhook_*` alerts:
  - use section 3 below
- `calendar_*` alerts:
  - use section 4 below

## 3) Failed webhook delivery replay

Authentication requirements for webhook operations:

- Use an authenticated organizer session in the target environment.
- Browser-driven operator flows use the cookie-backed API session established by the normal login flow.
- Scripted/API-client flows may reuse the same organizer session with `Authorization: Bearer <session-token>` when cookie auth is not available.
- Scripted/API-client flows must still present the same authenticated organizer context used by `/v0/auth/me`.
- `GET /v0/webhooks` and `POST /v0/webhooks/deliveries/run` require that authenticated organizer context.

1. Inspect current delivery status (authenticated):
   - `GET /v0/webhooks`
2. Run replay worker (authenticated):
   - `POST /v0/webhooks/deliveries/run`
3. Verify:
   - delivery attempts increment
   - failed rows move to succeeded or terminal failed with bounded attempts
4. If still failing:
   - validate endpoint URL and secret mismatch on receiver side
   - inspect provider/network errors
   - confirm destination DNS still resolves to public IP space
   - confirm runtime egress policy still allows outbound HTTPS to `cloudflare-dns.com` and to the public webhook host/port encoded in the destination URL
5. If the operator health endpoint shows `webhook_backlog_high`:
   - compare `webhookQueue.pending` against the alert threshold (`25`)
   - run replay worker in small batches until pending returns to steady-state
   - if failures keep reappearing, disable or fix the failing subscription before continuing retries
6. If Sentry is reporting permanent webhook failures:
   - correlate the `deliveryId`/subscription context from app logs
   - confirm the failure is receiver-side and not a signing/encryption regression

## 4) Calendar sync recovery

1. Check provider sync status:
   - `GET /v0/calendar/sync/status`
   - `GET /v0/analytics/operator/health`
2. If disconnected/expired:
   - reconnect provider via OAuth connect flow
3. Trigger sync:
   - Google: `POST /v0/calendar/google/sync`
   - Microsoft: `POST /v0/calendar/microsoft/sync`
4. If writeback backlog exists:
   - `POST /v0/calendar/writeback/run`
5. Verify conflict enforcement is restored by checking availability against known busy windows.
6. If sync or writeback still fails:
   - confirm runtime egress still permits `oauth2.googleapis.com`, `openidconnect.googleapis.com`, `www.googleapis.com`, `login.microsoftonline.com`, and `graph.microsoft.com`
   - treat provider DNS/firewall failures as operational incidents before debugging booking logic
7. If operator health reports `calendar_sync_stale`:
   - inspect `calendarProviders.byProvider`
   - reconnect the affected provider if the token is expired or the provider is disconnected
   - run a manual sync, then rerun writeback backlog processing if needed
8. If operator health reports `calendar_provider_errors`:
   - inspect `lastError` for the affected provider
   - confirm OAuth client credentials and redirect URIs
   - confirm provider API permissions are still granted

## 5) Booking failure / contention triage

1. Check:
   - `booking_commit_completed` audit events
   - Sentry error grouping
   - recent DB latency or lock contention indicators
2. Distinguish:
   - `409` conflicts: expected under slot contention
   - `400` validation: caller/data issue
   - `500`: operational or logic issue
3. If contention is high:
   - confirm no duplicate bookings were created for the same slot
   - use the load-test contention harness as a replayable reproduction path
4. If failures are non-conflict:
   - inspect recent deploy diff
   - inspect queue side effects separately from booking-commit correctness

## 6) Database restore drill (Neon)

1. Identify recovery target time and impacted tables.
2. In Neon console, create a restore branch from backup point.
3. Validate branch contents:
   - booking rows
   - action tokens
   - idempotency and delivery/writeback tables
4. Smoke test restore branch locally by temporarily pointing `DATABASE_URL` to restored branch.
5. If promoting restore:
   - announce maintenance window
   - switch traffic/config to restored branch
   - rerun migrations if required
   - run seed only if needed for demo data

## 7) Post-incident checklist

1. Record timeline, root cause, and corrective actions.
2. Add missing test coverage before closing incident.
3. Update docs if operational steps changed.
4. If this incident changed a threshold, update:
   - `docs/PROD_DEPLOY_CHECKLIST.md`
   - `docs/SECURITY_CHECKLIST.md`
   - `docs/releases/ga-readiness-2026-03-19.md`
