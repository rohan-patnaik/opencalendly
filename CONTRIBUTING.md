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
npm run lint
npm run test
npm run typecheck
```

## Code style

- TypeScript-first.
- Validate external inputs with Zod.
- Format with Prettier and follow ESLint rules.
