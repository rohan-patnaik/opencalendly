import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED = {
  DATABASE_URL: 'Neon dashboard -> Project -> Connection details (direct Postgres URL).',
  SESSION_SECRET: 'Generate with: openssl rand -hex 32',
  APP_BASE_URL: 'Local web URL, usually http://localhost:3000',
  API_BASE_URL: 'Local API URL, usually http://127.0.0.1:8787',
  NEXT_PUBLIC_API_BASE_URL: 'Should match API_BASE_URL for local web->API calls.',
  CLOUDFLARE_ACCOUNT_ID: 'Cloudflare dashboard -> Account ID.',
  CLOUDFLARE_API_TOKEN: 'Cloudflare dashboard -> API Tokens.',
  HYPERDRIVE_ID: 'Cloudflare dashboard -> Hyperdrive configuration ID.',
  RESEND_API_KEY: 'Resend dashboard -> API Keys.',
  RESEND_FROM_EMAIL: 'Verified sender address in Resend, e.g. OpenCalendly <no-reply@yourdomain.com>.',
  GOOGLE_CLIENT_ID: 'Google Cloud Console -> Credentials -> OAuth 2.0 Client IDs.',
  GOOGLE_CLIENT_SECRET: 'Google Cloud Console -> Credentials -> OAuth 2.0 Client Secret.',
};

const OPTIONAL = {
  DEMO_DAILY_PASS_LIMIT: 'Optional integer daily pass limit (Feature 3).',
  GITHUB_CLIENT_ID: 'GitHub Developer Settings -> OAuth Apps.',
  GITHUB_CLIENT_SECRET: 'GitHub Developer Settings -> OAuth Apps.',
};

const PLACEHOLDER_PATTERN = /(replace-with|your[_-]|changeme|todo|example\.com|YOUR_|dummy|sample)/i;
const NEON_HOST_PATTERN = /\.neon\.tech(?::\d+)?(?:\/|$)/i;

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

const demoDailyPassLimit = parsed.DEMO_DAILY_PASS_LIMIT;
if (demoDailyPassLimit) {
  const parsedLimit = Number.parseInt(demoDailyPassLimit, 10);
  if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
    errors.push('DEMO_DAILY_PASS_LIMIT must be an integer >= 1 when provided.');
  }
}

const sessionSecret = parsed.SESSION_SECRET;
if (sessionSecret && sessionSecret.length < 32) {
  errors.push('SESSION_SECRET must be at least 32 characters.');
}

if (apiBaseUrl && publicApiBaseUrl && apiBaseUrl !== publicApiBaseUrl) {
  warnings.push('API_BASE_URL and NEXT_PUBLIC_API_BASE_URL differ.');
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

if (warnings.length > 0) {
  console.log('\nWarnings:');
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}
