import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED = {
  DATABASE_URL: 'Neon dashboard -> Project -> Connection details (direct Postgres URL).',
  SESSION_SECRET: 'Generate with: openssl rand -hex 32',
  APP_BASE_URL: 'Local web URL, usually http://localhost:3000',
  API_BASE_URL: 'Local API URL, usually http://localhost:8787',
  NEXT_PUBLIC_API_BASE_URL: 'Should match API_BASE_URL for local web->API calls.',
  CLOUDFLARE_ACCOUNT_ID: 'Cloudflare dashboard -> Account ID.',
  CLOUDFLARE_API_TOKEN: 'Cloudflare dashboard -> API Tokens.',
  HYPERDRIVE_ID: 'Cloudflare dashboard -> Hyperdrive configuration ID.',
  RESEND_API_KEY: 'Resend dashboard -> API Keys.',
  RESEND_FROM_EMAIL: 'Verified sender address in Resend, e.g. OpenCalendly <no-reply@yourdomain.com>.',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'Clerk dashboard -> API keys -> Publishable key.',
  CLERK_SECRET_KEY: 'Clerk dashboard -> API keys -> Secret key.',
  GOOGLE_CLIENT_ID: 'Google Cloud Console -> Credentials -> OAuth 2.0 Client IDs.',
  GOOGLE_CLIENT_SECRET: 'Google Cloud Console -> Credentials -> OAuth 2.0 Client Secret.',
};

const OPTIONAL = {
  RESET_DATABASE_URL:
    'Optional dedicated Neon URL for npm run db:reset:local. Use a disposable local-only branch/database.',
  CLOUDFLARE_PAGES_PROJECT:
    'Cloudflare Pages project name used by npm run deploy:web:production.',
  CLOUDFLARE_PAGES_PRODUCTION_BRANCH:
    'Optional production branch for Pages deploy (defaults to main).',
  ENABLE_DEV_AUTH_BOOTSTRAP:
    'Optional local-only flag. Set to true to enable POST /v0/dev/auth/bootstrap during local development.',
  DEMO_DAILY_ACCOUNT_LIMIT: 'Optional integer daily cap for admitted demo accounts (default 15).',
  DEMO_DAILY_CREDIT_LIMIT: 'Optional integer daily credit budget per admitted account (default 20).',
  DEMO_CREDIT_BYPASS_EMAILS:
    'Optional comma-separated email allowlist for dev/internal accounts that bypass demo quota.',
  WEBHOOK_SECRET_ENCRYPTION_KEY:
    'Optional dedicated encryption key for webhook signing secrets. Falls back to SESSION_SECRET when omitted.',
  TELEMETRY_HMAC_KEY:
    'Recommended dedicated secret for telemetry HMAC. If unset, email delivery telemetry writes are skipped.',
  SENTRY_DSN_API:
    'Recommended Sentry DSN for API exception capture. Required before GA on staging/production.',
  SENTRY_DSN_WEB:
    'Recommended Sentry DSN for web exception capture. Required before GA on staging/production.',
  SENTRY_ENVIRONMENT:
    'Recommended Sentry environment label such as staging or production.',
  MICROSOFT_CLIENT_ID: 'Microsoft Entra -> App registrations -> client ID (Feature 7).',
  MICROSOFT_CLIENT_SECRET: 'Microsoft Entra -> App registrations -> client secret (Feature 7).',
};

const PLACEHOLDER_PATTERN = /(replace-with|your[_-]|changeme|todo|example\.com|YOUR_|dummy|sample)/i;
const NEON_HOST_PATTERN = /\.neon\.tech(?::\d+)?(?:\/|$)/i;
const LOCAL_HOSTNAME_SET = new Set(['localhost', '127.0.0.1']);
const PRODUCTION_ONLY_REQUIRED = {
  WEBHOOK_SECRET_ENCRYPTION_KEY:
    'Production requires a dedicated encryption key for webhook signing secrets.',
  TELEMETRY_HMAC_KEY:
    'Production requires a dedicated telemetry HMAC key so operational writes and alerts remain enabled.',
};
const PRODUCTION_ONLY_SENTRY = {
  SENTRY_DSN_API:
    'Production requires an API Sentry DSN so smoke exceptions and production failures are observable.',
  SENTRY_DSN_WEB:
    'Production requires a web Sentry DSN so client-side exceptions are observable.',
  SENTRY_ENVIRONMENT:
    'Production requires an explicit Sentry environment label.',
};
const PRODUCTION_ONLY_HTTPS_URLS = ['APP_BASE_URL', 'API_BASE_URL', 'NEXT_PUBLIC_API_BASE_URL'];
const isProductionValidation =
  process.argv.includes('--production') || process.env.OPENCALENDLY_ENV_CHECK_MODE === 'production';

const resolveHostname = (value) => {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const envPath = resolve(process.cwd(), '.env');
let envContents = '';

try {
  envContents = readFileSync(envPath, 'utf8');
} catch {
  console.error(`Missing .env at ${envPath}`);
  process.exit(1);
}

const parsed = {};
for (const line of envContents.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    continue;
  }
  const separatorIndex = trimmed.indexOf('=');
  if (separatorIndex <= 0) {
    continue;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  parsed[key] = value;
}

const errors = [];
const warnings = [];

for (const [key, help] of Object.entries(REQUIRED)) {
  const value = parsed[key];
  if (!value) {
    errors.push(`${key} is empty. ${help}`);
    continue;
  }

  if (PLACEHOLDER_PATTERN.test(value)) {
    errors.push(`${key} still looks like a placeholder. ${help}`);
  }
}

const databaseUrl = parsed.DATABASE_URL;
if (databaseUrl && !NEON_HOST_PATTERN.test(databaseUrl)) {
  errors.push('DATABASE_URL must be a Neon URL with host ending in .neon.tech');
}

const resetDatabaseUrl = parsed.RESET_DATABASE_URL;
if (resetDatabaseUrl && !NEON_HOST_PATTERN.test(resetDatabaseUrl)) {
  errors.push('RESET_DATABASE_URL must be a Neon URL with host ending in .neon.tech');
}

const appBaseUrl = parsed.APP_BASE_URL;
if (appBaseUrl && !/^https?:\/\/.+/i.test(appBaseUrl)) {
  errors.push('APP_BASE_URL must be an absolute http(s) URL.');
}

const apiBaseUrl = parsed.API_BASE_URL;
if (apiBaseUrl && !/^https?:\/\/.+/i.test(apiBaseUrl)) {
  errors.push('API_BASE_URL must be an absolute http(s) URL.');
}

const publicApiBaseUrl = parsed.NEXT_PUBLIC_API_BASE_URL;
if (publicApiBaseUrl && !/^https?:\/\/.+/i.test(publicApiBaseUrl)) {
  errors.push('NEXT_PUBLIC_API_BASE_URL must be an absolute http(s) URL.');
}

const appBaseHostname = resolveHostname(appBaseUrl);
const apiBaseHostname = resolveHostname(apiBaseUrl);
const publicApiBaseHostname = resolveHostname(publicApiBaseUrl);

if (
  appBaseHostname &&
  apiBaseHostname &&
  LOCAL_HOSTNAME_SET.has(appBaseHostname) &&
  LOCAL_HOSTNAME_SET.has(apiBaseHostname) &&
  appBaseHostname !== apiBaseHostname
) {
  errors.push(
    `APP_BASE_URL and API_BASE_URL must use the same local hostname for cookie auth (found ${appBaseHostname} vs ${apiBaseHostname}).`,
  );
}

if (
  apiBaseHostname &&
  publicApiBaseHostname &&
  LOCAL_HOSTNAME_SET.has(apiBaseHostname) &&
  LOCAL_HOSTNAME_SET.has(publicApiBaseHostname) &&
  apiBaseHostname !== publicApiBaseHostname
) {
  errors.push(
    `API_BASE_URL and NEXT_PUBLIC_API_BASE_URL must use the same local hostname for cookie auth (found ${apiBaseHostname} vs ${publicApiBaseHostname}).`,
  );
}

const demoDailyAccountLimit = parsed.DEMO_DAILY_ACCOUNT_LIMIT;
if (demoDailyAccountLimit) {
  const parsedLimit = Number.parseInt(demoDailyAccountLimit, 10);
  if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
    errors.push('DEMO_DAILY_ACCOUNT_LIMIT must be an integer >= 1 when provided.');
  }
}

const demoDailyCreditLimit = parsed.DEMO_DAILY_CREDIT_LIMIT;
if (demoDailyCreditLimit) {
  const parsedLimit = Number.parseInt(demoDailyCreditLimit, 10);
  if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
    errors.push('DEMO_DAILY_CREDIT_LIMIT must be an integer >= 1 when provided.');
  }
}

const sessionSecret = parsed.SESSION_SECRET;
if (sessionSecret && sessionSecret.length < 32) {
  errors.push('SESSION_SECRET must be at least 32 characters.');
}

const telemetryHmacKey = parsed.TELEMETRY_HMAC_KEY;
if (telemetryHmacKey && telemetryHmacKey.length < 32) {
  errors.push('TELEMETRY_HMAC_KEY must be at least 32 characters when provided.');
}

const webhookSecretEncryptionKey = parsed.WEBHOOK_SECRET_ENCRYPTION_KEY;
if (webhookSecretEncryptionKey && webhookSecretEncryptionKey.length < 32) {
  errors.push('WEBHOOK_SECRET_ENCRYPTION_KEY must be at least 32 characters when provided.');
}

for (const key of ['SENTRY_DSN_API', 'SENTRY_DSN_WEB']) {
  const value = parsed[key];
  if (value && !/^https:\/\/.+/i.test(value)) {
    errors.push(`${key} must be a valid https DSN URL when provided.`);
  }
}

const enableDevAuthBootstrap = parsed.ENABLE_DEV_AUTH_BOOTSTRAP;
if (enableDevAuthBootstrap && !/^(true|false)$/i.test(enableDevAuthBootstrap.trim())) {
  errors.push('ENABLE_DEV_AUTH_BOOTSTRAP must be "true" or "false" when provided.');
}

if (apiBaseUrl && publicApiBaseUrl && apiBaseUrl !== publicApiBaseUrl) {
  warnings.push('API_BASE_URL and NEXT_PUBLIC_API_BASE_URL differ.');
}

if (isProductionValidation) {
  for (const [key, help] of Object.entries(PRODUCTION_ONLY_REQUIRED)) {
    const value = parsed[key];
    if (!value) {
      errors.push(`${key} is empty. ${help}`);
      continue;
    }

    if (value.length < 32) {
      errors.push(`${key} must be at least 32 characters in production.`);
    }
  }

  for (const [key, help] of Object.entries(PRODUCTION_ONLY_SENTRY)) {
    if (!parsed[key]) {
      errors.push(`${key} is empty. ${help}`);
    }
  }

  for (const key of PRODUCTION_ONLY_HTTPS_URLS) {
    const value = parsed[key];
    if (!value) {
      continue;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(value);
    } catch {
      errors.push(`${key} must be a valid absolute URL in production.`);
      continue;
    }

    if (parsedUrl.protocol !== 'https:') {
      errors.push(`${key} must use https in production.`);
    }

    if (LOCAL_HOSTNAME_SET.has(parsedUrl.hostname.toLowerCase())) {
      errors.push(`${key} must not point at a local hostname in production.`);
    }
  }
}

for (const [key, help] of Object.entries(OPTIONAL)) {
  const value = parsed[key];
  if (!value) {
    warnings.push(`${key} is empty. ${help}`);
    continue;
  }
  if (PLACEHOLDER_PATTERN.test(value)) {
    warnings.push(`${key} looks like a placeholder. ${help}`);
  }
}

if (errors.length > 0) {
  console.error('Environment validation failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }

  if (warnings.length > 0) {
    console.error('\nWarnings:');
    for (const warning of warnings) {
      console.error(`- ${warning}`);
    }
  }
  process.exit(1);
}

console.log('Environment validation passed for required variables.');

if (isProductionValidation) {
  console.log('Production-only validation checks passed.');
}

if (warnings.length > 0) {
  console.log('\nWarnings:');
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}
