# API (v0)

## Principles

- JSON REST endpoints under `/v0`.
- Zod-validated request and response contracts.
- Small payloads and pagination by default.

## Current implemented endpoints

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

Failure response:

```json
{
  "ok": false,
  "error": "Missing database connection string. Configure Hyperdrive or DATABASE_URL."
}
```

## Planned endpoints (Feature 1+)

- `POST /v0/auth/magic-link`
- `POST /v0/auth/verify`
- `GET /v0/users/:username/event-types/:slug`
- `GET /v0/users/:username/event-types/:slug/availability`
- `POST /v0/bookings`
- `POST /v0/bookings/:id/reschedule`
- `POST /v0/bookings/:id/cancel`

## Webhook event schema (v0)

Source of truth: `packages/shared/src/schemas.ts` (`webhookEventSchema`).

```json
{
  "id": "6e3f4ca5-2e87-486f-bce1-8eb3fca4d06e",
  "type": "booking.created",
  "createdAt": "2026-02-24T18:10:00.000Z",
  "payload": {
    "bookingId": "74145539-7dbf-4d00-8244-d54d121e65f7",
    "eventTypeId": "2f917842-cf97-4d0d-bf8b-1f828de17e85",
    "organizerId": "baf9a893-2f15-4cd2-b6d8-d2ea5de8f8eb",
    "inviteeEmail": "person@example.com",
    "startsAt": "2026-02-25T16:00:00.000Z",
    "endsAt": "2026-02-25T16:30:00.000Z"
  }
}
```
