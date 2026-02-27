# Operator Runbook (v1.0.0)

Last updated: 27 Feb 2026 (IST)

## 1) Incident triage

1. Confirm user-facing impact:
   - booking create failures
   - availability returning empty unexpectedly
   - delayed or missing confirmation/cancellation emails
2. Check service health quickly:
   - API (prod/staging): `curl https://<api-domain>/health`
   - Web (prod/staging): `https://<web-domain>`
   - Local fallback (dev only): `curl http://localhost:8787/health`, `http://localhost:3000`
3. Check latest CI and PR health for recent deploy changes.
4. Categorize severity:
   - P1: booking flow down or data corruption risk
   - P2: degraded behavior with workaround
   - P3: non-critical defects

## 2) Failed webhook delivery replay

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

## 3) Calendar sync recovery

1. Check provider sync status:
   - `GET /v0/calendar/sync/status`
2. If disconnected/expired:
   - reconnect provider via OAuth connect flow
3. Trigger sync:
   - Google: `POST /v0/calendar/google/sync`
   - Microsoft: `POST /v0/calendar/microsoft/sync`
4. If writeback backlog exists:
   - `POST /v0/calendar/writeback/run`
5. Verify conflict enforcement is restored by checking availability against known busy windows.

## 4) Database restore drill (Neon)

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

## 5) Post-incident checklist

1. Record timeline, root cause, and corrective actions.
2. Add missing test coverage before closing incident.
3. Update docs if operational steps changed.
