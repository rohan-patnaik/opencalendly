import { describe, expect, it } from 'vitest';

import {
  buildCommonWebSecurityHeaders,
  buildSensitivePageHeaders,
  buildWebCsp,
  resolveClerkFrontendApiOrigin,
} from './security-headers.mjs';

describe('web security headers', () => {
  it('extracts the Clerk frontend API origin from the publishable key', () => {
    expect(resolveClerkFrontendApiOrigin('pk_test_ZXhhbXBsZS5hY2NvdW50cy5kZXYk')).toBe(
      'https://example.accounts.dev',
    );
  });

  it('builds a CSP that allows API script loading and Clerk connectivity', () => {
    const csp = buildWebCsp({
      appBaseUrl: 'https://opencalendly.com',
      apiBaseUrl: 'https://api.opencalendly.com',
      clerkPublishableKey: 'pk_test_ZXhhbXBsZS5hY2NvdW50cy5kZXYk',
      isDevelopment: false,
    });

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://api.opencalendly.com");
    expect(csp).toContain(
      "connect-src 'self' https://opencalendly.com https://api.opencalendly.com https://example.accounts.dev https://clerk-telemetry.com",
    );
    expect(csp).toContain("frame-src 'self' https://opencalendly.com https://challenges.cloudflare.com");
  });

  it('adds development eval support for Next dev mode', () => {
    const csp = buildWebCsp({
      appBaseUrl: 'http://localhost:3000',
      apiBaseUrl: 'http://localhost:8787',
      isDevelopment: true,
    });

    expect(csp).toContain("'unsafe-eval'");
  });

  it('allows both localhost and 127.0.0.1 aliases for local development', () => {
    const csp = buildWebCsp({
      appBaseUrl: 'http://localhost:3000',
      apiBaseUrl: 'http://localhost:8787',
      isDevelopment: true,
    });

    expect(csp).toContain('http://localhost:3000');
    expect(csp).toContain('http://127.0.0.1:3000');
    expect(csp).toContain('http://localhost:8787');
    expect(csp).toContain('http://127.0.0.1:8787');
  });

  it('does not emit invalid IPv6 localhost sources in the browser CSP', () => {
    const csp = buildWebCsp({
      appBaseUrl: 'http://localhost:3000',
      apiBaseUrl: 'http://localhost:8787',
      isDevelopment: true,
    });

    expect(csp).not.toContain('http://[::1]:3000');
    expect(csp).not.toContain('http://[::1]:8787');
  });

  it('fails closed instead of whitelisting localhost in production', () => {
    const csp = buildWebCsp({
      isDevelopment: false,
    });

    expect(csp).not.toContain('http://localhost:3000');
    expect(csp).not.toContain('http://localhost:8787');
  });

  it('emits the baseline header set', () => {
    const headers = buildCommonWebSecurityHeaders({
      appBaseUrl: 'https://opencalendly.com',
      apiBaseUrl: 'https://api.opencalendly.com',
      isDevelopment: false,
    });

    expect(headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'Content-Security-Policy' }),
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
        },
      ]),
    );
  });

  it('denies framing on sensitive pages', () => {
    expect(buildSensitivePageHeaders()).toEqual([
      { key: 'X-Frame-Options', value: 'DENY' },
    ]);
  });
});
