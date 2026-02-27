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

### Completed foundation and v1 buildout (PR#2-PR#15)

- Monorepo + infra bootstrap.
- One-on-one event types + public booking links + timezone/buffer handling.
- Secure token-based cancel/reschedule + lifecycle emails.
- Demo Credits Pool + waitlist + reset controls.
- Embeds + outbound webhooks with retry/signature.
- Team scheduling modes (`round_robin`, `collective`) with correctness-safe commit.
- Calendar sync hardening (Google + Microsoft) with external busy conflict blocking and writeback retry.
- Analytics/operator dashboard API + baseline web dashboard.
- Reliability hardening (rate limiting, idempotency keys, CI smoke coverage, platform policy enforcement).
- Launch readiness docs + `v1.0.0` release artifacts.
- Migration bootstrap hotfix for fresh Neon environments.

### Post-v1 app-first parity track

- Feature 15: app shell parity foundation (sticky nav, mobile drawer, tokens, standardized UI primitives, theme persistence).
- Feature 16: booking flow parity (one-on-one, team booking, booking actions, embed playground UX hardening).
- Feature 17: organizer console parity (operational IA, actionable panel states, dashboard/organizer polish).
- Feature 18: marketing surface parity (`/`, `/pricing`, `/features`, `/solutions`, `/resources`).

### Done definition for app-first parity track

- Feature 15 through Feature 18 are merged to `main` with CI green.
- CodeRabbit and Greptile review gates are satisfied for each feature PR.
- Frontend architecture and route documentation stay in sync with shipped UX.
