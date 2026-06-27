import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as MicrosoftCalendar from '../lib/microsoft-calendar';
import type { Bindings } from '../server/types';

const {
  assertDemoFeatureAvailableMock,
  dbRef,
  exchangeMicrosoftOAuthCodeMock,
  fetchMicrosoftUserProfileMock,
  resolveAuthenticatedUserMock,
  withDatabaseMock,
} = vi.hoisted(() => ({
  assertDemoFeatureAvailableMock: vi.fn(),
  dbRef: { current: {} as unknown },
  exchangeMicrosoftOAuthCodeMock: vi.fn(),
  fetchMicrosoftUserProfileMock: vi.fn(),
  resolveAuthenticatedUserMock: vi.fn(),
  withDatabaseMock: vi.fn(async (_context: unknown, handler: (db: unknown) => Promise<Response>) =>
    handler(dbRef.current),
  ),
}));

vi.mock('../server/database', () => ({
  withDatabase: withDatabaseMock,
}));

vi.mock('../server/auth-session', () => ({
  resolveAuthenticatedUser: resolveAuthenticatedUserMock,
}));

vi.mock('../server/demo-quota', () => ({
  assertDemoFeatureAvailable: assertDemoFeatureAvailableMock,
  consumeDemoFeatureCredits: vi.fn(),
  jsonDemoQuotaError: vi.fn(),
}));

vi.mock('../lib/microsoft-calendar', async (importOriginal) => {
  const original = await importOriginal<typeof MicrosoftCalendar>();
  return {
    ...original,
    exchangeMicrosoftOAuthCode: exchangeMicrosoftOAuthCodeMock,
    fetchMicrosoftUserProfile: fetchMicrosoftUserProfileMock,
  };
});

import { createCalendarOAuthState } from '../lib/calendar-oauth-state';
import { registerMicrosoftCalendarConnectRoutes } from './calendar-microsoft-connect';

const SESSION_SECRET = '0123456789abcdef0123456789abcdef';
const REDIRECT_URI = 'https://opencalendly.com/settings/calendar/microsoft/callback';

const createBindings = (overrides: Partial<Bindings> = {}): Bindings =>
  ({
    APP_BASE_URL: 'https://opencalendly.com',
    MICROSOFT_CLIENT_ID: 'microsoft-client-id',
    MICROSOFT_CLIENT_SECRET: 'microsoft-client-secret',
    SESSION_SECRET,
    ...overrides,
  }) as Bindings;

const createState = (): string =>
  createCalendarOAuthState({
    userId: 'user_123',
    provider: 'microsoft',
    redirectUri: REDIRECT_URI,
    expiresAt: new Date(Date.now() + 10 * 60_000),
    secret: SESSION_SECRET,
  });

describe('POST /v0/calendar/microsoft/connect/complete', () => {
  beforeEach(() => {
    assertDemoFeatureAvailableMock.mockReset();
    exchangeMicrosoftOAuthCodeMock.mockReset();
    fetchMicrosoftUserProfileMock.mockReset();
    resolveAuthenticatedUserMock.mockReset();
    withDatabaseMock.mockClear();
    dbRef.current = {};
    resolveAuthenticatedUserMock.mockResolvedValue({
      id: 'user_123',
      email: 'owner@example.com',
    });
    assertDemoFeatureAvailableMock.mockResolvedValue(undefined);
  });

  it('rejects incomplete Microsoft OAuth grants before profile lookup or persistence', async () => {
    exchangeMicrosoftOAuthCodeMock.mockResolvedValue({
      access_token: 'access-token',
      expires_in: 3600,
      refresh_token: 'refresh-token',
      scope: 'User.Read Calendars.Read',
    });
    dbRef.current = {
      select: vi.fn(() => {
        throw new Error('db select should not run for incomplete Microsoft grants');
      }),
      transaction: vi.fn(() => {
        throw new Error('db transaction should not run for incomplete Microsoft grants');
      }),
    };

    const app = new Hono();
    registerMicrosoftCalendarConnectRoutes(app as never);

    const response = await app.request(
      'https://api.opencalendly.com/v0/calendar/microsoft/connect/complete',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'oauth-code-123',
          state: createState(),
          redirectUri: REDIRECT_URI,
        }),
      },
      createBindings(),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      ok: false,
      error:
        'Microsoft did not grant the required calendar permissions. Reconnect and approve profile access and calendar read/write access.',
    });
    expect(fetchMicrosoftUserProfileMock).not.toHaveBeenCalled();
    expect((dbRef.current as { select: ReturnType<typeof vi.fn> }).select).not.toHaveBeenCalled();
    expect((dbRef.current as { transaction: ReturnType<typeof vi.fn> }).transaction).not.toHaveBeenCalled();
  });
});
