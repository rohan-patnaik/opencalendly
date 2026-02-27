# Ordered Backlog (One Feature per PR)

## Feature 0 (PR#2): Bootstrap + docs + infra + Greptile config

Acceptance criteria:

- Monorepo structure exists.
- `apps/web` runs locally.
- `apps/api` runs locally with Wrangler.
- Neon DB migrations run and seed script works.
- Hyperdrive connection example exists in code and stack docs.
- `greptile.json` exists with sensible defaults.
- CI runs lint + unit tests.

## Feature 1 (PR#3): One-on-one event types + public booking link + timezone + buffers

Acceptance criteria:

- Magic-link auth works end-to-end (`/v0/auth/magic-link`, `/v0/auth/verify`) and authenticated routes reject missing/expired bearer sessions.
- Authenticated organizer routes can create and edit one-on-one event types with `name`, `slug`, `durationMinutes`, `location`, and `questions`.
- Organizer availability rules support weekly schedule windows plus date overrides and per-rule buffers.
- Public booking URL `/<username>/<event-slug>` renders event details with a timezone-aware availability picker.
- Public availability API returns slots computed from weekly rules + date overrides, minus booked windows and buffers.
- Booking commit is correctness-safe: DB transaction + slot re-check + unique slot constraint guard against double booking.
- Successful booking stores the record and triggers a confirmation email send path.
- Tests cover availability computation and booking transaction correctness/error paths.
- `docs/API.md` is updated to match the implemented Feature 1 contract.

## Feature 2 (PR#4): Reschedule + cancel + secure tokens + emails

Acceptance criteria:

- Each confirmed booking issues opaque, high-entropy cancel/reschedule tokens (stored hashed) for invitee self-service links.
- Token validation endpoint returns booking details for the action page and rejects invalid, expired, or already-used tokens with `404/410`.
- Cancel flow marks booking as `canceled`, stores cancellation metadata (`reason`, `canceledAt`, `canceledBy`), and sends cancellation email notifications.
- Reschedule flow preserves history by keeping the old booking row (status `rescheduled`) and creating a new confirmed booking linked via `rescheduledFromBookingId`.
- Reschedule correctness is transaction-safe: organizer-level overlap checks and unique-slot constraints still prevent double-booking races.
- Reschedule and cancel actions are idempotent for repeated token submissions.
- Feature adds unit/integration tests for token validation, cancel, reschedule success, and conflict/error paths.
- `docs/API.md` is updated with reschedule/cancel token contracts and response examples.

## Feature 3 (PR#5): Demo Credits Pool (daily passes) + waitlist

Acceptance criteria:

- System supports a configurable per-day pass limit (`DEMO_DAILY_PASS_LIMIT`) without code changes.
- A public trial action endpoint atomically consumes exactly one pass and returns remaining passes.
- Daily usage resets by date boundary (UTC day) and does not carry yesterday's usage into today.
- When passes are exhausted, trial action returns a deterministic exhausted response and does not over-consume.
- Exhausted path supports waitlist capture (email + optional metadata) with deduping per day/email.
- A protected dev/admin endpoint can reset today's pass usage for local/demo operations.
- Feature includes tests for consume success, exhaustion behavior, race safety, reset flow, and waitlist dedupe.
- `docs/API.md` is updated with credits + waitlist contracts.
- `README.md` and `docs/PRD.md` are updated for operator setup and product behavior notes.

## Feature 4 (PR#6): Embeds + Webhooks v1

Acceptance criteria:

- Public embed script endpoint serves an embeddable booking widget bootstrap for a given organizer/event slug.
- Widget supports host page configuration (timezone, theme/lightweight style options) and calls existing booking APIs.
- Authenticated webhook management endpoints can create/list/update webhook subscriptions.
- Outbound webhook events are emitted for `booking.created`, `booking.canceled`, and `booking.rescheduled`.
- Delivery attempts are stored and retried with exponential backoff on non-2xx responses and transient failures.
- Retry loop enforces bounded attempts and marks deliveries as `succeeded`/`failed`.
- Signature header is included for webhook authenticity validation.
- Feature includes tests for event payload shape, signature generation, and retry scheduling logic.
- `docs/API.md` includes webhook subscription and delivery contracts.
- Embed documentation is added/updated in `README.md` (or dedicated docs page).

## Feature 5 (PR#7): Team Scheduling Modes v1 (Round Robin + Collective)

Acceptance criteria:

- Authenticated organizers can create teams and add members.
- Team event types can be configured with a scheduling mode: `round_robin` or `collective`.
- Public availability endpoint supports team event types:
  - `round_robin` returns slots from available assignees and rotates assignments fairly (distributes bookings evenly across available members over time).
  - `collective` returns only slots where all required members are simultaneously available.
- Booking commit for team event types stores assignment details and remains correctness-safe (transaction + unique slot constraint).
- Reschedule/cancel flow remains compatible for team-assigned bookings.
- Team mode logic is covered by tests for slot computation and booking assignment correctness.
- `docs/API.md` includes team and team-event draft/final contracts.
- `docs/ARCHITECTURE.md` is updated if data model/flow changes materially.

## Feature 6 (PR#10): Calendar Sync Hardening v1 (Google Busy Sync + Conflict Blocking)

Acceptance criteria:

- Organizers can connect/disconnect a Google Calendar account via OAuth for conflict sync.
- Provider credentials are stored encrypted-at-rest in DB (no raw tokens in logs/responses).
- Background/manual sync loads busy windows into local storage and applies them to availability computation.
- Availability and booking commit both enforce external busy-window conflicts.
- Sync status endpoint shows `connected`, `lastSyncedAt`, `lastError`, and `nextSyncAt`.
- Tests cover token refresh, sync conflict blocking, and degraded provider behavior.
- `docs/API.md` is updated with calendar connect/sync/status contracts.

## Feature 7 (PR#11): Calendar Sync Hardening v2 (Outlook + Calendar Writeback)

Acceptance criteria:

- Microsoft Outlook connection is supported with the same credential handling model.
- Booking lifecycle writeback works for connected provider calendars:
  - booking create -> external calendar event create
  - booking cancel -> external calendar event cancel/delete
  - booking reschedule -> external calendar event update
- External event IDs are persisted and linked to booking records for idempotent retries.
- Provider call failures are retried with bounded backoff; final failures are visible in ops status.
- Tests cover create/cancel/reschedule writeback success and retry/error paths.
- `docs/API.md` and `docs/ARCHITECTURE.md` are updated for provider abstraction + writeback flow.

Execution plan (Feature 7 PR flow):

1. Schema + migrations
   - add provider-agnostic external booking writeback table (`booking_external_events`) with:
     - `booking_id`, `provider`, `external_event_id`, `status`, `attempt_count`, `next_attempt_at`, `last_error`
   - add indexes for retry runner selection and booking/provider idempotency
2. Provider abstraction
   - split provider integration into `google` and `microsoft` adapters with shared interface:
     - connect/start + connect/complete + refresh token
     - free/busy sync (existing behavior retained)
     - external event create/cancel/update
3. API + writeback orchestration
   - add Microsoft connect/disconnect/sync endpoints with same auth + encryption model as Google
   - on booking create/cancel/reschedule:
     - enqueue/update writeback row
     - execute provider call (or runner call) with bounded retries and persisted failure state
4. Runner + failure visibility
   - add authenticated runner endpoint to process due writeback retries
   - expose status fields so operators can see pending/failed writebacks
5. Tests + docs + merge gate
   - add unit/integration tests for provider adapters and retry behavior
   - finalize docs/API.md + docs/ARCHITECTURE.md contracts
   - require CodeRabbit + Greptile + CI green before merge

## Feature 8 (PR#12): Analytics + Operator Dashboard v1

Acceptance criteria:

- Authenticated organizer analytics endpoints provide booking funnel metrics:
  - page views -> slot selections -> booking confirmations
  - confirmed/canceled/rescheduled counts by day and event type
- Team analytics include round-robin assignment distribution and collective booking volume.
- Operator endpoints expose webhook and email delivery health metrics.
- Web app includes a minimal dashboard for these analytics (filters: date range, event/team).
- Tests cover analytics query correctness and authorization boundaries.
- `docs/API.md` is updated with analytics contracts.

## Feature 9 (PR#13): Reliability + Platform Hardening

Acceptance criteria:

- GitHub branch protection is fully configured to enforce required checks and no direct `main` pushes.
- API adds request-level rate limiting for public booking/availability routes.
- Idempotency keys are enforced for booking-create and booking-reschedule mutation endpoints.
- Platform warning debt is resolved or documented with a tracked migration plan:
  - evaluate and decide migration path from `@cloudflare/next-on-pages` to OpenNext
  - document lockfile warning strategy for local dev
- Smoke + regression test suite runs in CI for critical booking flows.
- `docs/STACK.md`/`docs/ARCHITECTURE.md` are updated for operational guardrails.

Execution plan (Feature 9 PR flow):

1. Platform enforcement
   - configure GitHub `main` branch protection required checks + PR-only merge policy
   - verify direct push rejection path at platform level
2. Public API abuse controls
   - add request-level rate limiting for public availability and booking mutation routes
   - return deterministic `429` payloads for throttled requests
3. Mutation idempotency
   - add DB-backed idempotency table keyed by `(scope, idempotencyKeyHash)`
   - require `Idempotency-Key` on booking create + team booking create + reschedule mutation
   - replay stored response for key retries with same payload; reject payload mismatch with `409`
4. Warning debt decisions
   - document OpenNext migration decision/timeline
   - document multi-lockfile warning strategy for local dev
5. CI hardening
   - add smoke/regression test suite for critical booking flows to CI
6. Review gate + merge
   - CodeRabbit + Greptile + CI green
   - resolve all review threads
   - merge without deleting feature branch

## Feature 10 (PR#14): Launch Readiness + v1.0 Release

Acceptance criteria:

- End-to-end happy path tests pass for:
  - one-on-one booking lifecycle
  - team round-robin booking lifecycle
  - team collective booking lifecycle
  - webhook delivery + retries
  - calendar sync conflict handling
- Security checklist is completed (secrets handling, auth/session expiry, token misuse checks, webhook signature validation).
- Operator runbook is complete (incident triage, failed delivery replay, calendar sync recovery, DB restore drill).
- Versioned release notes and migration notes are published for `v1.0.0`.
- Production deployment checklist is executable end-to-end with zero manual ambiguity.

## Post-Feature-5 Delivery Plan (Until Done)

1. Lock baseline after Feature 5 merge:
   - pull latest `main`
   - verify env + migrations + seed + app boot in local dev
2. Execute Feature 6 through Feature 10 in strict order:
   - one feature branch per feature from latest `main`
   - open draft PR on first push
   - implement to acceptance criteria only
   - make PR ready only when criteria are implemented and tests are passing
3. Enforce review gates on every feature PR:
   - CodeRabbit review must run and all comments must be resolved
   - Greptile review must run and all comments must be resolved
   - CI must be fully green
4. Merge discipline:
   - merge only after both review bots + CI pass
   - keep source feature branches after merge (no branch deletion)
5. Done state for this roadmap:
   - Feature 6, 7, 8, 9, and 10 merged to `main`
   - docs/API.md, docs/ARCHITECTURE.md, docs/STACK.md, and docs/PRD.md updated per feature
   - release `v1.0.0` tagged with final handoff summary
