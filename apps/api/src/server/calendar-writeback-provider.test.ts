import { describe, expect, it, vi } from 'vitest';

import { decryptSecret, encryptSecret } from '../lib/calendar-crypto';
import {
  createGoogleCalendarEvent,
  findGoogleCalendarEventByIdempotencyKey,
  refreshGoogleOAuthToken,
} from '../lib/google-calendar';
import { buildCalendarWritebackProviderClient } from './calendar-writeback-provider';
import { GOOGLE_CALENDAR_PROVIDER } from './env';
import type { Database } from './types';

type PersistedConnectionCredentials = {
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  accessTokenExpiresAt: Date;
  lastError: null;
  updatedAt: Date;
};

vi.mock('../lib/google-calendar', () => ({
  cancelGoogleCalendarEvent: vi.fn(async () => undefined),
  createGoogleCalendarEvent: vi.fn(async () => ({ externalEventId: 'provider-event-1' })),
  findGoogleCalendarEventByIdempotencyKey: vi.fn(async () => null),
  refreshGoogleOAuthToken: vi.fn(async () => ({
    access_token: 'fresh-access-token',
    expires_in: 3600,
    refresh_token: 'fresh-refresh-token',
  })),
  updateGoogleCalendarEvent: vi.fn(async () => undefined),
}));

const createDbMock = () => {
  const where = vi.fn();
  const set = vi.fn((value: PersistedConnectionCredentials) => {
    if (!value) {
      throw new Error('Expected persisted connection credentials.');
    }
    return { where };
  });
  const update = vi.fn(() => ({ set }));

  return {
    db: { update } as unknown as Database,
    set,
    update,
    where,
  };
};

describe('calendar-writeback-provider', () => {
  it('reuses refreshed tokens for later calls in the same provider client', async () => {
    const now = new Date('2026-03-10T08:00:00.000Z');
    const encryptionSecret = 'test-encryption-secret-with-enough-length';
    const dbMock = createDbMock();

    const providerClient = buildCalendarWritebackProviderClient({
      db: dbMock.db,
      now,
      provider: GOOGLE_CALENDAR_PROVIDER,
      timezone: 'UTC',
      connectionId: 'connection-1',
      connectionAccessTokenEncrypted: encryptSecret('stale-access-token', encryptionSecret),
      connectionRefreshTokenEncrypted: encryptSecret('stale-refresh-token', encryptionSecret),
      connectionAccessTokenExpiresAt: new Date('2026-03-10T07:59:00.000Z'),
      encryptionSecret,
      googleConfig: {
        clientId: 'google-client-id',
        clientSecret: 'google-client-secret',
      },
      microsoftConfig: null,
    });

    expect(providerClient.findEventByIdempotencyKey).toBeDefined();
    await providerClient.findEventByIdempotencyKey?.({ idempotencyKey: 'booking-1' });
    await providerClient.createEvent({
      eventName: 'Intro Call',
      inviteeName: 'Pat Lee',
      inviteeEmail: 'pat@example.com',
      startsAtIso: '2026-03-10T10:00:00.000Z',
      endsAtIso: '2026-03-10T10:30:00.000Z',
      timezone: 'UTC',
      locationType: 'video',
      locationValue: 'https://meet.example.com/intro',
      idempotencyKey: 'booking-1',
    });

    expect(refreshGoogleOAuthToken).toHaveBeenCalledTimes(1);
    expect(refreshGoogleOAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshToken: 'stale-refresh-token',
      }),
      expect.any(Function),
    );
    expect(findGoogleCalendarEventByIdempotencyKey).toHaveBeenCalledWith({
      accessToken: 'fresh-access-token',
      idempotencyKey: 'booking-1',
    });
    expect(createGoogleCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'fresh-access-token',
        idempotencyKey: 'booking-1',
      }),
    );

    expect(dbMock.update).toHaveBeenCalledTimes(1);
    expect(dbMock.set).toHaveBeenCalledTimes(1);
    const persistedCredentials = dbMock.set.mock.calls[0]?.[0];
    expect(persistedCredentials).toBeDefined();
    if (!persistedCredentials) {
      throw new Error('Expected refreshed credentials to be persisted.');
    }
    expect(persistedCredentials).toEqual(
      expect.objectContaining({
        accessTokenExpiresAt: new Date('2026-03-10T09:00:00.000Z'),
        lastError: null,
        updatedAt: now,
      }),
    );
    expect(
      decryptSecret(persistedCredentials.accessTokenEncrypted, encryptionSecret),
    ).toBe('fresh-access-token');
    expect(
      decryptSecret(persistedCredentials.refreshTokenEncrypted, encryptionSecret),
    ).toBe('fresh-refresh-token');
  });
});
