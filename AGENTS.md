# AGENTS.md — OpenCalendly Engineering Rules

## Core principles
- One PR = one feature. No multi-feature PRs.
- Acceptance criteria must exist before coding.
- Correctness > “instant UI”. Always re-check availability at booking commit.
- Every change starts from a new feature branch created from the latest `main`.
- Direct commits/pushes to `main` are not allowed; merge to `main` happens only via PR.

## Required workflow (every feature)
1) Plan
   - Update docs/BACKLOG.md with scope + acceptance criteria
   - If API changes: update docs/API.md (draft-first)
2) Implement
   - Keep changes minimal and scoped
   - Add/update tests
3) Auditor verification (mandatory)
   - Confirm every acceptance criterion is met
   - Confirm migrations are included (if schema changes)
   - Confirm tests pass locally + CI passes
   - Confirm docs updated
4) Reviews (mandatory order)
   - Codex self-review checklist
   - Open PR
   - Greptile PR review must run
   - Resolve all Greptile review comments before merge
5) Merge
   - Merge PR only after Greptile review has run and comments are resolved
   - Update docs/PRD.md and docs/ARCHITECTURE.md only if the feature changes plan/architecture
6) Handoff
   - After merge, produce NEXT_CHAT_PROMPT including:
     - what shipped
     - what’s next
     - commands/env vars
     - links to updated docs

## Greptile config
- Greptile is configured via greptile.json at repo root (or .greptile/ directory config).
- greptile.json is read from the source branch of each PR.

## Definition of Done
- Feature works end-to-end in dev
- Tests added/updated
- Docs updated
- CI green
- NEXT_CHAT_PROMPT generated after merge
