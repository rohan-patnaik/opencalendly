# Contributing

## Local setup

```bash
npm install
cp .env.example .env
# fill required values once, up front (Neon-only DB)
npm run env:check
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:web
```

## PR expectations

- One feature per PR.
- Include tests and docs updates.
- Do not delete merged feature branches.
- Report project timestamps in IST (`Asia/Kolkata`) in handoffs/release notes.
- Neon is the only supported database provider.
- Run before opening PR:

```bash
npm run env:check
npm run lint
npm run complexity:check:enforce
npm run test
npm run typecheck
```

## Maintainability guardrails

- Keep `apps/api/src/index.ts` as composition only. Target `<300` LOC.
- Keep `page.client.tsx` route shells focused on composition and page wiring. Target `<300` LOC.
- Keep general authored modules under `<400` LOC unless they are schema or test files.
- Prefer small route/domain modules over adding new architectural layers.
- Do not add major dependencies for refactor-only work.
- `npm run complexity:check:enforce` is part of CI and should stay green on every PR.

## Code style

- TypeScript-first.
- Validate external inputs with Zod.
- Format with Prettier and follow ESLint rules.
