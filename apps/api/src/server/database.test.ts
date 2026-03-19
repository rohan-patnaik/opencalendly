import { describe, expect, it } from 'vitest';

import { shouldUsePerRequestDatabase } from './database';

describe('shouldUsePerRequestDatabase', () => {
  it('uses a short-lived database client for localhost requests', () => {
    expect(
      shouldUsePerRequestDatabase({
        env: { APP_BASE_URL: 'https://opencalendly.com' },
        req: { url: 'http://localhost:8787/v0/auth/me' },
      }),
    ).toBe(true);
  });

  it('uses a short-lived database client for localhost app configuration', () => {
    expect(
      shouldUsePerRequestDatabase({
        env: { APP_BASE_URL: 'http://localhost:3000' },
      }),
    ).toBe(true);
  });

  it('keeps runtime database reuse enabled for non-local environments', () => {
    expect(
      shouldUsePerRequestDatabase({
        env: { APP_BASE_URL: 'https://opencalendly.com' },
        req: { url: 'https://api.opencalendly.com/v0/auth/me' },
      }),
    ).toBe(false);
  });
});
