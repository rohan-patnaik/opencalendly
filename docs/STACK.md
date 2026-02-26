# Stack Decisions

## Goals for this stack

- Keep infra costs at or near $0/month on free tiers.
- Maintain strong booking correctness under concurrent requests.
- Use simple, composable tools with strong TypeScript support.

## Tools and why

| Layer | Tool | Why |
| --- | --- | --- |
| Frontend | Next.js (App Router) | Fast UI iteration, route conventions, strong TS support, Cloudflare Pages compatibility |
| API | Cloudflare Workers + Hono | Low-latency edge execution and lightweight routing |
| Database | Neon Postgres (free plan) | Managed Postgres with 100 CU-hours/project/month |
| DB access in Workers | Hyperdrive + native `pg` | Connection reuse/pooling and lower latency from edge to Postgres |
| ORM/migrations | Drizzle ORM + drizzle-kit | Type-safe schema and explicit SQL migrations |
| Shared contracts | Zod | Runtime validation plus inferred TS types |
| Transactional email | Resend | Free-tier transactional email for booking lifecycle events |
| Testing | Vitest + Playwright | Fast unit tests and one end-to-end booking path |
| Code quality | ESLint + Prettier | Consistent code quality and formatting |

## How components connect

```mermaid
flowchart LR
  Browser["Browser"] --> Web["Cloudflare Pages (Next.js)"]
  Web --> API["Cloudflare Worker API (Hono)"]
  API -->|"Hyperdrive connection string"| PG["Neon Postgres"]
  API --> Email["Resend API"]
```

## Hyperdrive + Neon rule

- Use native Postgres drivers (`pg` or `postgres`) with Hyperdrive connection strings.
- Do not use Neon serverless driver with Hyperdrive.
- Do not stack Hyperdrive pooling with Neon pooled connection endpoints.
- Neon is the only supported database provider for this repository.

Current code example: `apps/api/src/index.ts` uses `pg.Client` with `env.HYPERDRIVE.connectionString`.

## Setup steps

1. Create Neon project and copy the direct Postgres URL.
2. Create Cloudflare Hyperdrive config pointed at Neon.
3. Bind Hyperdrive in `apps/api/wrangler.toml` as `HYPERDRIVE`.
4. Set `DATABASE_URL` locally to the Neon direct Postgres URL for migrations and seed scripts.
5. Deploy API Worker, then deploy web app to Pages.

Useful references:

- [Neon docs](https://neon.com/docs)
- [Cloudflare Hyperdrive docs](https://developers.cloudflare.com/hyperdrive/)
- [Cloudflare Workers docs](https://developers.cloudflare.com/workers/)
- [Cloudflare Pages docs](https://developers.cloudflare.com/pages/)
- [Resend docs](https://resend.com/docs)
- [Drizzle docs](https://orm.drizzle.team/docs/overview)
