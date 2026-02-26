import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

const loadRootEnv = () => {
  const rootEnvPath = resolve(process.cwd(), '..', '..', '.env');
  if (!existsSync(rootEnvPath)) {
    return;
  }

  const values = parseEnvFile(readFileSync(rootEnvPath, 'utf8'));
  for (const [key, value] of Object.entries(values)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
};

loadRootEnv();

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
const wranglerArgs = ['dev', '--config', 'wrangler.toml'];

const passThroughVarKeys = [
  'DATABASE_URL',
  'APP_BASE_URL',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'DEMO_DAILY_PASS_LIMIT',
  'SESSION_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
];

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
