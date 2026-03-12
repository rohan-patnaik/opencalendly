import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Client } from 'pg';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);
const NEON_HOST_PATTERN = /\.neon\.tech(?::\d+)?(?:\/|$)/i;

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

const ROOT_ENV_PATH = resolve(process.cwd(), '.env');

const loadRootEnv = () => {
  if (!existsSync(ROOT_ENV_PATH)) {
    return {};
  }

  return parseEnvFile(readFileSync(ROOT_ENV_PATH, 'utf8'));
};

const mergedEnv = {
  ...loadRootEnv(),
  ...process.env,
};

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const assertLocalUrl = (key) => {
  const value = mergedEnv[key]?.trim();
  if (!value) {
    fail(`${key} is required for local DB reset.`);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${key} must be a valid absolute URL for local DB reset.`);
  }

  if (!LOCAL_HOSTNAMES.has(parsed.hostname.trim().toLowerCase())) {
    fail(`${key} must point to localhost or 127.0.0.1 for local DB reset.`);
  }
};

const runCommand = (command, args) => {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: mergedEnv,
      shell: process.platform === 'win32',
    });

    child.on('error', (error) => {
      rejectPromise(error);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`Command failed: ${command} ${args.join(' ')}`));
    });
  });
};

if (mergedEnv.CONFIRM_LOCAL_DB_RESET !== 'yes') {
  fail('Refusing local DB reset without CONFIRM_LOCAL_DB_RESET=yes.');
}

assertLocalUrl('APP_BASE_URL');
assertLocalUrl('API_BASE_URL');
assertLocalUrl('NEXT_PUBLIC_API_BASE_URL');

const databaseUrl = mergedEnv.DATABASE_URL?.trim();
if (!databaseUrl) {
  fail('DATABASE_URL is required for local DB reset.');
}
if (!NEON_HOST_PATTERN.test(databaseUrl)) {
  fail('DATABASE_URL must point to Neon Postgres (*.neon.tech).');
}

const client = new Client({
  connectionString: databaseUrl,
});

const reset = async () => {
  await client.connect();
  try {
    await client.query('drop schema if exists public cascade;');
    await client.query('drop schema if exists drizzle cascade;');
    await client.query('create schema public;');
    await client.query('grant all on schema public to current_user;');
    await client.query('grant all on schema public to public;');
  } finally {
    await client.end();
  }

  await runCommand('node', ['./scripts/run-with-root-env.mjs', 'npm', 'run', 'migrate', '-w', 'packages/db']);
  await runCommand('node', ['./scripts/run-with-root-env.mjs', 'npm', 'run', 'seed', '-w', 'packages/db']);
};

reset().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
