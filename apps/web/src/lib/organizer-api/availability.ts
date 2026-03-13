import { authedDeleteJson, authedGetJson, authedPostJson, authedPutJson } from '../api-client';
import type { AuthSession } from '../auth-session';
import { organizerApiFallback as fallback } from './fallback';
import type { AvailabilityOverride, AvailabilityRule, TimeOffBlock } from './types';

export const organizerAvailabilityApi = {
  getAvailability: async (apiBaseUrl: string, session: AuthSession | null) => {
    return authedGetJson<{
      ok: true;
      rules: AvailabilityRule[];
      overrides: AvailabilityOverride[];
    }>({
      url: `${apiBaseUrl}/v0/me/availability`,
      session,
      fallbackError: fallback.availabilityGet,
    });
  },

  replaceAvailabilityRules: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    rules: Array<{
      dayOfWeek: number;
      startMinute: number;
      endMinute: number;
      bufferBeforeMinutes: number;
      bufferAfterMinutes: number;
    }>,
  ) => {
    return authedPutJson<{ ok: true; count: number }>({
      url: `${apiBaseUrl}/v0/me/availability/rules`,
      session,
      body: { rules },
      fallbackError: fallback.availabilityRulesPut,
    });
  },

  replaceAvailabilityOverrides: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    overrides: Array<{
      startAt: string;
      endAt: string;
      isAvailable: boolean;
      reason?: string | null;
    }>,
  ) => {
    return authedPutJson<{ ok: true; count: number }>({
      url: `${apiBaseUrl}/v0/me/availability/overrides`,
      session,
      body: { overrides },
      fallbackError: fallback.availabilityOverridesPut,
    });
  },

  listTimeOffBlocks: async (apiBaseUrl: string, session: AuthSession | null) => {
    return authedGetJson<{ ok: true; timeOffBlocks: TimeOffBlock[] }>({
      url: `${apiBaseUrl}/v0/me/time-off`,
      session,
      fallbackError: fallback.timeOffList,
    });
  },

  createTimeOffBlock: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    body: {
      startAt: string;
      endAt: string;
      reason?: string | null;
    },
  ) => {
    return authedPostJson<{ ok: true; timeOffBlock: TimeOffBlock }>({
      url: `${apiBaseUrl}/v0/me/time-off`,
      session,
      body,
      fallbackError: fallback.timeOffCreate,
    });
  },

  deleteTimeOffBlock: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    timeOffId: string,
  ) => {
    return authedDeleteJson<{ ok: true; deletedId: string }>({
      url: `${apiBaseUrl}/v0/me/time-off/${encodeURIComponent(timeOffId)}`,
      session,
      fallbackError: fallback.timeOffDelete,
    });
  },

  importHolidayTimeOffBlocks: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    body: {
      locale: 'IN' | 'US';
      year: number;
    },
  ) => {
    return authedPostJson<{ ok: true; imported: number; skipped: number }>({
      url: `${apiBaseUrl}/v0/me/time-off/import-holidays`,
      session,
      body,
      fallbackError: fallback.timeOffHolidayImport,
    });
  },
};
