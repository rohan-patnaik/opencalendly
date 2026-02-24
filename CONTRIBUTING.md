# Contributing

## Local setup

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:web
```

## PR expectations

- One feature per PR.
- Include tests and docs updates.
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
