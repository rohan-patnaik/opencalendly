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
   - Greptile review is best-effort when the app is installed and billing/config are active.
   - If Greptile comments arrive, resolve them before merge.
   - CodeRabbit trigger workflow must run on every PR update.
   - If CodeRabbit does not appear within 5 minutes of PR update:
     - rerun `.github/workflows/coderabbit-review-trigger.yml`, or
     - comment `/coderabbit-review` on the PR as a maintainer
   - If CodeRabbit posts actionable comments, resolve them before merge.
   - If the raw `CodeRabbit` status remains pending after a successful trigger but no actionable comments arrive, do not block indefinitely; document the stuck status in the PR and continue once CI is green and comments are resolved.
   - After each Greptile/CodeRabbit comment batch, provide a concise in-chat summary:
     - what each reviewer asked to change
     - what change will be made in response
5) Merge
   - Merge PR only after CI is green, required repo-owned checks pass, and actionable bot comments are resolved
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
- Greptile is not a required `main` branch status check while billing/config is inactive.

## CodeRabbit config
- CodeRabbit behavior is configured via `.coderabbit.yaml` in repo root.
- Auto review is enabled (`reviews.auto_review.enabled: true`).
- GitHub Action `.github/workflows/coderabbit-review-trigger.yml` posts `@coderabbitai review` on every PR open/update/ready-for-review event to force review trigger even when dashboard auto settings are restrictive.
- Maintainers can re-trigger CodeRabbit with either:
  - a manual workflow dispatch of `.github/workflows/coderabbit-review-trigger.yml`, or
  - a PR comment containing `/coderabbit-review`
- One-time setup requirement (GitHub side):
  - CodeRabbit GitHub App must be installed for this repository.
  - Repository access must include this repo for PR review events.
  - In CodeRabbit repository settings, if `Use Organization Settings` is enabled and org-level auto review is disabled, disable `Use Organization Settings` and apply repository-level settings.
- Per-PR verification:
  - Confirm the `trigger-coderabbit-review` workflow succeeds on the PR.
  - Confirm a CodeRabbit status/check or review comment appears on the PR.
  - If no CodeRabbit status/check appears within 5 minutes of PR creation/update, verify app installation/access and trigger a re-check from CodeRabbit dashboard if available.
  - If CodeRabbit status is present but review is skipped, fix dashboard/repo config and re-trigger review.
  - The raw `CodeRabbit` GitHub status is not a required `main` branch merge check.

## Definition of Done
- Feature works end-to-end in dev
- Tests added/updated
- Docs updated
- CI green
- In-chat handoff summary posted after merge
