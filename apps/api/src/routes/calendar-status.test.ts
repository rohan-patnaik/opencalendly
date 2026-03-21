import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Bindings } from '../server/types';

const {
  dbRef,
  resolveAuthenticatedUserMock,
  withDatabaseMock,
} = vi.hoisted(() => ({
  dbRef: { current: {} as unknown },
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

import { registerCalendarStatusRoutes } from './calendar-status';

const createBindings = (overrides: Partial<Bindings> = {}): Bindings =>
  ({
    APP_BASE_URL: 'https://opencalendly.com',
    SESSION_SECRET: '0123456789abcdef0123456789abcdef',
    ...overrides,
  }) as Bindings;

describe('GET /v0/calendar/sync/status', () => {
  beforeEach(() => {
    resolveAuthenticatedUserMock.mockReset();
    withDatabaseMock.mockClear();
    resolveAuthenticatedUserMock.mockResolvedValue({
      id: 'user_123',
      email: 'owner@example.com',
    });
  });

  it('returns only the providers configured on the runtime', async () => {
    dbRef.current = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: async () => [
              {
                id: 'conn_google',
                provider: 'google',
                externalEmail: 'owner@example.com',
                useForConflictChecks: true,
                useForWriteback: true,
                lastSyncedAt: null,
                nextSyncAt: null,
                lastError: null,
              },
            ],
          }),
        }),
      }),
    };

    const app = new Hono();
    registerCalendarStatusRoutes(app as never);

    const response = await app.request(
      'http://localhost/v0/calendar/sync/status',
      undefined,
      createBindings({
        GOOGLE_CLIENT_ID: 'google-client-id',
        GOOGLE_CLIENT_SECRET: 'google-client-secret',
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      availableProviders: ['google'],
      connections: [
        {
          id: 'conn_google',
          provider: 'google',
          connected: true,
          externalEmail: 'owner@example.com',
          useForConflictChecks: true,
          useForWriteback: true,
          lastSyncedAt: null,
          nextSyncAt: null,
          lastError: null,
        },
      ],
    });
  });

  it('returns no available providers when OAuth is not configured', async () => {
    dbRef.current = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: async () => [],
          }),
        }),
      }),
    };

    const app = new Hono();
    registerCalendarStatusRoutes(app as never);

    const response = await app.request(
      'http://localhost/v0/calendar/sync/status',
      undefined,
      createBindings(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      availableProviders: [],
      connections: [],
    });
  });
});
