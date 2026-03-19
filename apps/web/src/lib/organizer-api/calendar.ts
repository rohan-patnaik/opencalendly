import { authedGetJson, authedPatchJson, authedPostJson } from '../api-client';
import type { AuthSession } from '../auth-session';
import { organizerApiFallback as fallback } from './fallback';
import type { CalendarConnectionStatus, WritebackStatus } from './types';

export const organizerCalendarApi = {
  getCalendarSyncStatus: async (apiBaseUrl: string, session: AuthSession | null) => {
    return authedGetJson<{ ok: true; availableProviders: Array<'google' | 'microsoft'>; connections: CalendarConnectionStatus[] }>({
      url: `${apiBaseUrl}/v0/calendar/sync/status`,
      session,
      fallbackError: fallback.calendarStatus,
    });
  },

  startGoogleConnect: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    body: {
      redirectUri: string;
    },
  ) => {
    return authedPostJson<{
      ok: true;
      provider: 'google';
      authUrl: string;
      state: string;
      expiresAt: string;
    }>({
      url: `${apiBaseUrl}/v0/calendar/google/connect/start`,
      session,
      body,
      fallbackError: fallback.calendarGoogleConnectStart,
    });
  },

  completeGoogleConnect: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    body: {
      code: string;
      state: string;
      redirectUri: string;
    },
  ) => {
    return authedPostJson<{
      ok: true;
      connection: CalendarConnectionStatus;
    }>({
      url: `${apiBaseUrl}/v0/calendar/google/connect/complete`,
      session,
      body,
      fallbackError: fallback.calendarGoogleConnectComplete,
    });
  },

  startMicrosoftConnect: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    body: {
      redirectUri: string;
    },
  ) => {
    return authedPostJson<{
      ok: true;
      provider: 'microsoft';
      authUrl: string;
      state: string;
      expiresAt: string;
    }>({
      url: `${apiBaseUrl}/v0/calendar/microsoft/connect/start`,
      session,
      body,
      fallbackError: fallback.calendarMicrosoftConnectStart,
    });
  },

  completeMicrosoftConnect: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    body: {
      code: string;
      state: string;
      redirectUri: string;
    },
  ) => {
    return authedPostJson<{
      ok: true;
      connection: CalendarConnectionStatus;
    }>({
      url: `${apiBaseUrl}/v0/calendar/microsoft/connect/complete`,
      session,
      body,
      fallbackError: fallback.calendarMicrosoftConnectComplete,
    });
  },

  disconnectConnection: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    connectionId: string,
  ) => {
    return authedPostJson<{
      ok: true;
      connectionId: string;
      disconnected: boolean;
    }>({
      url: `${apiBaseUrl}/v0/calendar/connections/${encodeURIComponent(connectionId)}/disconnect`,
      session,
      body: {},
      fallbackError: fallback.calendarConnectionDisconnect,
    });
  },

  syncConnection: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    connectionId: string,
    body?: {
      start?: string;
      end?: string;
    },
  ) => {
    return authedPostJson<{
      ok: true;
      provider: 'google' | 'microsoft';
      syncWindow: {
        startIso: string;
        endIso: string;
      };
      busyWindowCount: number;
      refreshedAccessToken: boolean;
      lastSyncedAt: string;
      nextSyncAt: string;
      connection: CalendarConnectionStatus;
    }>({
      url: `${apiBaseUrl}/v0/calendar/connections/${encodeURIComponent(connectionId)}/sync`,
      session,
      body,
      fallbackError: fallback.calendarConnectionSync,
    });
  },

  updateCalendarConnectionPreferences: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    connectionId: string,
    body: {
      useForConflictChecks?: boolean;
      useForWriteback?: boolean;
    },
  ) => {
    return authedPatchJson<{
      ok: true;
      connection: CalendarConnectionStatus;
    }>({
      url: `${apiBaseUrl}/v0/calendar/connections/${encodeURIComponent(connectionId)}/preferences`,
      session,
      body,
      fallbackError: fallback.calendarConnectionPreferences,
    });
  },

  getWritebackStatus: async (apiBaseUrl: string, session: AuthSession | null) => {
    return authedGetJson<{ ok: true } & WritebackStatus>({
      url: `${apiBaseUrl}/v0/calendar/writeback/status`,
      session,
      fallbackError: fallback.writebackStatus,
    });
  },

  runWritebackQueue: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    limit?: number,
  ) => {
    return authedPostJson<{
      ok: true;
      limit: number;
      processed: number;
      succeeded: number;
      retried: number;
      failed: number;
    }>({
      url: `${apiBaseUrl}/v0/calendar/writeback/run`,
      session,
      body: typeof limit === 'number' ? { limit } : {},
      fallbackError: fallback.writebackRun,
    });
  },
};
