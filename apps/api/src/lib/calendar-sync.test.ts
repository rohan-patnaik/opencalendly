import { describe, expect, it } from 'vitest';

import { decryptSecret, encryptSecret } from './calendar-crypto';
import {
  resolveGoogleAccessToken,
  resolveGoogleSyncRange,
  resolveMicrosoftAccessToken,
  syncGoogleBusyWindows,
  syncMicrosoftBusyWindows,
} from './calendar-sync';

describe('calendar-sync', () => {
  it('refreshes Google access token when expired', async () => {
    const now = new Date('2026-03-02T00:00:00.000Z');
    const encryptionSecret = 'calendar-sync-secret-for-tests';
    const connection = {
      accessTokenEncrypted: encryptSecret('stale-access-token', encryptionSecret),
      refreshTokenEncrypted: encryptSecret('refresh-token', encryptionSecret),
      accessTokenExpiresAt: new Date('2026-03-01T23:59:00.000Z'),
    };

    const result = await resolveGoogleAccessToken(
      {
        connection,
        encryptionSecret,
        clientId: 'google-client-id',
        clientSecret: 'google-client-secret',
        now,
      },
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'fresh-access-token',
            expires_in: 3600,
          }),
          { status: 200 },
        ),
    );

    expect(result.refreshed).toBe(true);
    expect(result.accessToken).toBe('fresh-access-token');
    expect(result.refreshToken).toBe('refresh-token');
    expect(result.accessTokenExpiresAt.toISOString()).toBe('2026-03-02T01:00:00.000Z');
  });

  it('returns existing access token when still valid', async () => {
    const now = new Date('2026-03-02T00:00:00.000Z');
    const encryptionSecret = 'calendar-sync-secret-for-tests';
    const connection = {
      accessTokenEncrypted: encryptSecret('active-access-token', encryptionSecret),
      refreshTokenEncrypted: encryptSecret('refresh-token', encryptionSecret),
      accessTokenExpiresAt: new Date('2026-03-02T02:00:00.000Z'),
    };

    const result = await resolveGoogleAccessToken({
      connection,
      encryptionSecret,
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      now,
    });

    expect(result.refreshed).toBe(false);
    expect(result.accessToken).toBe('active-access-token');
  });

  it('normalizes sync range and filters invalid busy windows', async () => {
    const now = new Date('2026-03-02T00:00:00.000Z');
    const range = resolveGoogleSyncRange(now, undefined, undefined);
    expect(range.startIso).toBe('2026-03-02T00:00:00.000Z');
    expect(range.endIso).toBe('2026-04-01T00:00:00.000Z');

    const futureRange = resolveGoogleSyncRange(now, '2026-05-10T00:00:00.000Z', undefined);
    expect(futureRange.startIso).toBe('2026-05-10T00:00:00.000Z');
    expect(futureRange.endIso).toBe('2026-06-09T00:00:00.000Z');

    const windows = await syncGoogleBusyWindows(
      {
        accessToken: 'token',
        startIso: '2026-03-02T00:00:00.000Z',
        endIso: '2026-03-03T00:00:00.000Z',
      },
      async () =>
        new Response(
          JSON.stringify({
            calendars: {
              primary: {
                busy: [
                  {
                    start: '2026-03-02T09:00:00.000Z',
                    end: '2026-03-02T09:30:00.000Z',
                  },
                  {
                    start: '2026-03-02T10:00:00.000Z',
                    end: '2026-03-02T10:00:00.000Z',
                  },
                  {
                    start: 'invalid',
                    end: 'also-invalid',
                  },
                ],
              },
            },
          }),
          { status: 200 },
        ),
    );

    expect(windows).toHaveLength(1);
    expect(windows[0]?.startsAt.toISOString()).toBe('2026-03-02T09:00:00.000Z');
  });

  it('decrypts refresh token from encrypted connection values', () => {
    const encryptionSecret = 'calendar-sync-secret-for-tests';
    const encrypted = encryptSecret('refresh-token', encryptionSecret);
    expect(decryptSecret(encrypted, encryptionSecret)).toBe('refresh-token');
  });

  it('refreshes Microsoft access token when expired', async () => {
    const now = new Date('2026-03-02T00:00:00.000Z');
    const encryptionSecret = 'calendar-sync-secret-for-tests';
    const connection = {
      accessTokenEncrypted: encryptSecret('stale-access-token', encryptionSecret),
      refreshTokenEncrypted: encryptSecret('refresh-token', encryptionSecret),
      accessTokenExpiresAt: new Date('2026-03-01T23:59:00.000Z'),
    };

    const result = await resolveMicrosoftAccessToken(
      {
        connection,
        encryptionSecret,
        clientId: 'microsoft-client-id',
        clientSecret: 'microsoft-client-secret',
        now,
      },
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'fresh-access-token',
            expires_in: 3600,
          }),
          { status: 200 },
        ),
    );

    expect(result.refreshed).toBe(true);
    expect(result.accessToken).toBe('fresh-access-token');
  });

  it('normalizes Microsoft busy windows and filters invalid entries', async () => {
    const windows = await syncMicrosoftBusyWindows(
      {
        accessToken: 'token',
        scheduleSmtp: 'demo@example.com',
        startIso: '2026-03-02T00:00:00.000Z',
        endIso: '2026-03-03T00:00:00.000Z',
      },
      async () =>
        new Response(
          JSON.stringify({
            value: [
              {
                scheduleItems: [
                  {
                    start: { dateTime: '2026-03-02T09:00:00', timeZone: 'UTC' },
                    end: { dateTime: '2026-03-02T09:30:00', timeZone: 'UTC' },
                  },
                  {
                    start: { dateTime: 'invalid', timeZone: 'UTC' },
                    end: { dateTime: '2026-03-02T11:00:00', timeZone: 'UTC' },
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
    );

    expect(windows).toHaveLength(1);
    expect(windows[0]?.startsAt.toISOString()).toBe('2026-03-02T09:00:00.000Z');
  });

  it('rejects Microsoft sync ranges that exceed provider limits', async () => {
    await expect(
      syncMicrosoftBusyWindows(
        {
          accessToken: 'token',
          scheduleSmtp: 'demo@example.com',
          startIso: '2026-03-02T00:00:00.000Z',
          endIso: '2026-05-10T00:00:00.000Z',
        },
        async () => new Response('{}', { status: 200 }),
      ),
    ).rejects.toThrow('Microsoft sync range must be less than 62 days.');
  });
});
