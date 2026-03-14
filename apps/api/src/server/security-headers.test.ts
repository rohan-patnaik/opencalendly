import { describe, expect, it } from 'vitest';

import { API_SECURITY_HEADERS } from './security-headers';

describe('API security headers', () => {
  it('defines a deny-by-default response hardening policy', () => {
    expect(API_SECURITY_HEADERS).toEqual({
      'Content-Security-Policy':
        "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
    });
  });
});
