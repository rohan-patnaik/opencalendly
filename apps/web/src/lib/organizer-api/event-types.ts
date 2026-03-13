import { authedGetJson, authedPatchJson, authedPostJson, authedPutJson } from '../api-client';
import type { AuthSession } from '../auth-session';
import { organizerApiFallback as fallback } from './fallback';
import type { NotificationRule, OrganizerEventQuestion, OrganizerEventType } from './types';

export const organizerEventTypesApi = {
  listEventTypes: async (apiBaseUrl: string, session: AuthSession | null) => {
    return authedGetJson<{ ok: true; eventTypes: OrganizerEventType[] }>({
      url: `${apiBaseUrl}/v0/event-types`,
      session,
      fallbackError: fallback.eventTypesList,
    });
  },

  createEventType: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    body: {
      name: string;
      slug: string;
      durationMinutes: number;
      dailyBookingLimit?: number | null;
      weeklyBookingLimit?: number | null;
      monthlyBookingLimit?: number | null;
      locationType: 'video' | 'phone' | 'in_person' | 'custom';
      locationValue?: string | null;
      questions?: OrganizerEventQuestion[];
    },
  ) => {
    return authedPostJson<{ ok: true; eventType: OrganizerEventType }>({
      url: `${apiBaseUrl}/v0/event-types`,
      session,
      body,
      fallbackError: fallback.eventTypeCreate,
    });
  },

  updateEventType: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    eventTypeId: string,
    body: Partial<{
      name: string;
      slug: string;
      durationMinutes: number;
      dailyBookingLimit: number | null;
      weeklyBookingLimit: number | null;
      monthlyBookingLimit: number | null;
      locationType: 'video' | 'phone' | 'in_person' | 'custom';
      locationValue: string | null;
      questions: OrganizerEventQuestion[];
      isActive: boolean;
    }>,
  ) => {
    return authedPatchJson<{ ok: true; eventType: OrganizerEventType }>({
      url: `${apiBaseUrl}/v0/event-types/${encodeURIComponent(eventTypeId)}`,
      session,
      body,
      fallbackError: fallback.eventTypeUpdate,
    });
  },

  getNotificationRules: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    eventTypeId: string,
  ) => {
    return authedGetJson<{
      ok: true;
      eventTypeId: string;
      rules: NotificationRule[];
    }>({
      url: `${apiBaseUrl}/v0/event-types/${encodeURIComponent(eventTypeId)}/notification-rules`,
      session,
      fallbackError: fallback.notificationRulesGet,
    });
  },

  replaceNotificationRules: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    eventTypeId: string,
    rules: Array<{
      notificationType: 'reminder' | 'follow_up';
      offsetMinutes: number;
      isEnabled?: boolean;
    }>,
  ) => {
    return authedPutJson<{
      ok: true;
      eventTypeId: string;
      count: number;
      rules: NotificationRule[];
    }>({
      url: `${apiBaseUrl}/v0/event-types/${encodeURIComponent(eventTypeId)}/notification-rules`,
      session,
      body: { rules },
      fallbackError: fallback.notificationRulesPut,
    });
  },

  runNotificationWorkflows: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    limit?: number,
  ) => {
    return authedPostJson<{
      ok: true;
      limit: number;
      maxAttempts: number;
      processed: number;
      succeeded: number;
      failed: number;
      skipped: number;
    }>({
      url: `${apiBaseUrl}/v0/notifications/run${typeof limit === 'number' ? `?limit=${encodeURIComponent(String(limit))}` : ''}`,
      session,
      body: {},
      fallbackError: fallback.notificationsRun,
    });
  },
};
