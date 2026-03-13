import { describe, expect, it } from 'vitest';

import { resolveAppBaseUrl } from './env';
import type { Bindings } from './types';

const createBindings = (overrides: Partial<Bindings> = {}): Bindings =>
  ({
    DATABASE_URL: 'postgresql://user:pass@branch.neon.tech/db',
    SESSION_SECRET: '0123456789abcdef0123456789abcdef',
    APP_BASE_URL: undefined,
    ...overrides,
  }) as Bindings;

describe('resolveAppBaseUrl', () => {
  it('normalizes configured APP_BASE_URL to the public origin', () => {
    const value = resolveAppBaseUrl(
      createBindings({ APP_BASE_URL: 'https://opencalendly.com/app/?preview=true' }),
      new Request('https://api.opencalendly.com/v0/bookings'),
    );

    expect(value).toBe('https://opencalendly.com');
  });

  it('falls back to localhost during local development', () => {
    const value = resolveAppBaseUrl(createBindings(), new Request('http://127.0.0.1:8787/v0/bookings'));

    expect(value).toBe('http://localhost:3000');
  });
});
