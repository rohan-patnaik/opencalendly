# OpenCalendly v1 Barebones UX Context (Copy/Paste Prompt)

Use the prompt below as-is in another LLM.

```text
You are redesigning the UX for OpenCalendly, an open-source Calendly alternative.

Current state:
- Backend/product features are implemented through Feature 13.
- UI is intentionally stripped down to a barebones baseline so flow can be redesigned.
- Functionality must stay intact; only UX and flow should be reworked.

Tech constraints:
- Web: Next.js (App Router), TypeScript
- API: Cloudflare Worker (Hono), TypeScript
- DB: Neon Postgres only (Drizzle ORM)
- Email: Resend
- Auth: custom magic-link session auth (not Clerk/BetterAuth/NextAuth)

Implemented feature capabilities:
1) Feature 0: monorepo bootstrap + docs + infra.
2) Feature 1: one-on-one event type booking, timezone + buffers, transaction-safe booking commit, confirmation email path.
3) Feature 2: cancel/reschedule via secure action tokens + email handling.
4) Feature 3: demo daily credits + waitlist.
5) Feature 4: embed script + webhook subscriptions + deliveries/retries.
6) Feature 5: team scheduling modes (round-robin, collective).
7) Feature 6: Google calendar busy sync + conflict blocking.
8) Feature 7: Microsoft calendar sync + calendar writeback flow.
9) Feature 8: analytics and operator dashboard metrics.
10) Feature 9: reliability hardening (rate limiting, idempotency, platform guardrails).
11) Feature 10: launch-readiness docs and release gate checks.
12) Feature 11: UI foundation + theme toggle + auth UX.
13) Feature 12: organizer console over implemented APIs.
14) Feature 13: public booking/action UX parity and embed playground.

Current route map (barebones UX):
- / : implemented feature index + key route links
- /auth/sign-in : request magic-link token
- /auth/verify : verify token and establish session
- /demo/intro-call : one-on-one public booking flow
- /team/demo-team/team-intro-call : team booking flow
- /bookings/actions/[token] : cancel/reschedule action flow
- /organizer : organizer management console
- /dashboard : organizer/operator analytics
- /embed/playground : embed script preview and generation

Core workflow requirements:
- Booking correctness must remain: transaction + availability re-check + unique slot safety.
- Idempotency behavior must remain for booking create/team booking/reschedule.
- Public actions (cancel/reschedule) must preserve token validation semantics.
- Existing API contracts should remain backward compatible unless explicit migration plan is given.

What I need from you:
1) Propose a complete UX information architecture for public + organizer + dashboard surfaces.
2) Propose improved navigation model and route hierarchy.
3) Propose page-level wireframe structure (header/content/CTA/layout blocks) for each major route.
4) Propose state and error UX standards (loading, empty, conflict, retry, degraded-provider states).
5) Propose design token system (light/dark), component primitives, and interaction patterns.
6) Provide a phased implementation plan split into PR-sized increments with acceptance criteria and testing strategy.
7) Explicitly call out any proposed changes that would require API changes versus pure frontend changes.

Output format:
- A) IA + navigation
- B) Public booking flow redesign
- C) Organizer flow redesign
- D) Dashboard redesign
- E) Shared design system/token proposal
- F) PR-by-PR implementation plan
- G) Risks + migration notes
```

