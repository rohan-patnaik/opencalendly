# API (v0)

## Principles

- JSON REST endpoints under `/v0`.
- Zod-validated request and response contracts.
- Booking correctness checks happen at write time, not only at UI time.

## Auth model

- Auth uses bearer sessions: `Authorization: Bearer <sessionToken>`.
- Session tokens are issued via magic-link flow.
- Protected routes return `401` on missing/invalid/expired token.

## Endpoints

### `GET /health`

Response:

```json
{
  "status": "ok"
}
```

### `GET /v0/db/ping`

Purpose: verify Worker -> Hyperdrive -> Postgres connectivity.

Success response:

```json
{
  "ok": true,
  "now": "2026-02-24 18:06:00+00"
}
```

### `POST /v0/auth/magic-link`

Request:

```json
{
  "email": "demo@opencalendly.dev",
  "username": "demo",
  "displayName": "Demo Organizer",
  "timezone": "America/New_York"
}
```

Notes:

- `username`, `displayName`, and `timezone` are optional for existing users.
- For first-time users, `username` and `displayName` are required.

Success response:

```json
{
  "ok": true,
  "expiresAt": "2026-02-26T15:04:05.000Z",
  "magicLinkToken": "raw-token-for-verify-step"
}
```

### `POST /v0/auth/verify`

Request:

```json
{
  "token": "raw-token-for-verify-step"
}
```

Success response:

```json
{
  "ok": true,
  "sessionToken": "session-token",
  "expiresAt": "2026-03-28T15:04:05.000Z",
  "user": {
    "id": "d8bdbf6d-aed7-4c84-a67f-a2c54f7c4f4a",
    "email": "demo@opencalendly.dev",
    "username": "demo",
    "displayName": "Demo Organizer",
    "timezone": "America/New_York"
  }
}
```

### `GET /v0/auth/me`

Auth required.

Success response:

```json
{
  "ok": true,
  "user": {
    "id": "d8bdbf6d-aed7-4c84-a67f-a2c54f7c4f4a",
    "email": "demo@opencalendly.dev",
    "username": "demo",
    "displayName": "Demo Organizer",
    "timezone": "America/New_York"
  }
}
```

### `POST /v0/event-types`

Auth required.

Request:

```json
{
  "name": "Intro Call",
  "slug": "intro-call",
  "durationMinutes": 30,
  "locationType": "video",
  "locationValue": "https://meet.example.com/demo",
  "questions": [
    {
      "id": "company",
      "label": "Company",
      "required": false
    }
  ]
}
```

Success response:

```json
{
  "ok": true,
  "eventType": {
    "id": "38fef2f8-70f0-4078-b76e-33d8a773047f",
    "name": "Intro Call",
    "slug": "intro-call",
    "durationMinutes": 30,
    "locationType": "video",
    "locationValue": "https://meet.example.com/demo",
    "questions": [],
    "isActive": true
  }
}
```

### `PATCH /v0/event-types/:id`

Auth required. Supports partial updates for:

- `name`
- `slug`
- `durationMinutes`
- `locationType`
- `locationValue`
- `questions`
- `isActive`

### `PUT /v0/me/availability/rules`

Auth required.

Replaces all weekly rules for current user.

Request:

```json
{
  "rules": [
    {
      "dayOfWeek": 1,
      "startMinute": 540,
      "endMinute": 1020,
      "bufferBeforeMinutes": 10,
      "bufferAfterMinutes": 10
    }
  ]
}
```

### `PUT /v0/me/availability/overrides`

Auth required.

Replaces all date overrides for current user.

Request:

```json
{
  "overrides": [
    {
      "startAt": "2026-03-03T15:00:00.000Z",
      "endAt": "2026-03-03T18:00:00.000Z",
      "isAvailable": false,
      "reason": "Out of office"
    }
  ]
}
```

### `GET /v0/users/:username/event-types/:slug`

Public endpoint for booking page details.

Success response:

```json
{
  "ok": true,
  "eventType": {
    "name": "Intro Call",
    "slug": "intro-call",
    "durationMinutes": 30,
    "locationType": "video",
    "locationValue": "https://meet.example.com/demo",
    "questions": []
  },
  "organizer": {
    "username": "demo",
    "displayName": "Demo Organizer",
    "timezone": "America/New_York"
  }
}
```

### `GET /v0/users/:username/event-types/:slug/availability`

Public endpoint for slot picker.

Query params:

- `timezone` (optional IANA timezone; default `UTC`)
- `start` (optional ISO datetime; default current time)
- `days` (optional integer `1..30`; default `7`)

Success response:

```json
{
  "ok": true,
  "timezone": "America/Los_Angeles",
  "slots": [
    {
      "startsAt": "2026-03-04T17:00:00.000Z",
      "endsAt": "2026-03-04T17:30:00.000Z"
    }
  ]
}
```

### `POST /v0/bookings`

Public booking commit endpoint.

Request:

```json
{
  "username": "demo",
  "eventSlug": "intro-call",
  "startsAt": "2026-03-04T17:00:00.000Z",
  "timezone": "America/Los_Angeles",
  "inviteeName": "Pat Lee",
  "inviteeEmail": "pat@example.com",
  "answers": {
    "company": "Acme"
  }
}
```

Behavior:

- Re-validates slot availability inside a DB transaction.
- Uses DB unique slot constraint to avoid duplicate commits.
- Sends booking confirmation email after successful write.

Conflict response (`409`):

```json
{
  "ok": false,
  "error": "Selected slot is no longer available."
}
```

## Feature 2 Draft Endpoints (Reschedule/Cancel)

The following contracts are draft-first for Feature 2 and will be finalized in PR #4 implementation.

### `GET /v0/bookings/actions/:token`

Public endpoint used by cancel/reschedule action pages to resolve a token into booking context.

Success response:

```json
{
  "ok": true,
  "booking": {
    "id": "ff7e6f67-9d26-4ed6-9db5-f6f9fe00dc2e",
    "status": "confirmed",
    "startsAt": "2026-03-04T17:00:00.000Z",
    "endsAt": "2026-03-04T17:30:00.000Z",
    "timezone": "America/Los_Angeles",
    "inviteeName": "Pat Lee",
    "inviteeEmail": "pat@example.com"
  },
  "eventType": {
    "slug": "intro-call",
    "name": "Intro Call",
    "durationMinutes": 30
  },
  "organizer": {
    "username": "demo",
    "displayName": "Demo Organizer",
    "timezone": "America/New_York"
  },
  "actions": {
    "canCancel": true,
    "canReschedule": true
  }
}
```

Invalid/expired/consumed token response (`404` or `410`):

```json
{
  "ok": false,
  "error": "Action link is invalid or expired."
}
```

### `POST /v0/bookings/actions/:token/cancel`

Public endpoint to cancel a booking via tokenized action link.

Request:

```json
{
  "reason": "Need to move this out by a week."
}
```

Success response:

```json
{
  "ok": true,
  "booking": {
    "id": "ff7e6f67-9d26-4ed6-9db5-f6f9fe00dc2e",
    "status": "canceled"
  }
}
```

Behavior:

- Idempotent if the same cancel token is submitted repeatedly.
- Emits cancellation email notifications to invitee and organizer.

### `POST /v0/bookings/actions/:token/reschedule`

Public endpoint to reschedule a booking via tokenized action link.

Request:

```json
{
  "startsAt": "2026-03-05T18:00:00.000Z",
  "timezone": "America/Los_Angeles"
}
```

Success response:

```json
{
  "ok": true,
  "oldBooking": {
    "id": "ff7e6f67-9d26-4ed6-9db5-f6f9fe00dc2e",
    "status": "rescheduled"
  },
  "newBooking": {
    "id": "b6b70a0a-5358-4767-b68d-31d6408e7d1e",
    "status": "confirmed",
    "rescheduledFromBookingId": "ff7e6f67-9d26-4ed6-9db5-f6f9fe00dc2e"
  }
}
```

Conflict response (`409`):

```json
{
  "ok": false,
  "error": "Selected slot is no longer available."
}
```

Behavior:

- Transaction-safe organizer-level conflict checks are required before confirming the new slot.
- Reschedule sends updated confirmation email notifications.

## Webhook event schema (v0)

Source of truth: `packages/shared/src/schemas.ts` (`webhookEventSchema`).
