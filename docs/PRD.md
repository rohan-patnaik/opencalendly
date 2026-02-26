# Product Requirements (v0-v2)

## Vision

Build a practical open-source scheduling platform for solo creators, consultants, and small teams that need reliable booking without paid SaaS lock-in.

## Goals

- Deliver a one-on-one scheduling MVP with strong booking correctness.
- Stay within free-tier budget constraints by design.
- Keep architecture simple and OSS-friendly.

## Non-goals (for MVP)

- Marketplace/discovery features.
- Complex billing/subscriptions.
- Enterprise SSO/SCIM and advanced compliance workflows (post-v1).

## Target users

- Solo consultants scheduling calls with clients.
- OSS maintainers offering office hours.
- Small teams that need basic meeting links and confirmations.

## Roadmap

### Completed foundation (PR#2-PR#7)

- Monorepo + infra bootstrap.
- One-on-one event types + public booking links + timezone/buffer handling.
- Secure token-based cancel/reschedule + lifecycle emails.
- Demo Credits Pool + waitlist + reset controls.
- Embeds + outbound webhooks with retry/signature.
- Team scheduling modes (`round_robin`, `collective`) with correctness-safe commit.

### Remaining to reach v1.0

- PR#10 Feature 6: Calendar Sync Hardening v1 (Google busy sync + conflict blocking).
- PR#11 Feature 7: Calendar Sync Hardening v2 (Outlook + booking writeback).
- PR#12 Feature 8: Analytics + operator dashboard v1.
- PR#13 Feature 9: Reliability + platform hardening (rate limits, idempotency, CI/smoke, branch protection enforcement).
- PR#14 Feature 10: Launch readiness + `v1.0.0` release hardening.

### Done definition for this roadmap

- Feature 6 through Feature 10 are merged to `main` with CI green.
- CodeRabbit and Greptile review gates are satisfied for each feature PR.
- API/architecture/stack docs are updated in the same PR as each feature.
- `v1.0.0` release notes and operator runbook are published.
