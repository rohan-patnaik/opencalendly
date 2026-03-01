# Cloudflare + Porkbun Domain Setup (opencalendly.com)

Last updated: 01 Mar 2026 (IST)

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
Cloudflare also auto-provisions SSL/TLS certificates for these custom domains; certificate issuance can take a few minutes before HTTPS is fully active.

## 3) Configure Worker custom domain route

Worker config in repo already includes production route:

- `api.opencalendly.com/*`

File: `apps/api/wrangler.toml`

`apps/api/wrangler.toml` currently points `env.production.hyperdrive` to `177ee8cb797040f58ba308bd85fa43cf` for bootstrap. Replace it with a dedicated production Hyperdrive ID before production go-live.

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

## 5) Automatic deploy on push to `main`

Production deploys are automated via:

- `.github/workflows/deploy-production.yml`
- Trigger: push to `main` (or manual `workflow_dispatch`)
- Order: API deploy -> Pages deploy -> domain verification

Required GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Optional GitHub repository variables:

- `CLOUDFLARE_PAGES_PROJECT` (default `opencalendly-web`)
- `CLOUDFLARE_PAGES_PRODUCTION_BRANCH` (default `main`)

Cloudflare Pages `Git Provider` can remain `No` when using this workflow-based direct upload model.

## 6) Manual deploy fallback

```bash
npm run deploy:api:production
npm run deploy:web:production
```

Required env vars:

- `CLOUDFLARE_PAGES_PROJECT`
- Optional: `CLOUDFLARE_PAGES_PRODUCTION_BRANCH` (defaults to `main`)

## 7) Verify end-to-end

```bash
npm run domain:check:production
```

Success criteria:

- `https://opencalendly.com` responds and does not redirect to `l.ink`
- `https://api.opencalendly.com/health` returns `{ "status": "ok" }`

If checks fail immediately after DNS changes, wait for DNS/certificate propagation (minutes to hours depending on TTL) and re-run:

```bash
npm run domain:check:production
```

Helpful diagnostics:

```bash
dig +short opencalendly.com A
dig +short www.opencalendly.com CNAME
dig +short api.opencalendly.com CNAME
```

## 8) Rollback

If deploy is unhealthy:

1. List recent Worker deployments:

```bash
npx wrangler deployments list --name opencalendly-api
```

2. Roll Worker back to previous deployment ID:

```bash
npx wrangler rollback --name opencalendly-api --deployment-id <previous-worker-deployment-id>
```

3. List recent Pages deployments:

```bash
npx wrangler pages deployments list --project-name <your-pages-project>
```

4. Promote previous Pages deployment (or rollback in dashboard):

```bash
npx wrangler pages deployments promote <previous-pages-deployment-id> --project-name <your-pages-project>
```

5. Re-run:

```bash
npm run domain:check:production
```

6. Follow incident + restore steps in `docs/OPERATOR_RUNBOOK.md`.
