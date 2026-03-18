# k6 Load Harness

This harness verifies GA-critical correctness and reliability behaviors against the real API.

Profiles:

- `smoke`: low-volume correctness check for all configured flows
- `baseline`: representative burst traffic for availability, booking, and worker queues
- `contention`: same-slot booking pressure intended to prove `409` conflict handling and prevent duplicate bookings

## Required tooling

- `k6` installed locally: <https://grafana.com/docs/k6/latest/set-up/install-k6/>

## Required env vars

Common:

- `API_BASE_URL`
- `BASE_URL` (optional)
- `TIMEZONE`

Public availability / booking:

- `ONE_ON_ONE_USERNAME`
- `ONE_ON_ONE_EVENT_SLUG`
- `ONE_ON_ONE_STARTS_AT`
- `TEAM_SLUG`
- `TEAM_EVENT_SLUG`
- `TEAM_STARTS_AT`
- `INVITEE_NAME` (optional)
- `INVITEE_EMAIL` (optional)

Booking action bursts:

- `RESCHEDULE_TOKEN`
- `RESCHEDULE_STARTS_AT`
- `CANCEL_TOKEN`

Worker execution:

- `AUTH_TOKEN`

## Commands

```bash
npm run load:test:smoke
npm run load:test:baseline
npm run load:test:contention
```

## Seed/setup requirements

Use a reproducible dev or staging setup with:

- one public one-on-one event type
- one public team event type
- at least one authenticated organizer session token for worker runs
- valid cancel/reschedule tokens for action-burst paths
- connected Google and Microsoft providers when testing writeback queue effects
- at least one webhook subscription when testing delivery batches

## Pass / fail criteria

- no duplicate bookings are created under same-slot contention
- conflict handling remains explicit (`409`) instead of silent overbooking
- queue workers keep processing bounded batches without unbounded failed backlogs
- availability reads stay within launch goals:
  - smoke/baseline `p95 < 1500ms`
  - smoke/baseline `p99 < 3000ms`
- contention booking paths stay within launch goals:
  - `p95 < 2000ms`
  - `p99 < 4000ms`

## Notes

- `smoke` is the safest first run after a deploy.
- `contention` is intentionally noisy and should be run only against dedicated test slots.
- These scripts are environment-driven instead of hardcoding repo-specific demo data.
