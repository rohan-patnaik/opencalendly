# Security Checklist (v1.0.0 Readiness)

Last reviewed: 27 Feb 2026 (IST)

## Secrets handling

- [x] Secrets are read from environment variables; no provider secrets are hardcoded in tracked files.
- [x] `.env.example` remains template-safe (placeholder-only, no real secret values).
- [x] Calendar provider tokens are encrypted-at-rest before DB persistence.
- [x] Logs and API responses do not expose raw OAuth tokens or API keys.

## Auth and session expiry

- [x] Authenticated routes require bearer session and reject missing/invalid sessions.
- [x] Session expiration is enforced server-side before route access.
- [x] Magic-link verification consumes and invalidates one-time tokens.

## Token misuse checks

- [x] Booking action tokens are stored hashed and validated against expiry/consumption state.
- [x] Reschedule/cancel token actions are idempotent under repeated submissions.
- [x] Booking mutation idempotency requires `Idempotency-Key` and rejects payload mismatch with `409`.

## Webhook authenticity

- [x] Outbound webhook requests include `X-OpenCalendly-Signature` HMAC-SHA256 header.
- [x] Signature payload format is deterministic (`t=<timestamp>,v1=<signature>`).
- [x] Retry delivery flow preserves signature behavior across attempts.

## Residual hardening queue (post-v1.0)

- [ ] Add optional IP allow-listing for admin-only operational endpoints.
- [ ] Add scheduled security regression scan workflow in CI.
