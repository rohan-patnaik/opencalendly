import { describe, expect, it } from 'vitest';

import { resolveRateLimitClientKey } from './rate-limit';

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
