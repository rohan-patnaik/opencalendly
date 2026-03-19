# Security Checklist (GA Readiness)

Last reviewed: 19 Mar 2026 (IST)

## 1. Secrets and production env policy

- [x] Secrets are read from environment variables; no provider secrets are hardcoded in tracked files.
- [x] `.env.example` remains template-safe (placeholder-only, no real secret values).
- [x] Calendar provider tokens are encrypted at rest before DB persistence.
- [x] Webhook signing secrets are encrypted at rest.
- [x] Logs and API responses do not expose raw OAuth tokens, API keys, webhook secrets, or session tokens.
- [x] Local/dev env validation remains permissive for optional production-only keys.
- [x] Production env validation fails when either of these is missing:
- [x] Production env validation fails when either of these is missing:
  - `WEBHOOK_SECRET_ENCRYPTION_KEY`
  - `TELEMETRY_HMAC_KEY`
- [x] Production env validation also fails when observability is not explicitly configured:
  - `SENTRY_DSN_API`
  - `SENTRY_DSN_WEB`
  - `SENTRY_ENVIRONMENT`
- [x] Production env validation requires `APP_BASE_URL`, `API_BASE_URL`, and `NEXT_PUBLIC_API_BASE_URL` to be non-local `https:` origins.

## 2. Auth, sessions, and browser boundary

- [x] Authenticated routes require bearer session and reject missing/invalid sessions.
- [x] Session expiration is enforced server-side before route access.
- [x] Magic-link verification consumes and invalidates one-time tokens.
- [x] Session cookies remain `HttpOnly`, `Path=/`, and `SameSite=Lax`.
- [x] Session cookies are only marked `Secure` on non-local `https:` origins.
- [x] Sensitive web routes deny framing:
  - `/dashboard`
  - `/organizer`
  - `/auth`
  - `/settings`
  - `/bookings/actions/*`
- [x] Public embed routes remain frame-compatible and are not covered by sensitive-route frame denial.

## 3. Token misuse and booking correctness

- [x] Booking action tokens are stored hashed and validated against expiry/consumption state.
- [x] Reschedule/cancel token actions are idempotent under repeated submissions.
- [x] Booking mutation idempotency requires `Idempotency-Key` and rejects payload mismatch with `409`.
- [x] Booking action misuse is audit-logged for `404`, `409`, and `410` paths without exposing raw token values.
- [x] Availability is re-checked at booking commit rather than trusting earlier UI state.

## 4. Webhook authenticity and queue safety

- [x] Outbound webhook requests include `X-OpenCalendly-Signature` HMAC-SHA256 header.
- [x] Signature payload format is deterministic (`t=<timestamp>,v1=<signature>`).
- [x] Retry delivery flow preserves signature behavior across attempts.
- [x] Permanent delivery failures are audit-logged without leaking webhook secrets or payload internals.
- [x] Queue backlog and failed-delivery counts are surfaced through operator health.

## 5. Provider sync and writeback safety

- [x] Calendar connect/disconnect/sync paths are audit-logged with provider, route, and status only.
- [x] Permanent calendar writeback failures are audit-logged without leaking provider tokens.
- [x] Provider freshness and error state are surfaced through operator health.
- [x] Stale provider state is treated as degraded operator health.

## 6. Outbound network boundary

- [x] Organizer-managed webhook targets are restricted to public HTTPS hostnames and rejected when they resolve to private or unsafe IP space.
- [x] Runtime expectations for provider APIs and webhook egress are documented in architecture, API, deploy, and operator docs.
- [x] Production response headers match the documented CSP/security-header baseline in tests.
- [x] Staging is expected to be protected behind Cloudflare Access with an explicit internal allowlist before pre-GA testing begins.

## 7. GA follow-ups after this hardening slice

- [ ] Add optional IP allow-listing for admin-only operational endpoints.
- [ ] Add scheduled secret-rotation rehearsal and calendar reconnect drill.
- [ ] Confirm external vendor alert wiring is live in staging and production:
  - Sentry for exception capture
  - Better Stack uptime checks for Web/API health
- [ ] Record a successful staging smoke exception in Sentry for both web and API surfaces before public launch.
