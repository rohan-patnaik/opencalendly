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
- Idempotency keys are enforced for booking-create, team booking-create, and booking-reschedule mutation endpoints.
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

Execution plan (Feature 10 PR flow):

1. Release-readiness test suite
   - add a dedicated test suite covering one-on-one, team round-robin, team collective, webhook retry behavior, and calendar-sync conflict blocking
   - include the suite in smoke coverage used by CI
2. Security readiness
   - publish `docs/SECURITY_CHECKLIST.md` and mark v1.0 gate items complete
3. Operator readiness
   - publish `docs/OPERATOR_RUNBOOK.md` with incident/replay/recovery/restore drill procedures
4. Deploy readiness
   - publish `docs/PROD_DEPLOY_CHECKLIST.md` with pre-deploy, deploy, validation, and rollback gates
5. Release packaging
   - publish `docs/releases/v1.0.0.md` with highlights + migration notes
6. Merge gate
   - CodeRabbit + Greptile + CI green
   - resolve all review threads
   - merge without deleting feature branch

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

## Post-v1 UI Parity Track

### Chore A (PR#16): Wrangler dependency sync

Acceptance criteria:

- `apps/api/package.json` updates Wrangler dependency (`^4.3.0` -> `^4.69.0`).
- `package-lock.json` is in sync with dependency update.
- No feature/API behavior changes are introduced.
- `npm run lint`, `npm run test`, and `npm run typecheck` remain green.
- `npm run dev:api` starts successfully.

### Feature 11: UI foundation + homepage parity + theme + auth UX

Acceptance criteria:

- Homepage (`/`) ships a modern product surface with links to implemented product routes.
- Shared UI foundation exists for app chrome/navigation and reusable card/CTA patterns.
- Global theme toggle supports persisted `light`, `dark`, and `system` preferences.
- `/auth/sign-in` requests magic-link tokens via `POST /v0/auth/magic-link`.
- `/auth/verify` verifies tokens via `POST /v0/auth/verify` and stores session client-side.
- Dashboard session bootstrap uses managed auth state + `GET /v0/auth/me` (no manual token paste flow).
- Tests cover new session/theme utility logic.
- `README.md`, `docs/PRD.md`, and `docs/ARCHITECTURE.md` reflect the UI/auth foundation.

### Feature 12: Organizer console parity (UI over implemented APIs)

Acceptance criteria:

- Organizer-authenticated UI supports event types create/edit/list.
- Organizer-authenticated UI supports availability rules + overrides management.
- Organizer-authenticated UI supports teams, members, and team event type management.
- Organizer-authenticated UI supports webhook subscriptions and delivery runner trigger.
- Organizer-authenticated UI supports Google/Microsoft calendar connect/sync/disconnect/status.
- Organizer-authenticated UI supports writeback queue status and runner trigger.
- Missing read/list API endpoints required by the console are added and documented in `docs/API.md`.
- Loading, empty, error, and authorization states are handled across all organizer panels.

### Feature 13: Public booking/action UX parity

Acceptance criteria:

- One-on-one public booking UI is redesigned for production-quality interaction and clarity.
- Team booking public route UX is added on top of existing team availability/booking APIs.
- Booking action pages (`/bookings/actions/[token]`) support cancel and reschedule flows.
- Action pages correctly handle invalid/expired/conflict/idempotent replay states.
- Embed playground route exists for script generation and preview.
- Existing analytics funnel tracking remains wired from public page interactions.
- Regression coverage includes `/demo/intro-call` and `/dashboard` behavior post-redesign.

### Feature 15: App shell parity foundation

Scope:
- Build shared app-level UX infrastructure (shell + tokens + reusable primitives).
- Touch auth/dashboard/organizer route wrappers for consistent composition.
- Exclude marketing-page parity and booking-flow redesign from this feature.

Acceptance criteria:

- Global app shell is rebuilt with sticky top nav, auth-aware actions, and responsive mobile drawer navigation.
- Design system primitives are standardized and reusable:
  - tokens (spacing/radius/elevation/type/motion)
  - theme-aware components for button/card/form/toast/modal/tabs/table/page shell
- Theme toggle supports persisted `light`, `dark`, and `system` preferences.
- Ad-hoc wrappers on `/auth/sign-in`, `/auth/verify`, `/dashboard`, and `/organizer` are replaced with shared shell primitives.
- No major accessibility regressions are introduced by shell changes.

### Feature 16: Booking flow parity

Scope:
- Upgrade public booking, team booking, booking-action, and embed UX surfaces.
- Keep existing booking correctness and API contracts intact.
- Exclude organizer console IA changes and marketing pages.

Acceptance criteria:

- One-on-one booking UX parity is improved for `/demo/intro-call` (slot browser, timezone UX, attendee details, confirmation state).
- Team booking UX parity is improved for `/team/:teamSlug/:eventSlug` (mode clarity, member context, capacity handling).
- Booking action UX parity is improved for `/bookings/actions/:token` with explicit success/error state handling (`404`, `410`, `409`).
- Embed playground UX parity is improved for `/embed/playground` with script generation + live preview behavior.
- One-on-one and team booking continue to work end-to-end in UI against existing APIs.

### Feature 17: Organizer console parity

Scope:
- Improve organizer/dashboard operational IA and panel usability over existing APIs.
- Add only missing read/list API contracts required for usable organizer UX.
- Exclude public marketing surfaces.

Acceptance criteria:

- Organizer console information architecture is improved with clearer route/panel ownership and operational navigation.
- Organizer pages support production-quality loading/empty/error states for event types, availability, teams, webhooks, calendar sync, and writeback controls.
- Dashboard + organizer UX no longer depends on manual session token paste in normal flows.
- If required for parity, missing read/list APIs are added and documented:
  - `GET /v0/event-types`
  - `GET /v0/me/availability`
  - `GET /v0/teams`
  - `GET /v0/teams/:teamId/members`
  - `GET /v0/teams/:teamId/event-types`

### Feature 18: Marketing surface parity

Scope:
- Rebuild marketing information architecture and add dedicated marketing routes.
- Map CTA actions to already-implemented product flows.
- Exclude backend feature development.

Acceptance criteria:

- Marketing homepage (`/`) ships enterprise-grade information architecture: hero, social proof, workflow blocks, integrations, pricing preview, CTA, and deep footer.
- Additional marketing routes exist and are production-ready:
  - `/pricing`
  - `/features`
  - `/solutions`
  - `/resources`
- Marketing CTA actions route to live implemented product flows.
- Marketing pages are responsive and coherent with app shell design system.

### Feature 19: Cloudflare deploy + custom domain wiring hardening

Scope:
- Make production deployment/domain wiring reproducible from repo docs/scripts.
- Configure API worker for production custom-domain routing.
- Add domain verification checks to prevent accidental forwarding misconfiguration.

Acceptance criteria:

- API worker config includes a production route for `api.opencalendly.com/*`.
- Repository includes explicit deploy scripts for:
  - API worker production deploy
  - Pages production deploy
- Repository includes a domain verification script that validates:
  - apex/app domain resolves and serves expected host
  - API domain health endpoint responds successfully
- Deployment docs include exact Cloudflare + Porkbun wiring steps and rollback checks.
- `README.md` and `docs/PROD_DEPLOY_CHECKLIST.md` are updated to reference the production deploy/domain flow.

### Feature 20: Obsidian Amber color-system migration (no gradients, token-only)

Scope:
- Apply a full token-based color-system redesign across `apps/web` using Direction A (Obsidian Amber) as default theme.
- Update shared UI primitives and all route/component CSS Modules to consume semantic tokens.
- Remove all gradients and color-mix usage; keep layout/structure unchanged.
- Keep runtime to a single default theme (`obsidian-amber`) without introducing new toggles.

Acceptance criteria:

- `globals.css` defines the Obsidian Amber semantic token set:
  - `--bg-base`, `--bg-surface`, `--bg-elevated`
  - `--text-primary`, `--text-secondary`, `--text-muted`
  - `--border-default`, `--border-strong`
  - `--brand-primary`, `--brand-primary-hover`, `--brand-secondary`
  - `--state-success`, `--state-warning`, `--state-error`, `--state-info`
  - `--focus-ring`
  - interaction tokens (`--bg-hover`, `--bg-pressed`, `--border-hover`, `--border-focus`, `--brand-primary-active`, `--disabled-*`, `--on-brand`)
  - `--state-error-hover`
- Root layout sets default theme via `data-theme="obsidian-amber"`.
- Shared primitives in `apps/web/src/components/ui/primitives.module.css` use semantic tokens for:
  - button variants (`primary`, `secondary`, `ghost`, `danger`) including hover/active/disabled
  - form controls (input/select/textarea) including hover/focus/error/disabled
  - card, toast, modal, tabs, and data table surface/border/text states
- App shell and all route/component CSS modules under `apps/web/src` are migrated to semantic tokens.
- Public booking slot states are tokenized and consistent:
  - default: surface/default-border/primary-text
  - hover: `--bg-hover` + `--border-strong`
  - selected: `--brand-primary` + `--on-brand`
  - disabled: `--disabled-bg` + `--disabled-text` + `--disabled-border`
- Static checks pass:
  - no `gradient(...)` usage in web CSS
  - no `color-mix(...)` usage in web CSS
  - no hardcoded hex/rgb/hsl in web CSS outside token definitions in `globals.css`

### Feature 21: Production auto-deploy on `main` pushes

Scope:
- Ensure production deployment is triggered automatically after successful `CI` completion for each push to `main`.
- Cover both production surfaces:
  - Cloudflare Pages web (`opencalendly.com`, `www.opencalendly.com`)
  - Cloudflare Worker API (`api.opencalendly.com`)
- Document required GitHub repository secrets for unattended deployment.

Acceptance criteria:

- A GitHub Actions workflow deploys production automatically on:
  - successful `CI` completion for `main` via `workflow_run`
  - manual `workflow_dispatch`
- Deploy workflow runs API deploy first, then web deploy.
- Workflow enforces branch-level concurrency (latest `main` run wins).
- Deployment docs clearly list required GitHub secrets and expected values.
- Post-deploy verification includes production domain health checks.
