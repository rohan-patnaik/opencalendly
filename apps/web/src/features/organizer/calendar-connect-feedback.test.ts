import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CalendarConnectionStatus } from '../../lib/organizer-api';
import {
  buildCalendarConnectSuccessMessage,
  consumeRecentCalendarConnection,
  isRecentCalendarConnection,
  rememberRecentCalendarConnection,
} from './calendar-connect-feedback';

const googleStatus: CalendarConnectionStatus = {
  id: 'conn_google',
  provider: 'google',
  connected: true,
  externalEmail: 'owner@example.com',
  useForConflictChecks: true,
  useForWriteback: false,
  lastSyncedAt: null,
  nextSyncAt: null,
  lastError: null,
};

describe('calendar connect feedback', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
        clear: () => {
          storage.clear();
        },
      },
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores and consumes recent calendar connection feedback once', () => {
    rememberRecentCalendarConnection({
      provider: 'google',
      email: 'owner@example.com',
    });

    expect(consumeRecentCalendarConnection()).toEqual({
      provider: 'google',
      email: 'owner@example.com',
    });
    expect(consumeRecentCalendarConnection()).toBeNull();
  });

  it('builds a provider-specific success message', () => {
    expect(
      buildCalendarConnectSuccessMessage({
        provider: 'microsoft',
        email: 'owner@outlook.com',
      }),
    ).toBe(
      'Microsoft Calendar connected for owner@outlook.com. Review sync and writeback settings below.',
    );
  });

  it('matches the newly connected card by provider and email', () => {
    expect(
      isRecentCalendarConnection(googleStatus, {
        provider: 'google',
        email: 'owner@example.com',
      }),
    ).toBe(true);

    expect(
      isRecentCalendarConnection(googleStatus, {
        provider: 'google',
        email: 'other@example.com',
      }),
    ).toBe(false);
  });
});
