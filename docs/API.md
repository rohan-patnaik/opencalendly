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

Behavior:

- Computes slots from organizer rules + date overrides.
- Removes conflicts from confirmed bookings.
- Applies synced external busy windows (Feature 6) as non-available blocks.

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
- Includes synced external busy windows in the final write-time conflict check.
- Uses DB unique slot constraint to avoid duplicate commits.
- Creates secure cancel/reschedule action tokens (stored hashed server-side).
- Sends booking confirmation email after successful write.
- Enqueues and runs immediate calendar writeback for connected providers.

Success response:

```json
{
  "ok": true,
  "booking": {
    "id": "ff7e6f67-9d26-4ed6-9db5-f6f9fe00dc2e",
    "eventTypeId": "38fef2f8-70f0-4078-b76e-33d8a773047f",
    "organizerId": "d8bdbf6d-aed7-4c84-a67f-a2c54f7c4f4a",
    "inviteeName": "Pat Lee",
    "inviteeEmail": "pat@example.com",
    "startsAt": "2026-03-04T17:00:00.000Z",
    "endsAt": "2026-03-04T17:30:00.000Z"
  },
  "actions": {
    "cancel": {
      "token": "raw-cancel-token",
      "expiresAt": "2026-04-05T17:00:00.000Z",
      "lookupUrl": "http://localhost:8787/v0/bookings/actions/raw-cancel-token",
      "url": "http://localhost:8787/v0/bookings/actions/raw-cancel-token/cancel"
    },
    "reschedule": {
      "token": "raw-reschedule-token",
      "expiresAt": "2026-04-05T17:00:00.000Z",
      "lookupUrl": "http://localhost:8787/v0/bookings/actions/raw-reschedule-token",
      "url": "http://localhost:8787/v0/bookings/actions/raw-reschedule-token/reschedule"
    }
  },
  "email": {
    "sent": true,
    "provider": "resend",
    "messageId": "re_123"
  },
  "webhooks": {
    "queued": 1
  },
  "calendarWriteback": {
    "queued": 1,
    "processed": 1,
    "succeeded": 1,
    "retried": 0,
    "failed": 0
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

## Feature 2 Endpoints (Reschedule/Cancel)

### `GET /v0/bookings/actions/:token`

Public endpoint used by cancel/reschedule action pages to resolve a token into booking context.

Success response:

```json
{
  "ok": true,
  "actionType": "cancel",
  "booking": {
    "id": "ff7e6f67-9d26-4ed6-9db5-f6f9fe00dc2e",
    "status": "confirmed",
    "startsAt": "2026-03-04T17:00:00.000Z",
    "endsAt": "2026-03-04T17:30:00.000Z",
    "timezone": "America/Los_Angeles",
    "inviteeName": "Pat Lee",
    "inviteeEmail": "pat@example.com",
    "rescheduledTo": null
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
    "canReschedule": false
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
  },
  "email": [
    {
      "sent": true,
      "provider": "resend"
    },
    {
      "sent": true,
      "provider": "resend"
    }
  ],
  "webhooks": {
    "queued": 1
  },
  "calendarWriteback": {
    "queued": 1,
    "processed": 1,
    "succeeded": 1,
    "retried": 0,
    "failed": 0
  }
}
```

Idempotent replay response:

```json
{
  "ok": true,
  "booking": {
    "id": "ff7e6f67-9d26-4ed6-9db5-f6f9fe00dc2e",
    "status": "canceled"
  },
  "email": {
    "sent": false,
    "provider": "none",
    "error": "Idempotent replay: cancellation already processed."
  },
  "webhooks": {
    "queued": 0
  },
  "calendarWriteback": {
    "queued": 0,
    "processed": 0,
    "succeeded": 0,
    "retried": 0,
    "failed": 0
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
    "rescheduledFromBookingId": "ff7e6f67-9d26-4ed6-9db5-f6f9fe00dc2e",
    "startsAt": "2026-03-05T18:00:00.000Z",
    "endsAt": "2026-03-05T18:30:00.000Z"
  },
  "actions": {
    "cancel": {
      "token": "raw-cancel-token",
      "expiresAt": "2026-04-05T18:00:00.000Z"
    },
    "reschedule": {
      "token": "raw-reschedule-token",
      "expiresAt": "2026-04-05T18:00:00.000Z"
    }
  },
  "email": [
    {
      "sent": true,
      "provider": "resend"
    },
    {
      "sent": true,
      "provider": "resend"
    }
  ],
  "webhooks": {
    "queued": 1
  },
  "calendarWriteback": {
    "queued": 1,
    "processed": 1,
    "succeeded": 1,
    "retried": 0,
    "failed": 0
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
- Reschedule sends notification emails to invitee + organizer.
- Repeated submissions of the same token are idempotent.
- Reschedule enqueues calendar writeback update for connected providers.

## Feature 3 Endpoints (Demo Credits + Waitlist)

### `GET /v0/demo-credits/status`

Public endpoint returning current daily pass usage.

Success response:

```json
{
  "ok": true,
  "date": "2026-02-26",
  "dailyLimit": 25,
  "used": 10,
  "remaining": 15,
  "isExhausted": false
}
```

### `POST /v0/demo-credits/consume`

Public endpoint to consume one daily demo pass.

Request:

```json
{
  "email": "pat@example.com"
}
```

Success response:

```json
{
  "ok": true,
  "consumed": true,
  "email": "pat@example.com",
  "date": "2026-02-26",
  "dailyLimit": 25,
  "used": 11,
  "remaining": 14
}
```

Exhausted response (`429`):

```json
{
  "ok": false,
  "error": "Daily demo passes are exhausted.",
  "email": "pat@example.com",
  "date": "2026-02-26",
  "dailyLimit": 25,
  "used": 25,
  "remaining": 0
}
```

Behavior:

- Must be transaction-safe under concurrency so one request consumes exactly one pass.
- Must reset usage by UTC date boundary.

### `POST /v0/waitlist`

Public endpoint to join waitlist when demo passes are exhausted.

Request:

```json
{
  "email": "pat@example.com",
  "source": "demo-credits-exhausted",
  "metadata": {
    "timezone": "Asia/Kolkata"
  }
}
```

Success response:

```json
{
  "ok": true,
  "joined": true
}
```

Idempotent duplicate response:

```json
{
  "ok": true,
  "joined": false
}
```

### `POST /v0/dev/demo-credits/reset`

Protected dev/admin endpoint to reset today’s usage counters.

Auth:

- bearer session required
- can be restricted further in implementation to dev/admin users or environments

Success response:

```json
{
  "ok": true,
  "date": "2026-02-26",
  "used": 0,
  "remaining": 25
}
```

## Feature 4 Endpoints (Embeds + Webhooks v1)

### `GET /v0/embed/widget.js`

Public JavaScript bootstrap for inline booking widget.

Query params:

- `username` (required)
- `eventSlug` (required)
- `timezone` (optional)
- `theme` (optional: `light` | `dark`)

Response:

- `200` JavaScript asset (`content-type: application/javascript`)
- Script renders an iframe/widget container and bootstraps booking UI.
- Script accepts style options via script tag `data-*` attributes: `data-width`, `data-height`, `data-radius`, `data-shadow`, `data-target`, `data-title`.

Usage example:

```html
<script
  src="http://127.0.0.1:8787/v0/embed/widget.js?username=demo&eventSlug=intro-call&timezone=Asia/Kolkata&theme=light"
  data-width="100%"
  data-height="760px"
></script>
```

### `GET /v0/webhooks`

Auth required. Lists webhook subscriptions for current organizer.

Success response:

```json
{
  "ok": true,
  "webhooks": [
    {
      "id": "a9ec5dc9-bef5-4f11-9699-a6f28a31feda",
      "url": "https://example.com/webhooks/opencalendly",
      "isActive": true,
      "events": ["booking.created", "booking.canceled", "booking.rescheduled"],
      "createdAt": "2026-02-26T08:00:00.000Z",
      "updatedAt": "2026-02-26T08:00:00.000Z"
    }
  ]
}
```

### `POST /v0/webhooks`

Auth required. Creates webhook subscription.

Request:

```json
{
  "url": "https://example.com/webhooks/opencalendly",
  "events": ["booking.created", "booking.canceled", "booking.rescheduled"],
  "secret": "whsec_..."
}
```

Success response:

```json
{
  "ok": true,
  "webhook": {
    "id": "a9ec5dc9-bef5-4f11-9699-a6f28a31feda",
    "url": "https://example.com/webhooks/opencalendly",
    "events": ["booking.created", "booking.canceled", "booking.rescheduled"],
    "isActive": true,
    "createdAt": "2026-02-26T08:00:00.000Z",
    "updatedAt": "2026-02-26T08:00:00.000Z"
  }
}
```

### `PATCH /v0/webhooks/:id`

Auth required. Supports partial updates for:

- `url`
- `events`
- `secret`
- `isActive`

Success response shape matches `POST /v0/webhooks`.

### `POST /v0/webhooks/deliveries/run`

Auth required. Processes pending deliveries and retries for the authenticated organizer's webhook subscriptions.

Query params:

- `limit` (optional integer `1..100`, default `25`)

Behavior:

- Picks eligible due deliveries.
- Sends signed payloads with retry backoff.
- Updates attempt count + next attempt timestamp.

Success response:

```json
{
  "ok": true,
  "processed": 3,
  "succeeded": 1,
  "retried": 1,
  "failed": 1
}
```

Delivery request headers:

- `X-OpenCalendly-Signature` (`t=<unix>,v1=<hmac_sha256>`)
- `X-OpenCalendly-Signature-Timestamp`
- `X-OpenCalendly-Delivery-Id`
- `X-OpenCalendly-Event`
- `X-OpenCalendly-Event-Id`

## Webhook Event Schema (v0)

Source of truth: `packages/shared/src/schemas.ts` (`webhookEventSchema`).

## Feature 5 Endpoints (Team Scheduling v1)

### `POST /v0/teams`

Auth required. Creates a team owned by the current organizer.

Request:

```json
{
  "name": "Customer Success Team",
  "slug": "customer-success"
}
```

Success response:

```json
{
  "ok": true,
  "team": {
    "id": "88d979f3-4700-4a1b-b8c0-b3e0940d8e9f",
    "ownerUserId": "5e8d2e15-f2e2-4a39-9c58-b0d2f8ef7ef2",
    "name": "Customer Success Team",
    "slug": "customer-success"
  }
}
```

### `POST /v0/teams/:teamId/members`

Auth required. Adds a member user to a team.

Routing note:

- Authenticated admin operations use `:teamId` (stable internal key).
- Public booking endpoints use `:teamSlug` for shareable URLs.

Request:

```json
{
  "userId": "5e8d2e15-f2e2-4a39-9c58-b0d2f8ef7ef2",
  "role": "member"
}
```

Success response:

```json
{
  "ok": true,
  "member": {
    "teamId": "88d979f3-4700-4a1b-b8c0-b3e0940d8e9f",
    "userId": "5e8d2e15-f2e2-4a39-9c58-b0d2f8ef7ef2",
    "role": "member",
    "user": {
      "id": "5e8d2e15-f2e2-4a39-9c58-b0d2f8ef7ef2",
      "email": "owner@example.com",
      "username": "owner",
      "displayName": "Owner User"
    }
  }
}
```

### `POST /v0/team-event-types`

Auth required. Creates a team event type with scheduling mode.

Request:

```json
{
  "teamId": "88d979f3-4700-4a1b-b8c0-b3e0940d8e9f",
  "name": "Team Intro",
  "slug": "team-intro",
  "durationMinutes": 30,
  "mode": "round_robin",
  "locationType": "video",
  "locationValue": "https://meet.example.com/team",
  "questions": [],
  "requiredMemberUserIds": ["5e8d2e15-f2e2-4a39-9c58-b0d2f8ef7ef2"]
}
```

Success response:

```json
{
  "ok": true,
  "teamEventType": {
    "id": "4f06b5a0-a3d9-4e96-9d90-2f9ec5d4d2f7",
    "teamId": "88d979f3-4700-4a1b-b8c0-b3e0940d8e9f",
    "mode": "round_robin",
    "roundRobinCursor": 0,
    "requiredMemberUserIds": ["5e8d2e15-f2e2-4a39-9c58-b0d2f8ef7ef2"],
    "eventType": {
      "id": "38fef2f8-70f0-4078-b76e-33d8a773047f",
      "slug": "team-intro",
      "name": "Team Intro",
      "durationMinutes": 30,
      "locationType": "video",
      "locationValue": "https://meet.example.com/team",
      "questions": [],
      "isActive": true
    }
  }
}
```

### `GET /v0/teams/:teamSlug/event-types/:eventSlug/availability`

Public availability endpoint for team event types.

Query params:

- `timezone` (optional)
- `start` (optional ISO datetime)
- `days` (optional integer `1..30`)

Success response:

```json
{
  "ok": true,
  "mode": "round_robin",
  "timezone": "Asia/Kolkata",
  "slots": [
    {
      "startsAt": "2026-03-04T17:00:00.000Z",
      "endsAt": "2026-03-04T17:30:00.000Z",
      "assignmentUserIds": ["5e8d2e15-f2e2-4a39-9c58-b0d2f8ef7ef2"]
    }
  ]
}
```

Behavior:

- Computes per-member schedules from rules + overrides.
- Applies confirmed booking conflicts per member.
- Applies each member's synced external busy windows (Feature 6) before slot assignment.

### `POST /v0/team-bookings`

Public booking commit endpoint for team event types.

Request:

```json
{
  "teamSlug": "customer-success",
  "eventSlug": "team-intro",
  "startsAt": "2026-03-04T17:00:00.000Z",
  "timezone": "Asia/Kolkata",
  "inviteeName": "Pat Lee",
  "inviteeEmail": "pat@example.com",
  "answers": {
    "company": "Acme"
  }
}
```

Success response:

```json
{
  "ok": true,
  "booking": {
    "id": "1f843e14-460f-4b24-b36c-175c51be1c15",
    "eventTypeId": "38fef2f8-70f0-4078-b76e-33d8a773047f",
    "organizerId": "5e8d2e15-f2e2-4a39-9c58-b0d2f8ef7ef2",
    "inviteeName": "Pat Lee",
    "inviteeEmail": "pat@example.com",
    "startsAt": "2026-03-04T17:00:00.000Z",
    "endsAt": "2026-03-04T17:30:00.000Z",
    "assignmentUserIds": ["5e8d2e15-f2e2-4a39-9c58-b0d2f8ef7ef2"],
    "teamMode": "round_robin"
  },
  "actions": {
    "cancel": {
      "token": "opaque-token",
      "expiresAt": "2026-04-03T17:00:00.000Z",
      "lookupUrl": "https://api.example.com/v0/bookings/actions/opaque-token",
      "url": "https://api.example.com/v0/bookings/actions/opaque-token/cancel"
    },
    "reschedule": {
      "token": "opaque-token",
      "expiresAt": "2026-04-03T17:00:00.000Z",
      "lookupUrl": "https://api.example.com/v0/bookings/actions/opaque-token",
      "url": "https://api.example.com/v0/bookings/actions/opaque-token/reschedule"
    }
  },
  "email": {
    "sent": true,
    "provider": "resend"
  },
  "webhooks": {
    "queued": 1
  },
  "calendarWriteback": {
    "queued": 1,
    "processed": 1,
    "succeeded": 1,
    "retried": 0,
    "failed": 0
  }
}
```

Notes:

- Booking write remains transaction-safe.
- Team assignment rows enforce per-member slot uniqueness.
- Member selection and commit checks include synced external busy windows.
- Existing `/v0/bookings/actions/:token/cancel` and `/v0/bookings/actions/:token/reschedule` remain valid for team bookings.

## Feature 6 Endpoints (Calendar Sync Hardening v1)

Auth required for all endpoints in this section.

### `GET /v0/calendar/sync/status`

Returns provider-level sync connection state for the authenticated user.

Success response:

```json
{
  "ok": true,
  "providers": [
    {
      "provider": "google",
      "connected": true,
      "externalEmail": "owner@example.com",
      "lastSyncedAt": "2026-03-01T10:15:00.000Z",
      "nextSyncAt": "2026-03-01T10:45:00.000Z",
      "lastError": null
    }
  ]
}
```

Notes:

- If Google is not connected, response still includes a `google` provider row with `connected: false`.

### `POST /v0/calendar/google/connect/start`

Starts Google OAuth by minting a signed state token and returning the authorization URL.

Request:

```json
{
  "redirectUri": "http://localhost:3000/settings/calendar/google/callback"
}
```

Success response:

```json
{
  "ok": true,
  "provider": "google",
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "state": "signed-state-token",
  "expiresAt": "2026-03-01T10:20:00.000Z"
}
```

Error responses:

- `400` invalid request body.
- `500` Google OAuth env config missing (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`).

### `POST /v0/calendar/google/connect/complete`

Completes Google OAuth code exchange and upserts encrypted connection tokens.

Request:

```json
{
  "code": "4/0AX4XfWj...",
  "state": "signed-state-token",
  "redirectUri": "http://localhost:3000/settings/calendar/google/callback"
}
```

Success response:

```json
{
  "ok": true,
  "connection": {
    "provider": "google",
    "connected": true,
    "externalEmail": "owner@example.com",
    "lastSyncedAt": null,
    "nextSyncAt": null,
    "lastError": null
  }
}
```

Error responses:

- `400` invalid body / invalid or expired state / no refresh token returned.
- `500` Google OAuth env config missing.
- `502` provider exchange/profile fetch failure.

### `POST /v0/calendar/google/disconnect`

Deletes Google connection(s) and associated cached busy windows for the authenticated user.

Request body: empty object `{}` or omitted body.

Success response:

```json
{
  "ok": true,
  "provider": "google",
  "disconnected": true
}
```

### `POST /v0/calendar/google/sync`

Fetches Google free/busy windows and stores normalized busy blocks for conflict detection.

Request:

```json
{
  "start": "2026-03-01T00:00:00.000Z",
  "end": "2026-03-08T00:00:00.000Z"
}
```

Request notes:

- `start`/`end` are optional.
- If omitted, API uses default rolling sync window.

Success response:

```json
{
  "ok": true,
  "provider": "google",
  "syncWindow": {
    "startIso": "2026-03-01T00:00:00.000Z",
    "endIso": "2026-03-08T00:00:00.000Z"
  },
  "busyWindowCount": 6,
  "refreshedAccessToken": false,
  "lastSyncedAt": "2026-03-01T10:15:00.000Z",
  "nextSyncAt": "2026-03-01T10:45:00.000Z"
}
```

Error responses:

- `400` invalid body or invalid sync range.
- `404` Google calendar not connected.
- `500` Google OAuth env config missing.
- `502` provider sync failure (also records `lastError` + `nextSyncAt`).

## Feature 7 Endpoints (Outlook + Calendar Writeback)

### Microsoft calendar connection/sync

- `POST /v0/calendar/microsoft/connect/start`
- `POST /v0/calendar/microsoft/connect/complete`
- `POST /v0/calendar/microsoft/disconnect`
- `POST /v0/calendar/microsoft/sync`

Behavior:

- Same auth model and encrypted credential handling as Google endpoints.
- Same sync status representation under `GET /v0/calendar/sync/status`.
- `/v0/calendar/microsoft/sync` response shape matches Google sync endpoint and returns `provider: "microsoft"`.

### `GET /v0/calendar/writeback/status`

Auth required. Returns external writeback summary for the authenticated organizer.

Success response:

```json
{
  "ok": true,
  "summary": {
    "pending": 1,
    "succeeded": 42,
    "failed": 0
  },
  "failures": []
}
```

### `POST /v0/calendar/writeback/run`

Auth required. Processes due external writeback rows for the authenticated organizer.

Request body (optional):

```json
{
  "limit": 25
}
```

Success response:

```json
{
  "ok": true,
  "limit": 25,
  "processed": 3,
  "succeeded": 2,
  "retried": 1,
  "failed": 0
}
```

Notes:

- Writeback operations are `create`, `cancel`, and `reschedule`.
- Retries use bounded exponential backoff.
- Final failures are visible through `GET /v0/calendar/writeback/status`.
