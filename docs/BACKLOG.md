# Ordered Backlog (One Feature per PR)

## Feature 0 (PR#1): Bootstrap + docs + infra + Greptile config

Acceptance criteria:

- Monorepo structure exists.
- `apps/web` runs locally.
- `apps/api` runs locally with Wrangler.
- Neon DB migrations run and seed script works.
- Hyperdrive connection example exists in code and stack docs.
- `greptile.json` exists with sensible defaults.
- CI runs lint + unit tests.

## Feature 1 (PR#2): One-on-one event types + public booking link + timezone + buffers

Acceptance criteria:

- Auth works.
- Create/edit event type fields: name, slug, duration, location, questions.
- Public URL `/<username>/<event-slug>` shows timezone-aware availability picker.
- Availability rules include weekly schedule + date overrides + buffers.
- Booking correctness: transaction + unique timeslot constraint.
- Booking record created and confirmation email sent.
- Unit tests for availability computation + booking transaction.
- `docs/API.md` updated.

## Feature 2 (PR#3): Reschedule + cancel + secure tokens + emails

Acceptance criteria:

- Secure tokenized reschedule/cancel links.
- Email notifications on reschedule/cancel.
- Booking history maintained.
- Tests and docs updated.

## Feature 3 (PR#4): Demo Credits Pool (daily passes) + waitlist

Acceptance criteria:

- Configurable daily pass limit.
- Trial action consumes one pass.
- Exhausted pool shows waitlist/come-back state.
- Admin/dev route can reset passes.
- README + PRD updates.

## Feature 4 (PR#5): Embeds + Webhooks v1

Acceptance criteria:

- Inline widget embed script.
- Webhooks: `booking.created`, `booking.canceled`, `booking.rescheduled`.
- Retry delivery with exponential backoff.
- API + embed docs updated.
