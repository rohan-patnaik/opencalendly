# OpenCalendly

OpenCalendly is an open-source scheduling platform focused on practical MVP functionality and strict free-tier infrastructure budgeting.

## What This Project Is

- OSS scheduling app with one-on-one booking as the MVP focus.
- Built to run on free tiers by default (domain cost excluded).
- Cloudflare-first runtime (Workers + Pages) with Neon Postgres.

## Monorepo Layout

```text
apps/
  web/      Next.js App Router frontend (Cloudflare Pages target)
  api/      Cloudflare Worker API (Hono)
packages/
  shared/   Shared Zod schemas and TS types
  db/       Drizzle schema, migrations, and seed scripts
```

## Quickstart (Local Dev)

### 1) Prerequisites

- Node.js 20+ (Node 22 tested)
- npm 11+
- Neon account + Neon Postgres project (Neon is required)

### 2) Install

```bash
npm install
```

### 3) Configure environment

```bash
cp .env.example .env
```

Populate required values in `.env` once, up front:

| Variable                   | How to get it                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | Neon dashboard -> project -> connection details -> direct Postgres URL (`*.neon.tech`)             |
| `SESSION_SECRET`           | Run `openssl rand -hex 32`                                                                         |
| `APP_BASE_URL`             | Local web URL (`http://localhost:3000`)                                                            |
| `API_BASE_URL`             | Local API URL (`http://127.0.0.1:8787`)                                                            |
| `NEXT_PUBLIC_API_BASE_URL` | Same as `API_BASE_URL` for local web calls                                                         |
| `CLOUDFLARE_ACCOUNT_ID`    | Cloudflare dashboard -> right sidebar account ID                                                   |
| `CLOUDFLARE_API_TOKEN`     | Cloudflare dashboard -> My Profile -> API Tokens (token with Workers/Pages/Hyperdrive permissions) |
| `HYPERDRIVE_ID`            | Cloudflare dashboard -> Hyperdrive -> created config ID                                            |
| `CLOUDFLARE_PAGES_PROJECT` | Cloudflare Pages project name (required for `npm run deploy:web:production`)                      |
| `CLOUDFLARE_PAGES_PRODUCTION_BRANCH` | Optional Pages production branch (defaults to `main`)                                  |
| `RESEND_API_KEY`           | Resend dashboard -> API Keys                                                                       |
| `RESEND_FROM_EMAIL`        | Resend dashboard -> verified sender identity                                                       |
| `GOOGLE_CLIENT_ID`         | Google Cloud Console -> APIs & Services -> Credentials -> OAuth 2.0 Client ID (Web application)    |
| `GOOGLE_CLIENT_SECRET`     | Same Google OAuth credential as above                                                              |
| `MICROSOFT_CLIENT_ID`      | Microsoft Entra -> App registrations -> Application (client) ID                                    |
| `MICROSOFT_CLIENT_SECRET`  | Microsoft Entra -> App registrations -> client secret                                              |
| `DEMO_DAILY_PASS_LIMIT`    | Optional integer daily cap for Feature 3 demo credits (default `25`)                               |

Optional (not required for current feature set):

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

Google OAuth setup note (for local dev):

- In Google Cloud OAuth app, add your callback URL under Authorized redirect URIs (for example `http://localhost:3000/settings/calendar/google/callback`).

Microsoft OAuth setup note (for local dev):

- In Microsoft Entra App Registration, add a Web redirect URI for `http://localhost:3000/settings/calendar/microsoft/callback` and use that app's client ID/secret for `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`.

Then validate before doing feature work:

```bash
npm run env:check
```

### 4) Run database migration + seed

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

### 5) Start API and web

In terminal 1:

```bash
npm run dev:api
```

In terminal 2:

```bash
npm run dev:web
```

### 6) Feature 1 smoke test

- Open `http://localhost:3000/demo/intro-call`
- Use the timezone picker, select an available slot, and submit a booking.

### 7) Feature 11 auth + dashboard smoke test

1. Open `http://localhost:3000/auth/sign-in`
2. Request a magic-link token (email required; username/displayName required only for first-time account creation).
3. Complete verification on `http://localhost:3000/auth/verify` (auto-filled token flow).
4. Confirm redirect to `http://localhost:3000/dashboard` and analytics load without manual token paste.

### 7.1) Feature 15 app shell smoke test

1. Confirm top navigation remains sticky while scrolling.
2. Confirm the single dark theme styling is applied consistently across header/cards/forms.
3. Resize to mobile width and verify drawer navigation opens/closes and route links work.
4. Sign in via `/auth/sign-in` (or keep an active session), then open `/auth/verify`, `/dashboard`, and `/organizer` to confirm shared shell/card/form styling is consistent.

### 7.2) Feature 17 organizer IA parity smoke test

1. Open `http://localhost:3000/organizer` with an active authenticated session.
2. Use the left-rail section links and confirm each anchor section opens correctly:
   - `#event-types`, `#availability`, `#teams`, `#webhooks`, `#calendars`, `#writeback`
3. Verify summary cards render non-empty counts from live organizer data.
4. Open `http://localhost:3000/dashboard` and use Quick actions to jump into organizer sections.

### 8) Feature 12 organizer console smoke test

1. Open `http://localhost:3000/organizer` (authenticated session required).
2. Verify event types list/create/edit works from UI.
3. Validate availability rules/overrides can be loaded and saved.
4. Check teams/members/team event types can be listed and created.
5. Ensure webhooks and calendar/writeback controls load and actions execute.

### 9) Feature 13 public parity smoke test

1. Open one-on-one booking: `http://localhost:3000/demo/intro-call`
2. Open team booking: `http://localhost:3000/team/demo-team/team-intro-call`
3. After creating a booking, open the action link `http://localhost:3000/bookings/actions/<token>` and test cancel/reschedule flows.
4. Open embed playground: `http://localhost:3000/embed/playground` and verify script preview renders.

### 9.1) Feature 18 marketing parity smoke test

1. Open `http://localhost:3000/` and verify hero, proof strip, workflow, integrations, pricing preview, CTA band, and footer sections render.
2. Open `http://localhost:3000/features`, `http://localhost:3000/solutions`, `http://localhost:3000/pricing`, and `http://localhost:3000/resources`.
3. Verify marketing CTA links route to implemented product surfaces (`/demo/intro-call`, `/team/demo-team/team-intro-call`, `/embed/playground`, `/organizer`, `/dashboard`).

### Key web routes

- `/` modern product homepage
- `/auth/sign-in` magic-link session start
- `/auth/verify` magic-link token verification
- `/demo/intro-call` public one-on-one booking demo
- `/team/demo-team/team-intro-call` public team booking demo
- `/bookings/actions/[token]` public cancel/reschedule action page
- `/embed/playground` embed script generator + live preview
- `/features` marketing feature matrix page
- `/solutions` marketing solutions page
- `/pricing` marketing pricing page
- `/resources` marketing resources page
- `/organizer` authenticated organizer operations console (event types, availability, teams, webhooks, calendar, writeback)
- `/organizer#event-types|availability|teams|webhooks|calendars|writeback` direct organizer section anchors
- `/dashboard` authenticated organizer analytics dashboard
- `/settings/calendar/google/callback` OAuth callback completion for Google Calendar connect
- `/settings/calendar/microsoft/callback` OAuth callback completion for Microsoft Calendar connect

OpenCalendly now uses a single dark theme across app and marketing routes (no runtime light/system toggle).

## Deploy Overview (Cloudflare Pages + Workers)

1. Configure domains and DNS first (Porkbun + Cloudflare): [docs/CLOUDFLARE_DOMAIN_SETUP.md](docs/CLOUDFLARE_DOMAIN_SETUP.md).
2. Configure GitHub Actions production deploy secrets:
   - Required repository secrets:
     - `CLOUDFLARE_API_TOKEN` (Cloudflare token with Workers/Pages deploy permissions)
     - `CLOUDFLARE_ACCOUNT_ID`
   - Optional repository variables:
     - `CLOUDFLARE_PAGES_PROJECT` (defaults to `opencalendly-web`)
     - `CLOUDFLARE_PAGES_PRODUCTION_BRANCH` (defaults to `main`)
3. Automatic production deploy is handled by:
   - `.github/workflows/deploy-production.yml`
   - Trigger: after `CI` succeeds on `main` pushes (plus manual `workflow_dispatch`)
   - Order: API deploy -> web deploy -> domain verification
4. Set environment variables in both Worker and Pages projects before any deploy command.
   - Worker secrets (`DATABASE_URL`, `RESEND_API_KEY`, `SESSION_SECRET`, `GOOGLE_CLIENT_SECRET`) should be set via `wrangler secret put`.
5. For manual fallback deploys, run:

```bash
npm run deploy:api:production
npm run deploy:web:production
```

6. Verify production app + API domain wiring:

```bash
npm run domain:check:production
```

Details: [docs/STACK.md](docs/STACK.md), [docs/PROD_DEPLOY_CHECKLIST.md](docs/PROD_DEPLOY_CHECKLIST.md)

## Demo Credits Pool (Feature 3)

To keep usage within free-tier limits, OpenCalendly will enforce a Demo Credits Pool:

- A fixed number of daily passes is available per UTC day.
- Trial actions consume one pass each.
- When passes are exhausted, users see a waitlist/come-back flow.
- Passes reset daily and can be manually reset via admin/dev route.

Feature 3 API endpoints:

- `GET /v0/demo-credits/status`
- `POST /v0/demo-credits/consume`
- `POST /v0/waitlist`
- `POST /v0/dev/demo-credits/reset` (authenticated)

## Embeds + Webhooks (Feature 4)

Embed script endpoint (public):

- `GET /v0/embed/widget.js?username=demo&eventSlug=intro-call&timezone=Asia/Kolkata&theme=dark`

Example host-page snippet:

```html
<script
  src="http://127.0.0.1:8787/v0/embed/widget.js?username=demo&eventSlug=intro-call"
  data-width="100%"
  data-height="760px"
></script>
```

Webhook management endpoints (authenticated):

- `GET /v0/webhooks`
- `POST /v0/webhooks`
- `PATCH /v0/webhooks/:id`
- `POST /v0/webhooks/deliveries/run`

Delivery includes `X-OpenCalendly-Signature` (HMAC-SHA256) and retries with exponential backoff until bounded max attempts.

Calendar sync endpoints (authenticated, Feature 6):

- `GET /v0/calendar/sync/status`
- `POST /v0/calendar/google/connect/start`
- `POST /v0/calendar/google/connect/complete`
- `POST /v0/calendar/google/disconnect`
- `POST /v0/calendar/google/sync`

Calendar sync + writeback endpoints (authenticated, Feature 7):

- `POST /v0/calendar/microsoft/connect/start`
- `POST /v0/calendar/microsoft/connect/complete`
- `POST /v0/calendar/microsoft/disconnect`
- `POST /v0/calendar/microsoft/sync`
- `GET /v0/calendar/writeback/status`
- `POST /v0/calendar/writeback/run`

## Documentation Index

- [docs/STACK.md](docs/STACK.md)
- [docs/PRD.md](docs/PRD.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/BACKLOG.md](docs/BACKLOG.md)
- [docs/API.md](docs/API.md)
- [docs/SECURITY_CHECKLIST.md](docs/SECURITY_CHECKLIST.md)
- [docs/OPERATOR_RUNBOOK.md](docs/OPERATOR_RUNBOOK.md)
- [docs/PROD_DEPLOY_CHECKLIST.md](docs/PROD_DEPLOY_CHECKLIST.md)
- [docs/releases/v1.0.0.md](docs/releases/v1.0.0.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [AGENTS.md](AGENTS.md)

## PR Formatting

- Use `.github/pull_request_template.md` when creating PRs.
- Write PR bodies as normal Markdown (headings, bullet lists, fenced code), not escaped newline strings.

## License

This project is licensed under **GNU AGPL v3.0**. See [LICENSE](LICENSE).

Forks and modified versions must preserve license and copyright notices and make source available when used over a network (AGPL requirement).
