# Cloudflare + Porkbun Domain Setup (opencalendly.com)

Last updated: 28 Feb 2026 (IST)

This runbook wires production traffic so:

- `https://opencalendly.com` and `https://www.opencalendly.com` -> Cloudflare Pages app
- `https://api.opencalendly.com` -> Cloudflare Worker API (`opencalendly-api`)

## 1) Disable URL forwarding in Porkbun

If URL forwarding is enabled, traffic is redirected to `*.l.ink` and bypasses your app.

- In Porkbun, remove/disable URL forwarding for `opencalendly.com` and `www`.

## 2) Configure Pages custom domains

In Cloudflare Dashboard -> Pages -> your project:

- Add custom domain: `opencalendly.com`
- Add custom domain: `www.opencalendly.com`

Cloudflare will provide DNS target values if needed. Apply exactly what Pages requests.

## 3) Configure Worker custom domain route

Worker config in repo already includes production route:

- `api.opencalendly.com/*`

File: `apps/api/wrangler.toml`

Deploy API using production env so the route is active:

```bash
npm run deploy:api:production
```

## 4) DNS records in Porkbun

Use the DNS values required by Cloudflare Pages + Worker setup. Typical shape:

- `@` -> Pages target (or flattened equivalent)
- `www` -> CNAME to Pages target
- `api` -> CNAME to Worker custom domain target (Cloudflare Dashboard -> Workers & Pages -> `opencalendly-api` -> Triggers -> Custom Domains)

Keep existing email records (Resend SPF/DKIM/MX/DMARC) unchanged.

## 5) Deploy web

```bash
npm run deploy:web:production
```

Required env vars:

- `CLOUDFLARE_PAGES_PROJECT`
- Optional: `CLOUDFLARE_PAGES_PRODUCTION_BRANCH` (defaults to `main`)

## 6) Verify end-to-end

```bash
npm run domain:check:production
```

Success criteria:

- `https://opencalendly.com` responds and does not redirect to `l.ink`
- `https://api.opencalendly.com/health` returns `{ "status": "ok" }`

## 7) Rollback

If deploy is unhealthy:

1. Roll API back to previous Worker deploy ID.
2. Roll Pages back to previous production deployment.
3. Re-run `npm run domain:check:production`.
4. Follow incident + restore steps in `docs/OPERATOR_RUNBOOK.md`.
