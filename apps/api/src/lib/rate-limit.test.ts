import { describe, expect, it } from 'vitest';

import { resolveRateLimitClientKey } from './rate-limit';
import { parseIdempotencyKey } from '../server/rate-limit';

describe('resolveRateLimitClientKey', () => {
  it('prefers the Cloudflare client IP header', () => {
    const request = new Request('https://api.opencalendly.test/v0/bookings', {
      headers: {
        'cf-connecting-ip': '198.51.100.24',
        'x-forwarded-for': '203.0.113.4',
      },
    });

    expect(resolveRateLimitClientKey(request)).toBe('198.51.100.24');
  });

  it('falls back to the first forwarded IP outside Cloudflare', () => {
    const request = new Request('https://api.opencalendly.test/v0/bookings', {
      headers: {
        'x-forwarded-for': '203.0.113.4, 198.51.100.99',
      },
    });

    expect(resolveRateLimitClientKey(request)).toBe('203.0.113.4');
  });

  it('uses a user-agent based key when no IP headers are present', () => {
    const request = new Request('https://api.opencalendly.test/v0/bookings', {
      headers: {
        'user-agent': 'Vitest Browser',
      },
    });

    expect(resolveRateLimitClientKey(request)).toMatch(/^ua:/);
  });
});

describe('parseIdempotencyKey', () => {
  it('accepts the standard Idempotency-Key header', () => {
    const request = new Request('https://api.opencalendly.test/v0/bookings', {
      headers: {
        'Idempotency-Key': 'booking-key-1234',
      },
    });

    expect(parseIdempotencyKey(request)).toEqual({ key: 'booking-key-1234' });
  });

  it('accepts the X-Idempotency-Key compatibility header', () => {
    const request = new Request('https://api.opencalendly.test/v0/bookings', {
      headers: {
        'X-Idempotency-Key': 'booking-key-compat-1234',
      },
    });

    expect(parseIdempotencyKey(request)).toEqual({ key: 'booking-key-compat-1234' });
  });

  it('rejects requests without any supported idempotency header', () => {
    const request = new Request('https://api.opencalendly.test/v0/bookings');

    expect(parseIdempotencyKey(request)).toEqual({
      error: 'Idempotency-Key or X-Idempotency-Key header is required.',
    });
  });
});
