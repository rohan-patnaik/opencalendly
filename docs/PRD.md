# Product Requirements (v0-v2)

## Vision

Build a practical open-source scheduling platform for solo creators, consultants, and small teams that need reliable booking without paid SaaS lock-in.

## Goals

- Deliver a one-on-one scheduling MVP with strong booking correctness.
- Stay within free-tier budget constraints by design.
- Keep architecture simple and OSS-friendly.

## Non-goals (for MVP)

- Full team round-robin routing.
- Marketplace/discovery features.
- Complex billing/subscriptions.

## Target users

- Solo consultants scheduling calls with clients.
- OSS maintainers offering office hours.
- Small teams that need basic meeting links and confirmations.

## Roadmap

### MVP (PR#2-PR#4)

- Monorepo + infra bootstrap.
- One-on-one event types and public booking links.
- Reschedule/cancel via secure tokens.
 - Booking confirmation/cancellation/reschedule notifications.

### V1 (PR#5-PR#6)

- Demo Credits Pool for free-tier protection (daily pass limit with atomic consume).
- Waitlist flow when daily passes are exhausted.
- Admin/dev daily reset route for demo operations.
- Embeds and outbound webhooks with retries.

### V2 (post-PR#6)

- Team scheduling modes (round robin/collective).
- Calendar sync hardening.
- Analytics and operational dashboards.
