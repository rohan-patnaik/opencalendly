import { authedGetJson, authedPostJson } from '../api-client';
import type { AuthSession } from '../auth-session';
import { organizerApiFallback as fallback } from './fallback';
import type { CalendarProviderStatus, WritebackStatus } from './types';

export const organizerCalendarApi = {
  getCalendarSyncStatus: async (apiBaseUrl: string, session: AuthSession | null) => {
    return authedGetJson<{ ok: true; providers: CalendarProviderStatus[] }>({
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
      connection: CalendarProviderStatus;
    }>({
      url: `${apiBaseUrl}/v0/calendar/google/connect/complete`,
      session,
      body,
      fallbackError: fallback.calendarGoogleConnectComplete,
    });
  },

  disconnectGoogle: async (apiBaseUrl: string, session: AuthSession | null) => {
    return authedPostJson<{
      ok: true;
      provider: 'google';
      disconnected: boolean;
    }>({
      url: `${apiBaseUrl}/v0/calendar/google/disconnect`,
      session,
      body: {},
      fallbackError: fallback.calendarGoogleDisconnect,
    });
  },

  syncGoogle: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    body?: {
      start?: string;
      end?: string;
    },
  ) => {
    return authedPostJson<{
      ok: true;
      provider: 'google';
      syncWindow: {
        startIso: string;
        endIso: string;
      };
      busyWindowCount: number;
      refreshedAccessToken: boolean;
      lastSyncedAt: string;
      nextSyncAt: string;
    }>({
      url: `${apiBaseUrl}/v0/calendar/google/sync`,
      session,
      body,
      fallbackError: fallback.calendarGoogleSync,
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
      connection: CalendarProviderStatus;
    }>({
      url: `${apiBaseUrl}/v0/calendar/microsoft/connect/complete`,
      session,
      body,
      fallbackError: fallback.calendarMicrosoftConnectComplete,
    });
  },

  disconnectMicrosoft: async (apiBaseUrl: string, session: AuthSession | null) => {
    return authedPostJson<{
      ok: true;
      provider: 'microsoft';
      disconnected: boolean;
    }>({
      url: `${apiBaseUrl}/v0/calendar/microsoft/disconnect`,
      session,
      body: {},
      fallbackError: fallback.calendarMicrosoftDisconnect,
    });
  },

  syncMicrosoft: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    body?: {
      start?: string;
      end?: string;
    },
  ) => {
    return authedPostJson<{
      ok: true;
      provider: 'microsoft';
      syncWindow: {
        startIso: string;
        endIso: string;
      };
      busyWindowCount: number;
      refreshedAccessToken: boolean;
      lastSyncedAt: string;
      nextSyncAt: string;
    }>({
      url: `${apiBaseUrl}/v0/calendar/microsoft/sync`,
      session,
      body,
      fallbackError: fallback.calendarMicrosoftSync,
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
