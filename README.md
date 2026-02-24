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
- Postgres connection string (Neon or local)

### 2) Install

```bash
npm install
```

### 3) Configure environment

```bash
cp .env.example .env
```

Fill in at least `DATABASE_URL`.

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

## Deploy Overview (Cloudflare Pages + Workers)

1. Deploy `apps/api` via Wrangler as a Cloudflare Worker.
2. Create Hyperdrive binding to Neon Postgres and attach it to the Worker.
3. Deploy `apps/web` to Cloudflare Pages using the Next.js adapter build (`npm run pages:build -w apps/web`).
4. Set environment variables in both Worker and Pages projects.

Details: [docs/STACK.md](docs/STACK.md)

## Demo Credits Pool Policy (Daily Passes)

To keep usage within free-tier limits, OpenCalendly will enforce a Demo Credits Pool:

- A fixed number of daily passes is available per UTC day.
- Trial actions consume one pass each.
- When passes are exhausted, users see a waitlist/come-back flow.
- Passes reset daily and can be manually reset via admin/dev route.

Implementation is planned for Feature 3. Product policy is defined now to shape architecture and cost controls.

## Documentation Index

- [docs/STACK.md](docs/STACK.md)
- [docs/PRD.md](docs/PRD.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/BACKLOG.md](docs/BACKLOG.md)
- [docs/API.md](docs/API.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [AGENTS.md](AGENTS.md)

## License

This project is licensed under **GNU AGPL v3.0**. See [LICENSE](LICENSE).

Forks and modified versions must preserve license and copyright notices and make source available when used over a network (AGPL requirement).
