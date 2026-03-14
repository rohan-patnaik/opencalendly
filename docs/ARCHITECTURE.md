# Architecture

## System diagram

```mermaid
flowchart LR
  U["User Browser"] --> W["Web App (Next.js on Pages)"]
  W --> A["API (Hono on Workers)"]
  A -->|"Hyperdrive"| D["Neon Postgres"]
  A --> G["Google Calendar API"]
  A --> M["Microsoft Graph Calendar API"]
  A --> E["Resend"]
```

## Outbound network boundary

- The API runtime is expected to make outbound HTTPS requests only to:
  - organizer-approved public webhook destinations
  - Clerk backend APIs for token verification and user lookup during `/v0/auth/clerk/exchange`
  - Google OAuth, profile, and Calendar APIs (`accounts.google.com`, `oauth2.googleapis.com`, `openidconnect.googleapis.com`, `www.googleapis.com`)
  - Microsoft OAuth and Graph APIs (`login.microsoftonline.com`, `graph.microsoft.com`)
  - Resend (`api.resend.com`)
  - Cloudflare DNS-over-HTTPS for webhook target safety checks (`cloudflare-dns.com`)
- Organizer-managed webhook destinations are dynamic, so they cannot be pinned to a small static hostname allowlist. The application instead enforces:
  - `https://` only
  - public hostnames only
  - no embedded credentials
  - DNS resolution that stays out of private, loopback, link-local, carrier-grade NAT, metadata-service, and other internal IP space before each delivery attempt
- Production networking should still block private-network egress from the API runtime. The app-level webhook validation is a second line of defense, not the only one.
- If the hosting platform supports explicit outbound policy controls, keep the static provider domains above reachable and keep organizer-supplied webhooks constrained to public-Internet egress for whatever HTTPS port is encoded in the validated destination URL.
- Failures from DNS policy, firewall policy, or provider outages should surface as explicit webhook delivery or calendar sync/writeback errors. They should never silently degrade into successful booking commits.

## Data model overview

- `users`: account identity and timezone.
- `sessions`: session tokens (DB-backed auth sessions).
- `event_types`: host-defined booking templates.
- `teams`: organizer-owned teams.
- `team_members`: team membership + role.
- `team_event_types`: links a base event type to a team scheduling mode (`round_robin`/`collective`).
- `team_event_type_members`: required members for a team event type.
- `availability_rules`: recurring weekly availability windows.
- `availability_overrides`: date-specific changes.
- `bookings`: confirmed/canceled/rescheduled booking records.
- `team_booking_assignments`: per-member slot assignment rows for team bookings (enforces member-level uniqueness).
- `calendar_connections`: encrypted OAuth credentials + sync cursor/status per user/provider.
- `calendar_busy_windows`: normalized external busy windows used for slot conflict blocking.
- `booking_external_events`: provider writeback state per booking (`create`/`cancel`/`reschedule`) with retry metadata.
- `webhook_subscriptions`: organizer-managed outbound webhook endpoints/event filters, with signing secrets stored encrypted at rest (`secret_encrypted`) and plaintext retained only during migration/backfill.
- `webhook_deliveries`: queued delivery attempts with retry state and final status.
- `analytics_funnel_events`: page/slot/booking funnel stages keyed by organizer + event type.
- `email_deliveries`: best-effort delivery telemetry for confirmation/cancellation/reschedule emails.
- `idempotency_requests`: request dedupe records for booking mutations (`scope + key hash + request hash + replay payload`).
- `demo_admissions_daily`: UTC-day admission counter for launch demo accounts.
- `demo_account_daily_usage`: per-account UTC-day credit ledger with bypass metadata.
- `demo_credit_events`: idempotent feature-charge rows keyed by `(date + user + source key)`.
- `waitlist_entries`: UTC-day waitlist joins for exhausted launch-demo admission days.

## Frontend architecture (post-v1 parity track)

## Current module boundaries

- `apps/api/src/app.ts` is the API composition root only:
  - shared middleware
  - route registration
  - global error boundary
- API HTTP handlers are split by domain under `apps/api/src/routes`:
  - auth/session
  - analytics
  - public booking and availability
  - booking actions
  - organizer operations
  - calendar connect/sync/writeback
  - webhooks, demo, and embed
- Shared server-side workflow helpers live under `apps/api/src/server` and keep booking, rate-limit, auth-session, demo-quota, and writeback logic out of route registration files.
- Webhook secret storage is application-encrypted and decrypted only at delivery-signing time; a post-deploy backfill command removes remaining plaintext legacy rows.
- Web route shells are intentionally thin:
  - route-level `page.client.tsx` files delegate feature logic into adjacent `page.client.impl.tsx` or `apps/web/src/features/*`
  - organizer, dashboard, and booking flows keep state and UI split into feature-local hooks, panels, and API clients
- Cross-app request and response contracts that are stable across API and web live in `packages/shared/src/contracts.ts` and existing schema modules.
- Web responses emit a baseline CSP plus security headers; authenticated organizer/auth surfaces deny framing, while public booking/embed surfaces remain frame-compatible.
- API responses emit a deny-by-default header set to reduce script, frame, and content-type abuse on JSON/script endpoints.

- Global app chrome wraps all routes and provides:
  - primary navigation
  - session state affordances (signed-in identity + sign-out)
  - mobile drawer navigation for compact viewports
- Shared UI primitives live under `apps/web/src/components/ui`:
  - `PageShell`, `Card`, `Button`/`LinkButton`, `FormField`, `Toast`, `Modal`, `Tabs`, `DataTable`
  - shared tokenized styling via `primitives.module.css` for consistency across auth/dashboard/organizer routes
- Theme system:
  - CSS variable tokens in global stylesheet for a single dark palette
  - no runtime theme switching (`light`/`system` removed to reduce UX clutter)
- Auth session model:
  - API issues a DB-backed `HttpOnly` session cookie after Clerk exchange or local dev bootstrap
  - client-side `AuthSession` store in localStorage keeps non-secret metadata only (`user`, `issuer`, `expiresAt`)
  - shared hook observes session metadata across tabs via storage + custom events
  - bootstrap validation through `GET /v0/auth/me` before loading authenticated dashboard data
  - authenticated browser mutations send `credentials: 'include'`, and the API enforces same-origin checks for cookie-backed non-GET requests
- Auth route shells:
  - `/auth/sign-in` completes Clerk sign-in, then exchanges the Clerk session via `POST /v0/auth/clerk/exchange`
  - `/auth/verify` is a legacy route that redirects back to Clerk sign-in
- Organizer console shell:
  - `/organizer` is the authenticated operational UI over organizer APIs:
    - left-rail section navigation (`#event-types`, `#availability`, `#teams`, `#webhooks`, `#calendars`, `#writeback`)
    - operational summary cards for key resource counts (event types, teams, members, webhooks, connected calendars, writeback failures)
    - event type management (`GET/POST/PATCH /v0/event-types`)
    - availability management (`GET /v0/me/availability`, `PUT /v0/me/availability/*`)
    - team/membership/team-event management (`GET /v0/teams*`, `POST /v0/teams*`, `POST /v0/team-event-types`)
    - webhook operations (`GET/POST/PATCH /v0/webhooks`, `POST /v0/webhooks/deliveries/run`)
    - calendar sync + writeback operations (`/v0/calendar/*`)
- Dashboard shell:
  - `/dashboard` includes authenticated analytics filters plus quick-action links to organizer sections for operational follow-through.
- Calendar OAuth callback shells:
  - `/settings/calendar/google/callback`
  - `/settings/calendar/microsoft/callback`
  - each callback completes provider OAuth by calling `/v0/calendar/{provider}/connect/complete` with the returned code/state
- Public booking/action shells:
  - `/:username/:eventSlug` one-on-one booking UX (slot grouping, timezone picker, booking form)
  - `/team/:teamSlug/:eventSlug` team booking UX over team availability/booking APIs
  - `/bookings/actions/:token` cancel/reschedule UX with token state handling (`404`, `410`, `409` conflict)
  - `/embed/playground` script generator + live widget preview for `/v0/embed/widget.js`
  - seeded launch demo routes (`/demo/*`, `/team/demo-team/*`, demo booking actions) are auth-gated and show shared quota state
- Marketing shells:
  - `/` product homepage with proof strip, workflow blocks, integration highlights, and route CTAs
  - `/pricing`, `/features`, `/solutions`, `/resources` for top-level product information architecture
- Typed API client utilities:
  - centralized authenticated `GET`/`POST`/`PATCH`/`PUT` wrappers
  - organizer-focused typed client module used by console panels
  - normalized error extraction from API payloads for consistent UI state handling

## Critical flows

### Compute availability

1. Load weekly availability rules for organizer.
2. Apply date overrides for query range.
3. Remove windows blocked by existing bookings and buffers.
4. Remove windows blocked by synced external busy windows (Feature 6).
5. Return timezone-aware slots in paginated form.

### Book slot (no double-book)

1. Client selects slot and submits booking request.
2. API validates payload with Zod.
3. API runs DB transaction and inserts booking.
4. Transaction re-check includes external busy windows.
5. Unique slot constraint rejects race-condition duplicates.
6. API returns success and sends confirmation email.

### Reschedule/cancel

1. User opens secure tokenized link from email.
2. API validates token, permission, and booking state.
3. API updates booking status/history atomically.
4. API sends reschedule/cancel email notification.

### Webhook delivery loop (Feature 4)

1. Booking lifecycle writes enqueue delivery rows for subscribed organizers.
2. Runner endpoint selects due `pending` deliveries.
3. API signs payload (`X-OpenCalendly-Signature`) and posts to target URL.
4. Non-2xx / transient failures reschedule with exponential backoff.
5. Delivery marks `succeeded` or `failed` after bounded attempts.

### Team booking (Feature 5)

1. Public API resolves team event type (`team + mode + required members`).
2. API computes member-level slot availability from each member's rules/overrides and confirmed bookings.
3. `round_robin`: choose one assignee using persistent cursor rotation.
4. `collective`: require slot intersection across all required members.
5. Inside transaction, API writes booking + action tokens + team assignment rows.
6. Unique constraints prevent double-booking races at member slot level.
7. Cancel/reschedule keeps token flow unchanged and updates/deletes assignment rows accordingly.

### Calendar sync hardening (Feature 6)

1. Authenticated organizer starts Google OAuth (`/calendar/google/connect/start`).
2. API signs state with `SESSION_SECRET` and returns provider auth URL.
3. OAuth completion exchanges code, encrypts tokens, and upserts `calendar_connections`.
4. Sync endpoint fetches Google free/busy and writes normalized rows into `calendar_busy_windows`.
5. Availability + booking commit paths treat those windows as hard conflict blocks.
6. Disconnect removes connection + busy-window cache atomically.

Network assumption:

- Production must allow outbound HTTPS to the Google and Microsoft domains listed in the outbound network boundary section. Blocking those domains turns sync/connect flows into operational failures rather than application bugs.

### Calendar writeback hardening (Feature 7)

1. Booking lifecycle events enqueue provider writeback rows in `booking_external_events`.
2. Writeback operations are `create`, `cancel`, and `reschedule`.
3. Provider adapters (Google + Microsoft) execute external event writes using encrypted connection tokens.
4. Failures retry with bounded exponential backoff (`next_attempt_at`) until `max_attempts`.
5. Final failed rows remain visible through writeback status endpoints for operator action.

Network assumption:

- Writeback uses the same provider egress boundary as sync/connect flows. Firewall or DNS policy mistakes should be diagnosed as provider-network failures first.

### Analytics + operator dashboard (Feature 8)

1. Public booking page emits `page_view` and `slot_selection` events.
2. Booking commit path emits `booking_confirmed` funnel event server-side.
3. Booking lifecycle email sends write telemetry rows to `email_deliveries`.
4. Analytics endpoints aggregate:
   - funnel progression + booking status distribution
   - team round-robin assignment distribution + collective booking volume
   - webhook/email delivery health summaries
5. Web dashboard reads those authenticated endpoints with date/event/team filters.

### Reliability + platform hardening (Feature 9)

1. Public availability and booking mutation routes apply request-level rate limiting by IP + route scope.
2. Booking create, team booking create, and reschedule mutations require `Idempotency-Key`.
3. API stores idempotency claim/replay state in `idempotency_requests`.
4. Repeated identical requests replay stored response; mismatched payload reuse returns `409`.
5. Branch protection enforces required checks + PR-only merges on `main`.

### Launch demo quota (Feature 3 refresh)

1. `GET /v0/demo-credits/status` returns the daily global admission pool plus the authenticated account’s credit budget.
2. Feature routes charge credits inside the real mutation path, not via a client-side preflight endpoint.
3. New accounts are admitted lazily on their first successful paid action if today’s admission pool still has room.
4. Allowlisted dev/internal emails bypass both admission counting and credit deductions.
5. Exhausted days keep waitlist capture active so interest can be queued without over-consuming provider limits.

## Correctness and idempotency notes

- Booking writes must be transactional.
- Slot uniqueness is enforced in DB (not only in app logic).
- Team bookings additionally enforce per-member slot uniqueness through `team_booking_assignments`.
- External calendar conflicts are enforced at compute-time and re-checked at commit-time.
- External event writeback state is idempotent per booking+provider and retry-safe.
- Booking-create, team-booking-create, and booking-reschedule endpoints are idempotent by explicit request keys.
- Email sends should be keyed by idempotency token to avoid duplicates on retries.
- Webhooks use exponential backoff and dedupe by subscription + event id.
- Public booking and availability routes are rate-limited to reduce abuse and free-tier DB exhaustion.
