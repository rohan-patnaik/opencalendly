import { describe, expect, it } from 'vitest';

import { createCalendarOAuthState, verifyCalendarOAuthState } from './calendar-oauth-state';

describe('calendar-oauth-state', () => {
  it('creates and verifies signed OAuth state payload', () => {
    const secret = 'oauth-state-secret-for-tests';
    const expiresAt = new Date('2026-03-02T00:10:00.000Z');
    const token = createCalendarOAuthState({
      userId: 'user-1',
      provider: 'google',
      redirectUri: 'http://localhost:3000/settings/calendar/google/callback',
      expiresAt,
      secret,
    });

    const verified = verifyCalendarOAuthState({
      token,
      secret,
      now: new Date('2026-03-02T00:00:00.000Z'),
    });

    expect(verified).toEqual({
      userId: 'user-1',
      provider: 'google',
      redirectUri: 'http://localhost:3000/settings/calendar/google/callback',
      exp: Math.floor(expiresAt.getTime() / 1000),
    });
  });

  it('rejects expired or tampered state', () => {
    const secret = 'oauth-state-secret-for-tests';
    const token = createCalendarOAuthState({
      userId: 'user-1',
      provider: 'google',
      redirectUri: 'http://localhost:3000/settings/calendar/google/callback',
      expiresAt: new Date('2026-03-02T00:00:00.000Z'),
      secret,
    });

    expect(
      verifyCalendarOAuthState({
        token,
        secret,
        now: new Date('2026-03-02T00:00:01.000Z'),
      }),
    ).toBeNull();

    expect(
      verifyCalendarOAuthState({
        token: `${token}x`,
        secret,
        now: new Date('2026-03-02T00:00:00.000Z'),
      }),
    ).toBeNull();
  });
});
