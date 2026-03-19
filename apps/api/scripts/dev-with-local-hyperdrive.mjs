import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import net from 'node:net';

const parseEnvFile = (contents) => {
  const values = {};

  for (const line of contents.split(/\r?\n/)) {
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

    values[key] = value;
  }

  return values;
};

const ROOT_ENV_PATH = resolve(process.cwd(), '..', '..', '.env');
const API_DEV_VARS_PATH = resolve(process.cwd(), '.dev.vars');
const API_DEV_PORT = 8787;

const assertPortAvailable = async (port, label) => {
  await new Promise((resolvePromise, rejectPromise) => {
    const server = net.createServer();

    server.once('error', (error) => {
      server.close();
      rejectPromise(error);
    });

    server.listen(port, () => {
      server.close((closeError) => {
        if (closeError) {
          rejectPromise(closeError);
          return;
        }
        resolvePromise();
      });
    });
  }).catch((error) => {
    if ((error && typeof error === 'object' && 'code' in error && error.code) === 'EADDRINUSE') {
      console.error(`${label} is already in use. Stop the existing process before starting local dev.`);
      process.exit(1);
    }

    console.error(`Unable to verify ${label}: ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exit(1);
  });
};

const loadRootEnv = () => {
  if (!existsSync(ROOT_ENV_PATH)) {
    return;
  }

  const values = parseEnvFile(readFileSync(ROOT_ENV_PATH, 'utf8'));
  for (const [key, value] of Object.entries(values)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
};

loadRootEnv();
await assertPortAvailable(API_DEV_PORT, 'api-dev-port');

if (!process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE) {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = databaseUrl;
  }
}

if (!process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE) {
  console.error(
    'Missing local Hyperdrive DB URL. Set DATABASE_URL in repo .env or set CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE.',
  );
  process.exit(1);
}

const wranglerCommand = process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler';
const wranglerArgs = ['dev', '--config', 'wrangler.toml', '--port', String(API_DEV_PORT)];

if (existsSync(API_DEV_VARS_PATH)) {
  wranglerArgs.push('--env-file', API_DEV_VARS_PATH);
}
if (existsSync(ROOT_ENV_PATH)) {
  wranglerArgs.push('--env-file', ROOT_ENV_PATH);
}

const passThroughVarKeys = [
  'DATABASE_URL',
  'APP_BASE_URL',
  'RESEND_FROM_EMAIL',
  'ENABLE_DEV_AUTH_BOOTSTRAP',
  'DEMO_DAILY_ACCOUNT_LIMIT',
  'DEMO_DAILY_CREDIT_LIMIT',
  'GOOGLE_CLIENT_ID',
  'MICROSOFT_CLIENT_ID',
];

// Security: keep secrets out of CLI args (`--var`) to avoid leaking in process listings.
// Secret bindings (SESSION_SECRET, RESEND_API_KEY, GOOGLE_CLIENT_SECRET, MICROSOFT_CLIENT_SECRET)
// should be sourced from Wrangler's secure local config (`.dev.vars`) or remote secrets.
// `DEMO_CREDIT_BYPASS_EMAILS` is an allowlist and must stay in env files instead of `--var`.

for (const key of passThroughVarKeys) {
  const value = process.env[key]?.trim();
  if (!value) {
    continue;
  }
  wranglerArgs.push('--var', `${key}:${value}`);
}

const child = spawn(wranglerCommand, wranglerArgs, {
  stdio: 'inherit',
  env: process.env,
});

child.on('error', (error) => {
  console.error(`Failed to start wrangler dev: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
