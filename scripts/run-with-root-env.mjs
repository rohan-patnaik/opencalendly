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
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return {};
  }

  return parseEnvFile(readFileSync(envPath, 'utf8'));
};

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('Usage: node scripts/run-with-root-env.mjs <command> [...args]');
  process.exit(1);
}

const mergedEnv = { ...loadRootEnv(), ...process.env };

const child = spawn(command, args, {
  stdio: 'inherit',
  env: mergedEnv,
  shell: process.platform === 'win32',
});

child.on('error', (error) => {
  console.error(`Failed to run command "${command}": ${error.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
