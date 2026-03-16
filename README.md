# OpenCalendly

Live site: [opencalendly.com](https://opencalendly.com)

OpenCalendly is an open-source scheduling app for teams that want Calendly-class booking flows without giving up runtime ownership. It ships public booking pages, team scheduling, embeds, organizer tooling, calendar sync, analytics, and the operational guardrails needed to run the stack yourself.

![OpenCalendly homepage tour](docs/assets/readme/homepage-tour.webp)

## What It Does

- One-on-one and team booking flows with conflict-safe booking commits
- Cancel and reschedule links for invitees
- Organizer console for event types, availability, teams, webhooks, and calendars
- Analytics dashboard, embed playground, and webhook delivery runners
- Google and Microsoft calendar sync plus calendar writeback

## Stack

- `apps/web`: Next.js App Router on Cloudflare Pages
- `apps/api`: Hono API on Cloudflare Workers
- `packages/db`: Drizzle + Neon Postgres
- `packages/shared`: shared Zod schemas and TypeScript types
- Auth and email: Clerk + Resend

Neon is the only supported database provider for this repository because the local and production setup is built around the current Hyperdrive integration path.

## Run It Locally

1. Install dependencies:

```bash
npm install
```

2. Create your local env file:

```bash
cp .env.example .env
```

3. Fill the required values in `.env`, then validate:

```bash
npm run env:check
```

4. Apply schema and seed data:

```bash
npm run db:migrate
npm run db:seed
```

5. Start the API and web app in separate terminals:

Terminal 1:

```bash
npm run dev:api
```

Terminal 2:

```bash
npm run dev:web
```

## Try The Main Surfaces

- `/`
- `/embed/playground`
- `/organizer`
- `/dashboard`

## Repo Guide

- API contract: [docs/API.md](docs/API.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Stack and operational choices: [docs/STACK.md](docs/STACK.md)
- Production deploy checklist: [docs/PROD_DEPLOY_CHECKLIST.md](docs/PROD_DEPLOY_CHECKLIST.md)
- Environment reference: [.env.example](.env.example)
