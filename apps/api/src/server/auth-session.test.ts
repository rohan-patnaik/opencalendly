import { describe, expect, it } from 'vitest';

import { buildSessionCookieHeader, shouldUseSecureSessionCookie } from './auth-session';

describe('session cookie security', () => {
  it('does not mark localhost cookies as secure', () => {
    const request = new Request('http://localhost:8787/v0/auth/me');
    expect(shouldUseSecureSessionCookie(request, { APP_BASE_URL: 'http://localhost:3000' })).toBe(false);

    const cookie = buildSessionCookieHeader({
      request,
      env: { APP_BASE_URL: 'http://localhost:3000' },
      value: 'session-token',
      expiresAt: new Date('2026-03-19T00:00:00.000Z'),
    });

    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Secure');
  });

  it('requires secure cookies for https production origins', () => {
    const request = new Request('https://api.opencalendly.com/v0/auth/me');
    expect(shouldUseSecureSessionCookie(request, { APP_BASE_URL: 'https://opencalendly.com' })).toBe(true);

    const cookie = buildSessionCookieHeader({
      request,
      env: { APP_BASE_URL: 'https://opencalendly.com' },
      value: 'session-token',
      expiresAt: new Date('2026-03-19T00:00:00.000Z'),
    });

    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
  });
});
