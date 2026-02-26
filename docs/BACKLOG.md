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

- Secure tokenized reschedule/cancel links.
- Email notifications on reschedule/cancel.
- Booking history maintained.
- Tests and docs updated.

## Feature 3 (PR#5): Demo Credits Pool (daily passes) + waitlist

Acceptance criteria:

- Configurable daily pass limit.
- Trial action consumes one pass.
- Exhausted pool shows waitlist/come-back state.
- Admin/dev route can reset passes.
- README + PRD updates.

## Feature 4 (PR#6): Embeds + Webhooks v1

Acceptance criteria:

- Inline widget embed script.
- Webhooks: `booking.created`, `booking.canceled`, `booking.rescheduled`.
- Retry delivery with exponential backoff.
- API + embed docs updated.
