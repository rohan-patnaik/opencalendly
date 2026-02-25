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

## Webhook event schema (v0)

Source of truth: `packages/shared/src/schemas.ts` (`webhookEventSchema`).
