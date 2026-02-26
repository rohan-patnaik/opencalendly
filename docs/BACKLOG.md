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
