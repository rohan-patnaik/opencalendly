# AGENTS.md — OpenCalendly Engineering Rules

## Core principles
- One PR = one feature. No multi-feature PRs.
- Acceptance criteria must exist before coding.
- Correctness > “instant UI”. Always re-check availability at booking commit.
- Every change starts from a new feature branch created from the latest `main`.
- Direct commits/pushes to `main` are not allowed; merge to `main` happens only via PR.
- Do not delete feature branches after merge; retain them for auditability and history.
- Use IST (`Asia/Kolkata`) for timestamps in handoffs, PR notes, and status reporting.
- Initialize local `.env` with all required variables at setup time, before starting feature work.
- Neon is the only supported database provider for this repository.

## Required workflow (every feature)
0) Environment bootstrap (mandatory once per clone/machine)
   - Copy `.env.example` to `.env`
   - Populate all required env values (DB, Cloudflare, email, app URLs) before feature work
   - Run `npm run env:check` and fix all reported errors
1) Plan
   - Update docs/BACKLOG.md with scope + acceptance criteria
   - If API changes: update docs/API.md (draft-first)
   - Confirm `npm run env:check` passes
2) Implement
   - Keep changes minimal and scoped
   - Add/update tests
   - After first push on the feature branch, open a Draft PR immediately to start CI and bot reviews early
3) Auditor verification (mandatory)
   - Confirm every acceptance criterion is met
   - Confirm migrations are included (if schema changes)
   - Confirm tests pass locally + CI passes
   - Confirm docs updated
4) Reviews (mandatory order)
   - Codex self-review checklist
   - Mark Draft PR ready for review when acceptance criteria are implemented
   - Greptile PR review must run (auto-trigger expected)
   - If Greptile status check does not appear within 5 minutes of PR update, trigger Greptile manually from dashboard and continue waiting for review
   - Resolve all Greptile review comments before merge
   - CodeRabbit review must run (not skipped) before merge
   - If CodeRabbit shows "Review skipped", treat it as unmet review gate:
     - verify CodeRabbit dashboard repo settings for auto review
     - trigger `@coderabbitai review` on the PR after config fix
   - Resolve all CodeRabbit review comments before merge
   - After each Greptile/CodeRabbit comment batch, provide a concise in-chat summary:
     - what each reviewer asked to change
     - what change will be made in response
5) Merge
   - Merge PR only after Greptile review has run and comments are resolved
   - Do not delete the source feature branch after merge
   - Update docs/PRD.md and docs/ARCHITECTURE.md only if the feature changes plan/architecture
6) Handoff
   - After merge, provide an in-chat handoff summary including:
     - what shipped
     - what’s next
     - commands/env vars
     - local app run commands
     - links to updated docs

## Greptile config
- Greptile is configured via greptile.json at repo root (or .greptile/ directory config).
- greptile.json is read from the source branch of each PR.

## CodeRabbit config
- CodeRabbit behavior is configured via `.coderabbit.yaml` in repo root.
- Auto review is enabled (`reviews.auto_review.enabled: true`).
- GitHub Action `.github/workflows/coderabbit-review-trigger.yml` posts `@coderabbitai review` on every PR open/update/ready-for-review event to force review trigger even when dashboard auto settings are restrictive.
- One-time setup requirement (GitHub side):
  - CodeRabbit GitHub App must be installed for this repository.
  - Repository access must include this repo for PR review events.
- Per-PR verification:
  - Confirm a CodeRabbit status/check appears on the PR.
  - If no CodeRabbit status/check appears within 5 minutes of PR creation/update, verify app installation/access and trigger a re-check from CodeRabbit dashboard if available.
  - If CodeRabbit status is present but review is skipped, fix dashboard/repo config and re-trigger review with `@coderabbitai review`.

## Definition of Done
- Feature works end-to-end in dev
- Tests added/updated
- Docs updated
- CI green
- In-chat handoff summary posted after merge
