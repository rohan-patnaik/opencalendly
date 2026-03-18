import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = resolve(process.cwd(), 'scripts/env-check.mjs');

const createBaseEnv = () => `
DATABASE_URL=postgres://user:pass@test.neon.tech/opencalendly
SESSION_SECRET=${'a'.repeat(32)}
APP_BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:8787
NEXT_PUBLIC_API_BASE_URL=http://localhost:8787
CLOUDFLARE_ACCOUNT_ID=cf-account
CLOUDFLARE_API_TOKEN=cf-token
HYPERDRIVE_ID=hyperdrive
RESEND_API_KEY=resend-key
RESEND_FROM_EMAIL=OpenCalendly <no-reply@example.org>
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ZXhhbXBsZS5hY2NvdW50cy5kZXYk
CLERK_SECRET_KEY=sk_test_secret
GOOGLE_CLIENT_ID=google-client-id
GOOGLE_CLIENT_SECRET=google-client-secret
MICROSOFT_CLIENT_ID=microsoft-client-id
MICROSOFT_CLIENT_SECRET=microsoft-client-secret
`;

const tempDirs: string[] = [];

const writeEnv = (contents: string): string => {
  const dir = mkdtempSync(join(tmpdir(), 'opencalendly-env-check-'));
  tempDirs.push(dir);
  writeFileSync(join(dir, '.env'), contents.trimStart(), 'utf8');
  return dir;
};

const runEnvCheck = (cwd: string, args: string[] = []): string => {
  return execFileSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });
};

describe('env-check script', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps local validation permissive for optional production-only secrets', () => {
    const cwd = writeEnv(createBaseEnv());
    const output = runEnvCheck(cwd);

    expect(output).toContain('Environment validation passed for required variables.');
    expect(output).toContain('WEBHOOK_SECRET_ENCRYPTION_KEY is empty.');
    expect(output).toContain('TELEMETRY_HMAC_KEY is empty.');
  });

  it('fails production validation when dedicated webhook and telemetry keys are missing', () => {
    const cwd = writeEnv(`
${createBaseEnv()}
APP_BASE_URL=https://app.opencalendly.com
API_BASE_URL=https://api.opencalendly.com
NEXT_PUBLIC_API_BASE_URL=https://api.opencalendly.com
`);

    expect(() => runEnvCheck(cwd, ['--production'])).toThrowError(/WEBHOOK_SECRET_ENCRYPTION_KEY is empty/);
  });

  it('passes production validation when dedicated keys and https origins are configured', () => {
    const cwd = writeEnv(`
${createBaseEnv()}
APP_BASE_URL=https://app.opencalendly.com
API_BASE_URL=https://api.opencalendly.com
NEXT_PUBLIC_API_BASE_URL=https://api.opencalendly.com
WEBHOOK_SECRET_ENCRYPTION_KEY=${'b'.repeat(32)}
TELEMETRY_HMAC_KEY=${'c'.repeat(32)}
`);

    const output = runEnvCheck(cwd, ['--production']);
    expect(output).toContain('Production-only validation checks passed.');
  });
});
