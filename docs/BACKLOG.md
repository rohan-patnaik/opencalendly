# Ordered Backlog (One Feature per PR)

## Feature 70 (PR#79): GA security hardening and reliability verification

Scope:

- Tighten production-only environment policy for security-sensitive secrets and deploy settings while keeping local development permissive.
- Add privacy-safe structured audit/telemetry events around auth exchange failures, booking action misuse, webhook lifecycle changes, calendar provider lifecycle changes, and permanent queue failures.
- Extend the existing operator health contract to include explicit `ok/degraded` status, queue backlog/failure summaries, and provider sync freshness signals.
- Add regression tests for API/web security headers, sensitive-route framing behavior, public embed compatibility, and production env validation.
- Add a repeatable `k6` load-test harness, profile documentation, and a GA readiness artifact for contention-sensitive booking, webhook, and calendar writeback flows.
- Update GA-facing security, deploy, operator, and tracking docs to reflect the hardened contract and alert thresholds.

Acceptance criteria:

- Production env validation fails when `WEBHOOK_SECRET_ENCRYPTION_KEY` or `TELEMETRY_HMAC_KEY` are missing, while local/dev validation remains permissive.
- Production docs explicitly validate `APP_BASE_URL`, `API_BASE_URL`, secure cookie behavior, and Google/Microsoft redirect URIs.
- Structured audit-style events are emitted for:
  - Clerk auth exchange upstream failures
  - calendar connect and disconnect attempts/results
  - webhook subscription create/update/toggle
  - webhook delivery batch execution
  - calendar writeback batch execution and permanent failure
  - booking-action misuse responses (`404/409/410`)
- `/v0/analytics/operator/health` returns explicit overall status plus:
  - webhook backlog/failure totals
  - calendar writeback backlog/failure totals
  - provider sync freshness/error summaries
  - existing email delivery summary
- Dashboard operator health UI renders the expanded health contract without regressing existing analytics views.
- Security regression coverage exists for:
  - production CSP/security headers
  - authenticated route frame denial
  - public embed compatibility
  - production env validation for dedicated webhook/telemetry secrets
- A dedicated `k6` harness exists for:
  - public availability read
  - one-on-one same-slot booking contention
  - team booking contention
  - reschedule/cancel bursts
  - webhook delivery batch execution
  - calendar writeback runner execution
- Load-testing docs define smoke, baseline, and contention profiles with pass/fail criteria and setup requirements.
- A versioned GA-readiness artifact exists under `docs/releases/` with the required verification/checklist sections.
- Docs updated:
  - `docs/SECURITY_CHECKLIST.md`
  - `docs/PROD_DEPLOY_CHECKLIST.md`
  - `docs/OPERATOR_RUNBOOK.md`
  - `docs/SECURITY_TRACKER.md`
- Validation passes:
  - `npm run env:check`
  - `npm run lint`
  - `npm run test`
  - `npm run typecheck`
  - `git diff --check`

## Feature 69 (PR#TBD): FAQ resource and homepage footer attribution

Scope:

- Add the new user FAQ document to the repository and surface it from the resources page.
- Add a small footer credit line on the homepage without changing the current license label.
- Keep the change scoped to marketing/docs presentation with no product behavior changes.

Acceptance criteria:

- `docs/FAQ.md` exists and covers the intended end-user auth/calendar/booking questions.
- `/resources` includes a link to the FAQ document.
- The homepage footer includes the requested attribution line while still showing the current project license string.
- Validation passes:
  - `npm run env:check`
  - `npm run lint`
  - `git diff --check`

## Feature 68 (PR#TBD): Microsoft calendar writeback lookup fix

Scope:

- Finish local Microsoft provider verification for sign-in, calendar connect, sync, and writeback.
- Fix the Microsoft writeback idempotency lookup so queue retries can safely reuse already-created Outlook events.
- Keep the change scoped to the Microsoft calendar integration and its regression coverage.

Acceptance criteria:

- Microsoft social sign-in works for the configured Outlook demo account.
- Microsoft calendar connect completes successfully through the organizer flow.
- Microsoft calendar sync succeeds with the configured Microsoft provider.
- Microsoft calendar writeback create succeeds and stores the external event ID.
- Microsoft calendar writeback cancel succeeds and removes the Outlook event.
- Microsoft calendar writeback reschedule succeeds and preserves the linked Outlook event.
- Validation passes:
  - `npm run lint`
  - `npm run test`
  - `npm run env:check`
  - `npx vitest run apps/api/src/lib/microsoft-events.test.ts apps/api/src/lib/calendar-writeback.test.ts`
  - `npm run typecheck`
  - `git diff --check`

## Feature 67 (PR#76): Organizer bootstrap false-empty-state fix

Scope:

- Prevent the organizer console from rendering empty-state panels before the first authenticated bootstrap completes.
- Keep the fix scoped to organizer bootstrap/render timing without changing organizer API contracts.
- Add a small regression test for the organizer page-state decision.

Acceptance criteria:

- Signed-in organizer users see a loading state while the first organizer bootstrap is still resolving.
- The organizer console no longer shows `No provider statuses available.` or other fake empty panels during initial bootstrap.
- Once bootstrap resolves, the existing organizer sections render normally, including connected calendar provider rows.
- Validation passes:
  - `npm run env:check`
  - `npm run lint`
  - `npm run test`
  - `npm run typecheck`
  - `git diff --check`

## Feature 66 (PR#76): Beta-blocking authenticated demo and organizer fixes

Scope:

- Fix the organizer mutation crash caused by demo quota timestamp serialization.
- Normalize the remaining browser-side local API requests so authenticated demo, booking, booking-action, and embed flows use the active local hostname consistently.
- Track the current beta-blocking findings in a dedicated doc that can be updated as issues are resolved.

Acceptance criteria:

- Organizer event-type creation no longer crashes with `input.admittedAt.toISOString is not a function`.
- Signed-in one-on-one and team demo pages can load launch-demo event details on local development without host mismatch failures.
- Embed playground preview and booking-action flows use the active local hostname consistently in local development.
- Validation passes:
  - `npm run env:check`
  - `npm run lint`
  - `npm run test`
  - `npm run typecheck`
  - `git diff --check`

## Feature 65 (PR#76): Clerk Google sign-in session exchange fix

Scope:

- Fix Clerk session exchange failures after Google sign-in in local development and production-like flows.
- Ensure the client only forwards usernames that satisfy the app username contract before calling the Clerk exchange endpoint.
- Add regression coverage for the username filtering logic used by the auth session bridge.

Acceptance criteria:

- Google/Clerk sign-in is not blocked by provider-generated usernames that fall outside the app username pattern.
- The auth session bridge still sends valid app-compatible usernames when available and drops invalid ones safely.
- Validation passes:
  - `npm run env:check`
  - `npm run lint`
  - `npm run test`
  - `npm run typecheck`
  - `git diff --check`

## Feature 64 (PR#TBD): Marketing cards and mobile alignment polish

Scope:

- Refine homepage live-route cards, homepage plan-preview cards, and footer layout for better visual alignment on desktop and phone.
- Center the requested marketing-page sections on phone across features, pricing, solutions, and resources.
- Bring the signed-out demo, organizer, and dashboard states closer to the app’s dark surface palette and center the requested phone layouts.

Acceptance criteria:

- Homepage live-route cards are center-aligned and use the darker surfaced card treatment on desktop and phone.
- Homepage plan-preview cards and list rows use the surfaced card treatment and remain visually centered.
- The homepage footer reads cleanly on desktop and collapses into a centered single-column layout on phone.
- Features, pricing, solutions, and resources center the requested hero/section/card content on phone.
- The signed-out one-on-one demo, team demo, organizer, and dashboard states center the requested phone elements, and the demo quota card uses dark-surface styling in dark theme.
- Validation passes:
  - `npm run env:check`
  - `npm run lint`
  - `npm run test`
  - `npm run typecheck`
  - `git diff --check`

## Feature 63 (PR#TBD): Homepage globe render sizing fix

Scope:

- Fix the homepage hero globe so it renders consistently across Windows and other lower-DPR browser environments.
- Keep the change scoped to the globe canvas sizing logic and regression coverage for that render path.
- Do not change homepage copy, route structure, or the calendar/globe rotation behavior.

Acceptance criteria:

- The homepage globe renders fully within its intended square art slot across DPR 1 and DPR 2 browser environments.
- Globe sizing uses the measured canvas box and device pixel ratio instead of a hardcoded multiplier.
- Regression coverage exists for the globe sizing contract passed into `cobe`.
- Validation passes:
  - `npm run env:check`
  - `npm run lint`
  - `npm run test`
  - `npm run typecheck`
  - `git diff --check`

## Feature 62 (PR#TBD): README recording refresh for current homepage capture

Scope:

- Replace the committed README homepage recording with the new capture prepared for repository documentation.
- Update the README media reference to the new optimized asset format without changing any product docs content.
- Keep the change scoped to README presentation and the committed homepage media asset.

Acceptance criteria:

- `README.md` renders the homepage recording from `docs/assets/readme/homepage-tour.webp`.
- The previous `docs/assets/readme/homepage-tour.gif` asset is removed from the repository.
- Validation passes:
  - `npm run env:check`
  - `git diff --check`

## Feature 61 (PR#TBD): Marketing and auth layout polish follow-ups

Scope:

- Refine the homepage route grid, plan preview cards, and footer content to match the requested alignment and symmetry updates.
- Center the hero copy and section headings on the marketing features and pricing pages where the route label is redundant.
- Center the signed-out organizer and demo states and finish the auth page cleanup so sign-in/sign-up no longer show the extra outer shell or Clerk footer content.

Acceptance criteria:

- Homepage live routes render in a 3-card first row and centered 2-card second row on large screens.
- Homepage plan preview cards are center-aligned and the footer includes a GitHub repository link while removing the extra footer marketing copy.
- Features and pricing pages remove the redundant top kicker and center the requested hero and section-heading copy.
- Signed-out organizer and demo surfaces center their content, and sign-in/sign-up remove the extra outer wrapper and Clerk footer rows.
- Sign-up page intro copy and the back-to-sign-in action are centered to match the auth form.
- Validation passes:
  - `npm run env:check`
  - `npm run lint`
  - `npm run test`
  - `npm run typecheck`
  - `git diff --check`

## Feature 60 (PR#TBD): README homepage media + production link refresh

Scope:

- Refresh the committed README homepage GIF so it reflects the current hero treatment after the OpenNote-inspired redesign.
- Move the production site link to the top section of the README so repo visitors can find the live app immediately.
- Keep the change scoped to README presentation and the committed homepage media asset.

Acceptance criteria:

- `README.md` renders the homepage GIF from `docs/assets/readme/homepage-tour.gif`.
- The refreshed GIF stays on the homepage hero fold and shows both hero art states within one loop.
- `README.md` surfaces the production link to `https://opencalendly.com` near the top of the document.
- Validation passes:
  - `npm run env:check`
  - `git diff --check`

## Feature 59 (PR#TBD): OpenNote-Inspired UI Redesign

Scope:

- Redesign the web app to use an OpenNote-inspired aesthetic with highly refined, cleaner layout structure.
- Increase negative space (generous margins, padding) for a "canvas" feel instead of confined boxes/cards.
- Retain the amber/gold (`#d9a066`) brand color and the background gridlines.
- Retain existing interactive widgets like the dotted globe and calendar UI on the marketing page.
- Implement explicit light and dark themes utilizing `[data-theme]` attributes and system preference fallback.
- Avoid deleting existing routes or functional components.

Acceptance criteria:

- `globals.css` defines full light theme (`:root`) and dark theme (`[data-theme='obsidian-amber']`) token sets.
- `marketing-pages.module.css` and other UI elements remove hard borders and solid backgrounds to embrace open space.
- The marketing homepage and layout structure accurately match the expansive pacing of the new aesthetic.
- Light mode incorporates off-white canvas backgrounds and charcoal text; Dark mode preserves the existing `#080808` obsidian feel.
- Theme switching works properly depending on system preferences or current static config without breaking UI.

## Feature 58 (PR#TBD): Homepage Responsive Layout Scaling

Scope:

- Expand the homepage layout so it uses large desktop screens more effectively instead of staying tightly capped in the center.
- Keep the homepage readable and stable across large desktop, medium tablet/laptop, and small phone breakpoints.
- Keep the change scoped to homepage layout, sizing, and responsive behavior without changing route structure or product copy.

Acceptance criteria:

- Large desktop screens render a visibly wider homepage layout with better use of available horizontal space.
- The hero section, proof strip, content grids, and footer adapt cleanly across large, medium, and small breakpoints.
- Homepage sections avoid cramped cards on medium screens and avoid oversized empty margins on large screens.
- Existing homepage interaction behavior remains intact, including the hero art controls and globe/calendar switching.

## Feature 57 (PR#66): Homepage Hero Art Manual Switch Fallback

Scope:

- Keep the homepage hero art rotation as-is for browsers that allow motion.
- Add an explicit manual switch so users can move between the calendar and globe art even when reduced-motion settings disable auto-rotation.
- Keep the change scoped to the homepage hero art component, styling, and tests.

Acceptance criteria:

- The homepage hero art still auto-rotates between calendar and globe slides when reduced motion is not requested.
- The homepage shows clear manual controls to switch between the calendar and globe slides.
- Reduced-motion users can switch slides manually without re-enabling auto-rotation.
- Homepage tests cover both the timed rotation behavior and the manual reduced-motion fallback.

## Maintainability Program (PR#56-PR#61)

Goal:

- Reduce structural complexity while preserving the current feature surface.
- Move the codebase from complexity `4/5` and maintainability `2.5/5` toward complexity `2/5` and maintainability `4.5/5`.
- Keep solutions production-friendly, explicit, and easy to debug.

Working rules:

- No user-facing feature removals in this program.
- No new heavy abstractions or major libraries for refactor-only work.
- Public API contracts stay stable unless a separate feature PR explicitly changes them.
- Every PR in this program must pass:
  - `npm run env:check`
  - `npm run lint`
  - `npm run test`
  - `npm run typecheck`
- Required review gate for each PR:
  - Qodo review runs and actionable comments are resolved.
  - CodeRabbit review runs and actionable comments are resolved.
  - CI is green before merge.

Guardrails:

- `apps/api/src/index.ts`: `<300` LOC, composition only.
- `page.client.tsx` route shells: `<300` LOC.
- General authored modules: `<400` LOC unless schema or test file.
- `npm run complexity:check:enforce` is enabled in CI and must stay green.

## Feature 55 (PR#63): Outbound Egress Security Runbook

Scope:

- Document the production outbound-network assumptions for webhook delivery, calendar sync/writeback, Clerk/Auth, and email delivery.
- Keep the change scoped to docs and operational checklists; do not change runtime behavior or add new network dependencies.
- Clarify what production must allow, what remains blocked, and how operators should validate or triage outbound-network failures.

Acceptance criteria:

- `docs/ARCHITECTURE.md` explicitly documents the intended outbound egress boundary for provider APIs and organizer-managed webhook targets.
- `docs/API.md` notes the runtime egress expectations for webhook delivery and calendar provider calls.
- `docs/PROD_DEPLOY_CHECKLIST.md` includes pre-deploy and post-deploy checks for outbound network assumptions.
- `docs/OPERATOR_RUNBOOK.md` includes webhook/calendar egress triage steps.
- `docs/SECURITY_CHECKLIST.md` reflects the documented outbound-network boundary.

## Feature 54 (PR#61): Security Headers and CSP Hardening

Scope:

- Add baseline response hardening headers to the API and web app.
- Keep the change scoped to headers/CSP generation, route-specific framing policy, tests, and process/docs updates for PR review gating.
- Do not change auth flows, booking behavior, or embed widget runtime behavior beyond header policy.

Acceptance criteria:

- The web app emits a documented baseline CSP plus `nosniff`, `referrer-policy`, and `permissions-policy` headers.
- CSP remains compatible with Clerk auth flows, the local/dev Next.js runtime, and the embed playground script preview.
- Sensitive authenticated web routes deny framing without breaking public booking embeds.
- The API emits a deny-by-default security header set on all responses.
- Tests cover the generated web CSP/header policy and API header constants.

## Feature 53 (PR#62): Webhook Secret Encryption at Rest

Acceptance criteria:

- New webhook subscriptions store signing secrets encrypted at rest instead of plaintext.
- Existing plaintext webhook secrets remain backward-compatible during rollout and are auto-migrated when used by the delivery runner.
- A dedicated backfill command exists to encrypt any remaining plaintext webhook secrets after deploy.
- Delivery/runtime paths only decrypt secrets immediately before signing outbound webhook requests.
- `docs/API.md`, `docs/ARCHITECTURE.md`, and env/setup guidance document the new storage model and rollout command.

### PR 1: Baseline health + review tooling + guardrails

Acceptance criteria:

- Local baseline is deterministic and green from a clean install.
- `docs/BACKLOG.md` documents this cleanup program and acceptance criteria.
- Complexity guardrails are documented for future contributors.
- Repo-local Qodo configuration exists for `describe` and `review` commands with summary-first feedback.
- `npm run complexity:check` exists for local visibility, and CI enforcement is enabled once the refactor program is complete.

### PR 2: API route decomposition

Acceptance criteria:

- `apps/api/src/index.ts` is reduced to composition and route registration only.
- Route groups are split by domain: auth, organizer, bookings, booking actions, teams, calendar, analytics, webhooks, demo, and embed.
- Shared route concerns are extracted into focused helpers instead of being duplicated across modules.
- Public API behavior remains contract-compatible.

### PR 3: Booking workflow normalization

Acceptance criteria:

- One-on-one booking, team booking, cancel, and reschedule follow the same internal sequence:
  - parse and normalize request
  - load context
  - compute and validate slot
  - run transaction
  - enqueue side effects
  - map response
- Booking routes become thin orchestration only.
- Booking correctness logic is not duplicated across route handlers.
- Existing booking tests remain green.

### PR 4: Organizer console decomposition

Acceptance criteria:

- `apps/web/src/app/organizer/page.client.tsx` becomes a thin page shell.
- Organizer feature areas are split into focused panels and hooks for bootstrap, busy actions, team detail loading, and notification rule loading.
- The organizer API client is split into domain-specific modules or namespaces.
- Page-level state is reduced to wiring concerns rather than owning every form and panel lifecycle.

### PR 5: Public booking UI consolidation

Acceptance criteria:

- One-on-one and team booking pages reuse a shared booking feature layer for timezone, slot grouping, submission lifecycle, and confirmation handling.
- Team-specific and one-on-one-specific behavior stays explicit through small adapters.
- Each booking page shell is reduced below the guardrail threshold.
- Existing booking UI tests remain green.

### PR 6: Shared contracts + cleanup + CI enforcement

Acceptance criteria:

- Stable web-facing request and response shapes are moved into narrow shared contracts.
- Dead helpers and accidental duplication introduced by earlier growth are removed.
- `npm run complexity:check:enforce` is turned on in CI because the repo is below the agreed thresholds.
- Docs capture the structural conventions for future work.

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

- Authenticated routes reject missing or expired bearer sessions.
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

## Feature 3 (PR#5): Launch Demo Admission + Daily Credits + waitlist

Scope:

- Replace the coarse daily demo-pass model with daily account admission plus per-account credits.
- Enforce launch-demo quota inside real feature routes instead of a public preflight consume endpoint.
- Gate seeded launch-demo booking surfaces behind authentication and keep the waitlist flow for exhausted days.
- Keep the change scoped to launch quota control, operator visibility, and related cleanup of deprecated quota/auth compatibility paths.

Acceptance criteria:

- System supports configurable daily demo-account admission limit and per-account daily credit limit without code changes.
- `GET /v0/demo-credits/status` returns both global admissions state and authenticated-account credit state.
- Feature routes deduct feature-weighted credits only on successful completion, including `POST /v0/bookings`, `POST /v0/team-bookings`, `POST /v0/bookings/actions/:token/reschedule`, organizer mutation routes, and calendar sync/writeback routes.
- Demo admission and credits reset by UTC date boundary.
- Dev/internal allowlisted accounts bypass both admission counting and credit deduction.
- Seeded launch-demo booking surfaces require sign-in so anonymous traffic cannot consume quota.
- Exhausted path supports waitlist capture (email + optional metadata) with deduping per day/email.
- A protected dev/admin endpoint can reset today's admission + credit state for local/demo operations.
- Deprecated compatibility paths are removed: legacy magic-link auth endpoints, the public `/v0/demo-credits/consume` endpoint, dead GitHub OAuth config, and the `demo_credits_daily` table.
- Feature includes tests for quota helper logic, waitlist dedupe, deprecated consume endpoint behavior, and route-level quota/auth regressions.
- `docs/API.md`, `README.md`, and `docs/PRD.md` are updated for operator setup and product behavior notes.

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
- `/auth/sign-in` completes Clerk sign-in and exchanges the Clerk session for an OpenCalendly API session.
- `/auth/verify` is a compatibility redirect back to `/auth/sign-in`.
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

### Feature 22: CI-safe production domain verification

Scope:
- Keep strict production domain checks for local/manual verification.
- Prevent false negatives in GitHub Actions where Cloudflare may return `403` for bot-protected requests.
- Preserve DNS and host-resolution assertions even when HTTP 403 fallback is enabled.

Acceptance criteria:

- `scripts/domain-check.mjs` supports an explicit CI-only opt-in to tolerate HTTP `403` responses.
- CI fallback does not bypass DNS or host validation; only HTTP status handling is relaxed for `403`.
- Local/manual `npm run domain:check:production` remains strict by default.
- Deploy workflow uses CI-only opt-in mode for the post-deploy domain verification step.

### Feature 23: Cinematic dark UX overhaul polish

Scope:
- Apply a premium dark, high-contrast visual pass to key web surfaces without changing API contracts.
- Update global design tokens, type system, shared primitives, app chrome styling, and route-level CSS modules.
- Keep interaction behavior intact while improving perceived visual quality and clarity.

Acceptance criteria:

- `apps/web/src/app/globals.css` defines updated cinematic dark tokens:
  - deep background/surface hierarchy
  - high-contrast text and border tokens
  - amber brand accent + hover/active states
  - tightened radii and denser shadow layers
  - semantic type and spacing scales
  - standardized motion timing tokens
- `apps/web/src/app/layout.tsx` uses `next/font/google` with:
  - `Space Grotesk` for display typography
  - `Inter` for primary UI/body typography
- Shared primitives (`apps/web/src/components/ui/primitives.module.css`) adopt the new tokens for:
  - cards/modals
  - buttons and form controls
  - tabs and table shells
- App shell styling (`apps/web/src/components/app-chrome.module.css`) aligns nav/brand/action styles with the new visual direction.
- Route modules are updated for coherent parity with the new system:
  - `apps/web/src/app/page.module.css`
  - `apps/web/src/app/dashboard/page.module.css`
  - `apps/web/src/app/organizer/page.module.css`
  - `apps/web/src/app/[username]/[eventSlug]/page.module.css`
- Validation gates pass:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`

### Feature 24: Availability caps parity (daily/weekly/monthly limits)

Scope:
- Complete booking-cap parity by adding first-class per-event limits for daily, weekly, and monthly confirmed bookings.
- Apply cap checks at availability-read time and at booking commit time.
- Keep existing booking correctness guarantees (transaction + unique slot guard) intact.

Acceptance criteria:

- Event types support nullable per-event booking caps:
  - `dailyBookingLimit`
  - `weeklyBookingLimit`
  - `monthlyBookingLimit`
- Caps are configurable through event type create/update APIs and returned in event type read APIs.
- Public availability endpoints hide slots that would exceed configured caps:
  - `GET /v0/users/:username/event-types/:slug/availability`
  - `GET /v0/teams/:teamSlug/event-types/:eventSlug/availability`
- Booking write paths enforce caps at commit time and return deterministic conflict errors when exceeded:
  - `POST /v0/bookings`
  - `POST /v0/team-bookings`
  - `POST /v0/bookings/actions/:token/reschedule`
- Existing out-of-office/holiday behavior remains intact via `availability_overrides` with `isAvailable=false`.
- Tests cover cap validation and enforcement behavior.
- `docs/API.md` documents booking-cap request/response fields and enforcement semantics.

### Feature 25: Out-of-office + holiday blocking parity completion

Scope:
- Complete the remaining parity gap for out-of-office/holiday blocking on top of Feature 24 caps.
- Add first-class time-off blocks and holiday import helpers for organizers.
- Enforce new blocking sources in both availability-read and booking-commit paths.

Acceptance criteria:

- Organizers can manage explicit time-off blocks via authenticated APIs:
  - `GET /v0/me/time-off`
  - `POST /v0/me/time-off`
  - `DELETE /v0/me/time-off/:id`
- Organizer APIs support holiday import presets for at least India and US:
  - `POST /v0/me/time-off/import-holidays`
  - idempotent import by `(userId, source, sourceKey)`.
- One-on-one and team availability APIs exclude windows intersecting time-off blocks.
- Booking commit paths enforce time-off conflicts and return deterministic `409` responses when blocked:
  - `POST /v0/bookings`
  - `POST /v0/team-bookings`
  - `POST /v0/bookings/actions/:token/reschedule`
- Organizer UI adds a Time off panel for:
  - listing upcoming blocks
  - adding/removing manual blocks
  - importing yearly holiday presets.
- Tests cover:
  - holiday import idempotency
  - availability exclusion from time-off
  - commit-time conflict handling for one-on-one/team/reschedule.
- `docs/API.md` is updated with time-off and holiday import contracts.

### Feature 26: Automated reminders + follow-up workflows parity completion

Scope:
- Complete reminders/follow-up parity by adding configurable per-event notification rules.
- Persist scheduled notification jobs on booking create/reschedule/cancel lifecycle transitions.
- Add a deterministic runner endpoint to send due reminders/follow-ups through Resend.
- Keep existing confirmation/cancellation/reschedule emails unchanged while adding scheduled workflow emails.

Acceptance criteria:

- Event types support authenticated notification rule CRUD with explicit offsets:
  - `GET /v0/event-types/:eventTypeId/notification-rules`
  - `PUT /v0/event-types/:eventTypeId/notification-rules`
- Supported rule kinds are:
  - `reminder` (before start)
  - `follow_up` (after end)
- Booking lifecycle behavior is deterministic:
  - create booking => schedule enabled reminder/follow-up rows
  - reschedule booking => cancel pending rows for old booking and schedule rows for new booking
  - cancel booking => cancel pending reminder/follow-up rows for that booking
- Due scheduled rows are processed through authenticated runner endpoint:
  - `POST /v0/notifications/run`
  - bounded batch processing
  - retry attempts with persisted status/error metadata
- Email send telemetry includes new `emailType` values for reminder/follow-up deliveries.
- Organizer UI includes a Notification rules panel in event type management for editing rule offsets.
- Tests cover:
  - rule validation
  - scheduling on create/reschedule/cancel
  - runner success/failure/retry behavior
  - idempotent processing of already-sent rows.
- `docs/API.md` is updated with notification rule + runner contracts.

### Feature 27: Clerk auth migration (Google + email sign-in) with API session bridge

Scope:
- Replace custom magic-link web auth UX with Clerk-hosted sign-in.
- Support email sign-in and Google sign-in through Clerk.
- Keep existing API bearer-session contracts by adding a Clerk-to-OpenCalendly session exchange.
- Deprecate the `/auth/verify` web UX path while preserving backward-compatible routing behavior.

Acceptance criteria:

- Web app uses Clerk for authentication UI and state:
  - `/auth/sign-in` renders Clerk sign-in (email + Google options enabled)
  - `/auth/verify` no longer requires token paste UX and redirects to `/auth/sign-in`
- API provides authenticated Clerk exchange endpoint:
  - `POST /v0/auth/clerk/exchange` validates Clerk token server-side and issues OpenCalendly session token
  - First-time Clerk users are provisioned/upserted in `users` with deterministic defaults (`timezone`, profile fields)
- Organizer and dashboard pages continue to use existing API session flows after successful Clerk exchange (no regression in current protected routes).
- Legacy magic-link APIs are removed; `/auth/verify` remains only as a safe redirect route.
- Environment contracts include Clerk keys (required/optional split documented and validated).
- Tests cover:
  - exchange endpoint success/failure
  - first-time user provisioning via Clerk exchange
  - web auth-session bootstrap from Clerk sign-in state
  - protected route behavior for signed-out users.

### Feature 28: Pages deploy unblock for auth verify edge runtime

Scope:
- Unblock Cloudflare Pages production deployment after Clerk auth migration by restoring required Next-on-Pages runtime configuration.
- Keep change strictly scoped to web build compatibility (no API/schema behavior changes).

Acceptance criteria:

- `/auth/verify` explicitly exports Next.js edge runtime configuration:
  - `export const runtime = 'edge'`
- `npm run pages:build -w apps/web` succeeds locally.
- GitHub `Deploy Production` workflow succeeds end-to-end on `main`.
- Production web remains reachable on:
  - `https://opencalendly.com`
  - `https://www.opencalendly.com`

### Feature 29: Production web deploy env parity for Clerk/API base URLs

Scope:
- Ensure GitHub production web deploy passes required public web env values into the `next-on-pages` build step.
- Prevent silent deploys that render the “Clerk configuration required” fallback in production due to missing build-time env.
- Keep change scoped to workflow/docs only (no API/schema changes).

Acceptance criteria:

- GitHub `Deploy Production` workflow validates required web build vars before deploying Pages:
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  - `NEXT_PUBLIC_API_BASE_URL`
- `Deploy web (Pages production)` step explicitly passes those vars to `npm run deploy:web:production`.
- Production deploy from `main` completes successfully with updated workflow.
- `https://opencalendly.com/auth/sign-in` no longer renders the “Clerk configuration required” fallback when vars are configured in repo settings.

### Feature 30: Pages deploy unblock for auth sign-in Suspense boundary

Scope:
- Unblock Cloudflare Pages production deployment by adding the required React Suspense boundary for `useSearchParams()` usage on `/auth/sign-in`.
- Keep change strictly scoped to web build/runtime compatibility (no API/schema behavior changes).

Acceptance criteria:

- `/auth/sign-in` server entry wraps the client page component in `Suspense`.
- A lightweight auth-page fallback UI renders while sign-in client content hydrates.
- `npm run pages:build -w apps/web` succeeds locally.
- GitHub `Deploy Production` workflow succeeds end-to-end on `main`.
- Production auth routes remain reachable:
  - `https://opencalendly.com/auth/sign-in`
  - `https://opencalendly.com/auth/verify`

### Feature 36: Pages deploy monorepo root build parity

Scope:
- Fix Cloudflare Pages production deploys that stopped publishing `main` because `next-on-pages`/Vercel were building the monorepo from the wrong working directory.
- Keep the change scoped to deploy/build compatibility for the existing Next.js app.

Acceptance criteria:

- Pages build runs from the repository root while telling Vercel the app root is `apps/web`.
- `npm run pages:build -w apps/web` succeeds locally in the monorepo.
- `npm run deploy:web:production` succeeds locally when required deploy env vars are present.
- Clerk auth entry routes required by Pages export edge runtime:
  - `/auth/sign-in`
  - `/auth/sign-up`
- GitHub `Deploy Production` can publish `main` to Cloudflare Pages without the duplicated `apps/web/apps/web/.next` path failure.

### Feature 37: Dense amber UI refinement pass

Scope:
- Tighten the current amber UI across homepage, public booking pages, organizer surfaces, and shared chrome without changing booking/API behavior.
- Keep the change scoped to spacing, radius, header density, hero composition, and shared primitive styling so it can ship as a pure frontend refinement PR.

Acceptance criteria:

- Shared density tokens in `apps/web/src/app/globals.css` are refined for a more compact UI:
  - smaller app header height
  - tighter radius scale
  - denser background grid spacing
- Homepage hero and marketing sections in `apps/web/src/app/page.tsx` and `apps/web/src/app/page.module.css` render with tighter spacing, smaller cards, and reduced visual bulk while preserving existing routes/CTAs/content structure.
- Public booking, team booking, booking action, dashboard, organizer, and embed pages keep the same functionality while adopting the tighter panel/card spacing defined in their CSS modules.
- Shared chrome and primitive styles stay visually consistent with the denser homepage treatment:
  - `apps/web/src/components/app-chrome.module.css`
  - `apps/web/src/components/ui/primitives.module.css`
  - `apps/web/src/components/calendar-connect-callback.module.css`
- No API/schema/docs contract changes are introduced outside this scoped UI refinement.
- Validation passes:
  - `npm run env:check`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
  - `npm run build -w apps/web`
### Feature 38: Embed playground hydration stability

Scope:
- Fix the embed playground route so its first client render matches the server-rendered HTML.
- Keep the change scoped to timezone initialization on the embed preview page and a small regression test.

Acceptance criteria:

- `apps/web/src/app/embed/playground/page.client.tsx` does not read the browser timezone during initial render.
- The embed playground server render remains deterministic with `UTC` until the client hydrates and upgrades to the browser timezone.
- Loading `/embed/playground` locally no longer logs a hydration mismatch caused by the timezone query parameter.
- Regression coverage exists for the server-side timezone fallback.
- Validation passes:
  - `npm run env:check`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
  - `npm run build -w apps/web`
### Feature 39: Review gate hardening

Scope:
- Stop `main` merges from being blocked by third-party review statuses that are outside repository control.
- Keep CodeRabbit auto-triggering in place and add an explicit maintainer re-trigger path without relying on ad hoc comment wording.
- Update engineering and deploy docs so the required checks match the actual protected branch policy.

Acceptance criteria:

- `.github/workflows/coderabbit-review-trigger.yml` supports the existing PR events plus a maintainer-only manual re-trigger path.
- `main` branch protection required checks are reduced to repo-owned or deterministic checks:
  - `lint-test-typecheck`
  - `GitGuardian Security Checks`
  - `trigger-coderabbit-review`
- `Greptile Review` and raw `CodeRabbit` status are no longer required GitHub merge blockers on `main`.
- Repo policy/docs match the protected branch behavior:
  - `AGENTS.md`
  - `docs/STACK.md`
  - `docs/PROD_DEPLOY_CHECKLIST.md`
  - `docs/PRD.md`
  - `.github/pull_request_template.md`
- Validation passes:
  - `npm run env:check`
  - workflow file remains parseable and reviewed
### Feature 40: Re-license repository from AGPL-3.0 to GPL-3.0

Scope:
- Change the repository license from GNU AGPL v3.0 to GNU GPL v3.0.
- Keep the change scoped to the legal/license surface only: license text, package metadata, and top-level docs references.

Acceptance criteria:

- Root `LICENSE` file contains the GNU GPL v3.0 text instead of the GNU AGPL v3.0 text.
- Root package metadata reflects `GPL-3.0-only`.
- Top-level docs references that describe the repository license are updated from AGPL to GPL and no longer claim network-use source disclosure.
- No product/runtime/API behavior changes are introduced.
- Validation passes:
  - `npm run env:check`
  - repo-wide search shows no stale AGPL license references outside historical Git metadata or lockfile history comments
### Feature 41: Node 24 baseline migration

Scope:
- Move the repository tooling and CI baseline from Node 22 to Node 24.
- Upgrade GitHub Actions that still carry Node 20 runtime deprecation warnings.
- Keep the change scoped to local tooling, repository metadata, and GitHub workflow configuration only.

Acceptance criteria:

- GitHub workflow actions use Node 24-capable major versions:
  - `actions/checkout@v5`
  - `actions/setup-node@v5`
  - `actions/github-script@v8`
- CI and production deploy workflows run with `node-version: 24`.
- Root package metadata reflects the new local/CI baseline:
  - `package.json` sets `engines.node` to `>=24`
  - `.nvmrc` exists with `24`
- Top-level docs describe Node 24 as the supported local baseline.
- Cloudflare runtime settings remain unchanged.
- Validation passes under Node 24:
  - `npm install`
  - `npm run env:check`
  - `npm run lint`
  - `npm run test`
  - `npm run test:smoke`
  - `npm run typecheck`
  - `npm run build -w apps/web`
### Feature 42: Local Playwright auth bootstrap + DB reset foundation

Scope:
- Add a local-only auth bootstrap route so Playwright can exercise authenticated surfaces without manual Clerk interaction.
- Add a deterministic local database reset script for repeatable E2E runs.
- Keep the change scoped to local development/test tooling and explicit dev-only API behavior.

Acceptance criteria:

- `POST /v0/dev/auth/bootstrap` exists as a local-only endpoint when `ENABLE_DEV_AUTH_BOOTSTRAP=true`.
- The bootstrap route:
  - accepts an optional `email`
  - defaults to seeded `demo@opencalendly.dev`
  - reuses the normal session issuance model
  - rejects non-local hosts/origins
  - returns `404` when the feature flag is disabled
- Root tooling includes `npm run db:reset:local`.
- The local DB reset script:
  - requires explicit confirmation via `CONFIRM_LOCAL_DB_RESET=yes`
  - validates local app/API URLs before destructive work
  - resets schema contents, reruns migrations, and reruns seed data
- Local env/docs plumbing exists for:
  - `ENABLE_DEV_AUTH_BOOTSTRAP`
  - `DEMO_CREDIT_BYPASS_EMAILS=demo@opencalendly.dev` guidance for repeatable local automation
- Validation passes:
  - `npm run env:check`
  - `npm run lint`
  - `npm run test`
  - `npm run typecheck`
  - local Node 24 smoke run for bootstrap + reset flow
### Feature 43: Persisted public rate-limit upsert fix

Scope:
- Fix the persisted public rate-limit helper so public booking and analytics routes stop failing with SQL syntax errors at runtime.
- Keep the change scoped to rate-limit persistence internals without changing route contracts or quotas.

Acceptance criteria:

- Public persisted rate limiting uses a Drizzle-backed upsert path instead of handwritten raw SQL.
- These routes no longer return `500 {"error":"syntax error at or near \",\""}` during normal use:
  - `GET /v0/users/:username/event-types/:eventSlug/availability`
  - `GET /v0/teams/:teamSlug/event-types/:eventSlug/availability`
  - `POST /v0/analytics/funnel/events`
- Existing rate-limit behavior is preserved:
  - window bucketing still uses the same minute window
  - counts still increment atomically on conflict
  - cleanup behavior remains unchanged
- Validation passes:
  - `npm run lint`
  - `npm run test`
  - `npm run typecheck`
  - local browser smoke confirms `/demo/intro-call` no longer surfaces the SQL syntax error
  - local browser smoke confirms `/team/demo-team/team-intro-call` no longer surfaces the SQL syntax error
### Feature 44: Booking action token date coercion

Scope:
- Fix cancel and reschedule action-link flows so booking-action token timestamps loaded through the transaction lock path are handled safely.
- Keep the change scoped to booking-action token evaluation without changing the action-link API contract.

Acceptance criteria:

- Booking action token evaluation accepts timestamp strings returned by the database lock query and normalizes them before expiry checks.
- These action-link mutations no longer fail with `500` and `input.expiresAt.getTime is not a function` during normal use:
  - `POST /v0/bookings/actions/:token/cancel`
  - `POST /v0/bookings/actions/:token/reschedule`
- Existing action-link behavior is preserved:
  - active confirmed bookings remain usable
  - expired links still return gone
  - consumed cancel/reschedule links still replay idempotently when appropriate
- Validation passes:
  - `npm run test -- apps/api/src/lib/booking-actions.test.ts`
  - `npm run lint`
  - `npm run typecheck`
  - local browser smoke confirms cancel and reschedule action-link flows complete without a server error
### Feature 45: Homepage hero personal-timezone badge alignment

Scope:
- Replace the static hero art badge copy with a browser-aware personal-timezone presentation on the homepage.
- Center the hero art badge block and legend row inside the right-side art panel without changing the rest of the homepage layout.

Acceptance criteria:

- The homepage hero art badge reads `Personal timezone aware`.
- The hero art panel shows which timezone is being followed based on the visitor's browser, with a safe fallback when the browser timezone cannot be resolved.
- The personal-timezone badge block is centered in the right-side art panel.
- The `open slots` / `selected flow` legend is centered in the right-side art panel.
- Validation passes:
  - `npm run lint`
  - `npm run typecheck`
  - local browser smoke confirms the homepage hero renders the centered badge and centered legend with browser timezone text
### Feature 46: Homepage hero ambient art rotation

Scope:
- Add a second homepage hero art state that rotates between the existing calendar motif and a globe treatment.
- Keep the hero copy and timezone-aware badge behavior from Feature 45 intact while making the right-side panel feel more alive.
- Respect reduced-motion preferences so the art panel does not auto-rotate for motion-sensitive visitors.

Acceptance criteria:

- The homepage hero alternates between the calendar art and a globe art treatment on motion-allowed browsers.
- The Feature 45 timezone-aware badge remains visible and accurate above the rotating hero art.
- Visitors with `prefers-reduced-motion: reduce` do not get an automatic art swap.
- Validation passes:
  - `npm run lint`
  - `npm run test`
  - `npm run typecheck`
  - `npm run build -w apps/web`
  - local browser smoke confirms the homepage hero renders both art states without layout breakage
### Feature 47: Concise repository README refresh

Scope:
- Rewrite the repository README for first-time visitors who need a fast understanding of what OpenCalendly is and how to run it.
- Add a lightweight homepage visual asset so the repo page shows the product immediately without requiring readers to click away.

Acceptance criteria:

- `README.md` explains what the app does in concise visitor-facing language.
- `README.md` includes minimal local setup instructions that remain accurate for the current stack.
- `README.md` includes a homepage visual asset committed in-repo and rendered from the README.
- `README.md` links to the key deeper docs for API, architecture, stack, and deploy details instead of duplicating them inline.
- Validation passes:
  - `npm run env:check`
  - `git diff --check`
### Feature 49: README homepage GIF hero-only refresh

Scope:
- Refresh the committed README homepage GIF so it stays on the hero fold instead of scrolling through the rest of the page.
- Ensure the loop shows both hero art states: the calendar motif and the globe treatment.

Acceptance criteria:

- `README.md` continues to render the committed homepage GIF from `docs/assets/readme/homepage-tour.gif`.
- The GIF stays pinned to the homepage hero and does not scroll to lower sections.
- The GIF visibly shows both the calendar art state and the globe art state within one loop.
- Validation passes:
  - `npm run env:check`
  - `git diff --check`

### Feature 32: Warm Grid Dark UI foundation + navbar route stability

Scope:
- Apply the requested Warm Grid Dark visual system across web app surfaces using tokenized colors and subtle page-level gridlines.
- Fix navbar route runtime issues observed in local development (`ENOENT` for app route chunks/pages and transient 500s).
- Keep booking/API behavior unchanged; focus on frontend styling and route/runtime stability.

Acceptance criteria:

- Theme tokens in `apps/web/src/app/globals.css` are updated to the Warm Grid Dark palette:
  - app background `#151412`
  - gridline accent `#23211F`
  - heading/primary text `#F3D5B6`
  - body/secondary text `#8D867E`
  - accent `#BC5240`
- Subtle background grid is visible on page-level backgrounds for marketing/public surfaces, while dense content stays on card/panel surfaces for readability.
- Navbar-linked routes render without runtime chunk/page missing errors in local dev:
  - `/`
  - `/features`
  - `/solutions`
  - `/pricing`
  - `/resources`
  - `/demo/intro-call`
  - `/team/demo-team/team-intro-call`
  - `/embed/playground`
  - `/organizer`
  - `/dashboard`
- UI regressions from unstyled controls on key pages are fixed (forms, buttons, cards, panels use shared primitive styles).
- Clerk auth entry route remains functional from navbar sign-in flow.
- Clerk path-based auth callbacks resolve without 404 in local dev:
  - `/auth/sign-in/sso-callback?...`
  - `/auth/sign-in/SignIn_clerk_catchall_check_*`
- Web dev startup performs a clean `.next` reset before `next dev` to reduce stale chunk/runtime cache issues during local route iteration.
- Validation passes:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
  - `npm run build -w apps/web`

### Feature 50: Security hardening for API sessions and Next.js patch level

Scope:
- Remove browser-side storage of raw API bearer tokens and move web auth to secure cookie-backed API sessions.
- Patch the vulnerable web runtime dependency line for Next.js.
- Keep organizer, dashboard, booking, and booking-action behavior unchanged from the user point of view.

Acceptance criteria:

- Web auth exchange and local dev bootstrap issue `HttpOnly` API session cookies instead of returning raw session tokens to browser callers.
- Web app `localStorage` stores only non-secret auth metadata and no bearer token.
- Authenticated browser API requests use `credentials: 'include'`.
- API exposes a logout endpoint that revokes the active session and clears the session cookie.
- Cookie-backed non-GET browser requests are rejected when `Origin`/`Referer` is cross-site.
- Web dependency manifest and lockfile move Next.js to a patched release line.
- Validation passes:
  - `npm run typecheck`
  - `npm run lint`
  - focused auth/session Vitest coverage stays green

### Feature 51: Webhook destination SSRF hardening

Scope:
- Restrict organizer-managed webhook destinations to public HTTPS hostnames.
- Prevent the delivery runner from calling legacy webhook targets that no longer meet the destination policy, including hostnames that resolve into private IP space.
- Keep webhook payload shape, signing, and retry behavior unchanged for valid destinations.

Acceptance criteria:

- Webhook create/update validation rejects non-HTTPS targets, localhost/private-network hostnames, direct IP literals, and URLs with embedded credentials.
- Delivery execution re-validates resolved destination IPs and refuses private/loopback/link-local targets even when the stored URL hostname looks public.
- Existing invalid webhook rows are not delivered to; due deliveries fail immediately with a configuration error instead of making a network request.
- Webhook helper/schema coverage includes safe and unsafe destination examples.
- `docs/API.md` documents the webhook destination restrictions.
- Validation passes:
  - `npm run lint`
  - `npm run test`
  - `npm run typecheck`

### Feature 56: Concise warm copy refresh across app surfaces

Scope:
- Tighten copy across the highest-traffic OpenCalendly web surfaces so pages feel faster to scan.
- Keep product meaning intact while shifting tone away from dense implementation language toward clearer, warmer phrasing.
- Focus on marketing, organizer shell, dashboard shell, and public booking/action-link flows without changing behavior.

Acceptance criteria:

- Homepage, `features`, `solutions`, `pricing`, and `resources` copy is shorter and easier to scan.
- Organizer and dashboard shell descriptions feel human and concise instead of internal or overly technical.
- Public booking and booking-action flows keep necessary clarity but reduce repetitive or heavy wording.
- Navigation labels and core CTAs remain accurate and do not become vague.
- Validation passes:
  - `npm run lint`
  - `npm run typecheck`

### Feature 57: Marketing copy CI parity fix

Scope:
- Update the marketing route source test so it matches the current homepage copy shipped in Feature 56.
- Keep the fix limited to the stale CI assertion and do not alter the rendered marketing pages again.

Acceptance criteria:

- `apps/web/src/app/marketing-routes.test.ts` asserts the current homepage copy strings.
- CI no longer fails on the stale homepage copy expectation introduced by the copy refresh merge.
- Validation passes:
  - `npx vitest run apps/web/src/app/marketing-routes.test.ts`
