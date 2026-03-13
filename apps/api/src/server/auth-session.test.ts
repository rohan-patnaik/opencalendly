import { describe, expect, it } from 'vitest';

import { SESSION_TTL_DAYS } from '../lib/auth';
import {
  API_SESSION_COOKIE_NAME,
  clearIssuedSessionCookie,
  hasSessionCookie,
  resolveSessionToken,
  withIssuedSessionCookie,
} from './auth-session';
import type { Bindings } from './types';

const testEnv = (overrides: Partial<Bindings> = {}): Bindings =>
  ({
    APP_BASE_URL: 'https://opencalendly.com',
    ...overrides,
  }) as Bindings;

describe('auth session request helpers', () => {
  it('prefers explicit bearer tokens when present', () => {
    const request = new Request('https://api.opencalendly.com/v0/auth/me', {
      headers: {
        Authorization: 'Bearer bearer-token',
        Cookie: `${API_SESSION_COOKIE_NAME}=cookie-token`,
      },
    });

    expect(resolveSessionToken(request)).toBe('bearer-token');
  });

  it('falls back to the session cookie when bearer auth is absent', () => {
    const request = new Request('https://api.opencalendly.com/v0/auth/me', {
      headers: {
        Cookie: `${API_SESSION_COOKIE_NAME}=cookie-token`,
      },
    });

    expect(resolveSessionToken(request)).toBe('cookie-token');
    expect(hasSessionCookie(request)).toBe(true);
  });
});

describe('auth session cookie responses', () => {
  it('sets an httpOnly session cookie on successful issue', () => {
    const now = new Date('2026-03-14T00:00:00.000Z');
    const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    const request = new Request('https://api.opencalendly.com/v0/auth/clerk/exchange');
    const response = withIssuedSessionCookie(new Response(null, { status: 200 }), {
      request,
      env: testEnv(),
      sessionToken: 'issued-session-token',
      expiresAt,
    });

    const cookie = response.headers.get('Set-Cookie');
    expect(cookie).toContain(`${API_SESSION_COOKIE_NAME}=issued-session-token`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
  });

  it('expires the session cookie during logout', () => {
    const request = new Request('http://localhost:8787/v0/auth/logout');
    const response = clearIssuedSessionCookie(new Response(null, { status: 200 }), {
      request,
      env: testEnv({ APP_BASE_URL: 'http://localhost:3000' }),
    });

    const cookie = response.headers.get('Set-Cookie');
    expect(cookie).toContain(`${API_SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    expect(cookie).not.toContain('Secure');
  });
});
