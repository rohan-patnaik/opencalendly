# Security / Beta Blocker Tracker

Last updated: 2026-03-19T10:32:00+05:30

This document tracks the highest-priority blockers discovered during authenticated QA before beta access is opened wider. Some items are reliability defects rather than traditional security issues, but they are tracked here per release-review request.

## Open / In Progress

No open P1 blockers in the flows verified in this pass.

### GA hardening and reliability verification

Status: In progress on feature branch

Current implementation status:

- Production env validation now fails when dedicated webhook-secret and telemetry keys are missing.
- Structured audit events now cover:
  - auth exchange failures
  - availability reads
  - booking commit outcomes
  - booking-action misuse
  - calendar connect/disconnect/sync
  - webhook subscription create/update/toggle
  - webhook delivery batches and permanent failures
  - calendar writeback batches and permanent failures
- Operator health now includes:
  - overall `status`
  - machine-readable `alerts`
  - webhook queue backlog/failure summary
  - calendar writeback backlog/failure summary
  - provider freshness/error summary by provider
- Security regression tests now cover:
  - production env validation
  - sensitive-route frame denial
  - embed route compatibility
  - session cookie secure-flag behavior
- Remaining work in this feature:
  - GA docs/checklists/runbook updates
  - repeatable `k6` harness and GA readiness artifact

### Google calendar integration verification

Status: Resolved after Google OAuth scope configuration

Observed behavior:

- Added the Google Calendar scope in Google Auth Platform and reconnected the account.
- The callback returned with the granted scope including:
  - `https://www.googleapis.com/auth/calendar`
- Verified end-to-end on the demo account:
  - Google connect completed successfully
  - Google sync succeeded through `/v0/calendar/google/sync`
  - Sync stored busy-window data in the app (`busyWindowCount: 1`)
  - App-managed booking create triggered immediate calendar writeback with `succeeded: 1`
  - The Google Calendar event was present in the connected primary calendar
  - App-managed booking cancel triggered immediate calendar writeback with `succeeded: 1`
- The same Google Calendar event transitioned to `status: cancelled`

### Microsoft calendar integration verification

Status: Resolved after Azure local OAuth app setup and Microsoft writeback lookup fix

Observed behavior:

- Local Azure App Registration was configured with:
  - redirect URI `http://localhost:3000/settings/calendar/microsoft/callback`
  - supported accounts `Any Entra ID tenant + Personal Microsoft accounts`
  - Microsoft Graph delegated permissions:
    - `openid`
    - `email`
    - `offline_access`
    - `User.Read`
    - `Calendars.Read`
    - `Calendars.ReadWrite`
- Verified with the provided Outlook account:
  - first-time Microsoft sign-up created the OpenCalendly account
  - returning-user Microsoft sign-in succeeded afterward
  - Microsoft calendar connect completed successfully
  - Microsoft calendar sync completed successfully from organizer
- Writeback initially retried forever because the Microsoft idempotency lookup attempted:
  - `GET /me/events?$filter=transactionId eq '...'`
  - Microsoft Graph rejected that with `ErrorInvalidProperty` because `transactionId` does not support filtering

Resolution summary:

- Replaced the unsupported Microsoft Graph `$filter=transactionId ...` lookup with a recent-events query ordered by `createdDateTime desc`, then filtered client-side by `transactionId`.
- Added regression tests for the Microsoft recent-events lookup and event create payload.
- Re-verified end-to-end:
  - Microsoft calendar connect
  - Microsoft calendar sync
  - Microsoft writeback create through the queue runner
  - Microsoft writeback cancel through the queue runner
  - Microsoft writeback reschedule through the real booking-action API
- Confirmed in Outlook/Graph:
  - created event present with matching `transactionId`
  - canceled/deleted event returns `404` after queue cancellation
  - rescheduled booking keeps the same Outlook event ID and the writeback row completes with `status: succeeded`

## Resolved

### P1: Organizer calendar panel showed false empty state while bootstrap data was still loading

Status: Resolved on current feature branch

Observed behavior:

- `/v0/calendar/sync/status` returned provider rows for the authenticated organizer session.
- Slow organizer bootstrap requests delayed the first complete payload.
- The page rendered the console immediately with default empty arrays, so the calendar panel showed:
  - `No provider statuses available.`
- This made the organizer console look broken even though the provider state arrived later.

Resolution summary:

- Added an explicit organizer `data-loading` state after auth succeeds but before the first bootstrap attempt resolves.
- The organizer page now shows a loading card instead of rendering the console with fake empty data.
- Re-verified in the browser:
  - after 5 seconds, the page shows `Loading organizer controls…`
  - it no longer shows `No provider statuses available.`
  - after bootstrap completes, the Google Calendar row and organizer data render normally

### Google OAuth / Clerk session exchange failure

Status: Resolved on current feature branch

Resolution summary:

- Filtered invalid Clerk usernames before exchange.
- Normalized local auth request host handling for the Clerk session exchange path.
- Expanded local development CSP handling for `localhost` / `127.0.0.1`.

### P1: Organizer mutations crash in demo quota serialization

Status: Resolved on current feature branch

Observed behavior:

- Creating an event type from the authenticated organizer console returned `500 Internal Server Error`.
- API log:
  - `TypeError: input.admittedAt.toISOString is not a function`

Resolution summary:

- Normalized demo credit timestamps so mixed `Date` / ISO-string values are serialized safely.
- Expanded regression coverage for mixed timestamp input shapes.
- Re-verified organizer event-type creation with the authenticated demo account.

### P1: Signed-in demo routes still miss the local auth session on some browser fetch paths

Status: Resolved on current feature branch

Observed behavior:

- Signed-in `/demo/intro-call` rendered `Event unavailable`.
- Signed-in `/team/demo-team/team-intro-call` rendered `Team event unavailable`.
- Embed playground preview inherited the same hostname mismatch.

Resolution summary:

- Normalized remaining browser-side local API URLs to the active hostname across demo quota, booking, booking actions, team booking, and embed flows.
- Re-verified one-on-one booking, reschedule, team booking, team cancel, and embed preview on the authenticated demo account.

## QA Coverage

Verified end-to-end on the authenticated demo account:

- Google OAuth sign-in and app session exchange
- Dashboard authenticated load
- Organizer authenticated load
- Organizer event-type creation
- One-on-one demo booking
- One-on-one booking reschedule
- Team demo booking
- Team booking cancel action
- Embed playground preview
- Webhook subscription creation
- Webhook delivery worker execution
- Public webhook delivery for `booking.created`, `booking.canceled`, and `booking.rescheduled`
- Webhook signature header validation against the configured secret
- Google calendar provider connect
- Google calendar provider sync
- Google calendar provider writeback create
- Google calendar provider writeback cancel
- Microsoft social sign-in
- Microsoft calendar provider connect
- Microsoft calendar provider sync
- Microsoft calendar provider writeback create
- Microsoft calendar provider writeback cancel
- Microsoft calendar provider writeback reschedule
