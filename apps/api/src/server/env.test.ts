import { describe, expect, it } from 'vitest';

import {
  resolveAppBaseUrl,
  resolveClerkAuthorizedParties,
  resolveWebhookEncryptionSecret,
} from './env';
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

describe('resolveWebhookEncryptionSecret', () => {
  it('prefers the dedicated webhook encryption key when configured', () => {
    const value = resolveWebhookEncryptionSecret(
      createBindings({
        WEBHOOK_SECRET_ENCRYPTION_KEY: 'fedcba9876543210fedcba9876543210',
      }),
    );

    expect(value).toBe('fedcba9876543210fedcba9876543210');
  });

  it('falls back to SESSION_SECRET when no dedicated key is configured', () => {
    const value = resolveWebhookEncryptionSecret(createBindings());

    expect(value).toBe('0123456789abcdef0123456789abcdef');
  });
});

describe('resolveClerkAuthorizedParties', () => {
  it('allows both supported local web ports when APP_BASE_URL is local', () => {
    const value = resolveClerkAuthorizedParties(createBindings({ APP_BASE_URL: 'http://localhost:3000' }));

    expect(value).toContain('http://localhost:3000');
    expect(value).toContain('http://127.0.0.1:3000');
    expect(value).toContain('http://localhost:3001');
    expect(value).toContain('http://127.0.0.1:3001');
  });
});
