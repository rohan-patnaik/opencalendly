import { describe, expect, it } from 'vitest';

import { isSessionExpired, type AuthSession } from './auth-session';

const buildSession = (expiresAt: string): AuthSession => ({
  sessionToken: 'session-token',
  expiresAt,
  user: {
    id: 'user-id',
    email: 'user@example.com',
    username: 'user',
    displayName: 'User',
    timezone: 'Asia/Kolkata',
  },
});

describe('isSessionExpired', () => {
  it('returns false for a future expiry', () => {
    const session = buildSession(new Date(Date.now() + 15 * 60 * 1000).toISOString());
    expect(isSessionExpired(session)).toBe(false);
  });

  it('returns true for a past expiry', () => {
    const session = buildSession(new Date(Date.now() - 15 * 60 * 1000).toISOString());
    expect(isSessionExpired(session)).toBe(true);
  });

  it('returns true for an invalid expiry timestamp', () => {
    const session = buildSession('invalid-timestamp');
    expect(isSessionExpired(session)).toBe(true);
  });
});
