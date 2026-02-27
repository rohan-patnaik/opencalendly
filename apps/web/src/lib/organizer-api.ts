import {
  authedGetJson,
  authedPatchJson,
  authedPostJson,
  authedPutJson,
} from './api-client';
import type { AuthSession } from './auth-session';

export type OrganizerEventQuestion = {
  id: string;
  label: string;
  required: boolean;
  placeholder?: string;
};

export type OrganizerEventType = {
  id: string;
  slug: string;
  name: string;
  durationMinutes: number;
  locationType: 'video' | 'phone' | 'in_person' | 'custom';
  locationValue: string | null;
  questions: OrganizerEventQuestion[];
  isActive: boolean;
  createdAt: string;
};

export type AvailabilityRule = {
  id: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  createdAt: string;
};

export type AvailabilityOverride = {
  id: string;
  startAt: string;
  endAt: string;
  isAvailable: boolean;
  reason: string | null;
  createdAt: string;
};

export type TeamSummary = {
  id: string;
  ownerUserId: string;
  slug: string;
  name: string;
  memberCount: number;
  teamEventTypeCount: number;
  createdAt: string;
};

export type TeamMemberRole = 'owner' | 'member';

export type TeamMember = {
  id: string;
  teamId: string;
  userId: string;
  role: TeamMemberRole;
  createdAt: string;
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    timezone: string;
  };
};

export type TeamEventTypeMember = {
  userId: string;
  isRequired: boolean;
  role: TeamMemberRole;
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    timezone: string;
  };
};

export type TeamEventType = {
  id: string;
  mode: 'round_robin' | 'collective';
  roundRobinCursor: number;
  createdAt: string;
  requiredMemberUserIds: string[];
  members: TeamEventTypeMember[];
  eventType: {
    id: string;
    slug: string;
    name: string;
    durationMinutes: number;
    locationType: 'video' | 'phone' | 'in_person' | 'custom';
    locationValue: string | null;
    questions: OrganizerEventQuestion[];
    isActive: boolean;
  };
};

export type OrganizerWebhook = {
  id: string;
  url: string;
  events: Array<'booking.created' | 'booking.canceled' | 'booking.rescheduled'>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CalendarProviderStatus = {
  provider: 'google' | 'microsoft';
  connected: boolean;
  externalEmail: string | null;
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
  lastError: string | null;
};

export type WritebackFailure = {
  id: string;
  bookingId: string;
  provider: string;
  operation: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastAttemptAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

const fallback = {
  eventTypesList: 'Unable to load event types.',
  eventTypeCreate: 'Unable to create event type.',
  eventTypeUpdate: 'Unable to update event type.',
  availabilityGet: 'Unable to load availability.',
  availabilityRulesPut: 'Unable to update availability rules.',
  availabilityOverridesPut: 'Unable to update availability overrides.',
  teamsList: 'Unable to load teams.',
  teamCreate: 'Unable to create team.',
  teamMembersList: 'Unable to load team members.',
  teamMemberCreate: 'Unable to add team member.',
  teamEventTypesList: 'Unable to load team event types.',
  teamEventTypeCreate: 'Unable to create team event type.',
  webhooksList: 'Unable to load webhooks.',
  webhookCreate: 'Unable to create webhook.',
  webhookPatch: 'Unable to update webhook.',
  webhookRun: 'Unable to run webhook deliveries.',
  calendarStatus: 'Unable to load calendar status.',
  calendarGoogleConnectStart: 'Unable to start Google calendar connection.',
  calendarGoogleConnectComplete: 'Unable to complete Google calendar connection.',
  calendarGoogleDisconnect: 'Unable to disconnect Google calendar.',
  calendarGoogleSync: 'Unable to sync Google calendar.',
  calendarMicrosoftConnectStart: 'Unable to start Microsoft calendar connection.',
  calendarMicrosoftConnectComplete: 'Unable to complete Microsoft calendar connection.',
  calendarMicrosoftDisconnect: 'Unable to disconnect Microsoft calendar.',
  calendarMicrosoftSync: 'Unable to sync Microsoft calendar.',
  writebackStatus: 'Unable to load writeback status.',
  writebackRun: 'Unable to run writeback queue.',
} as const;

export const organizerApi = {
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

  listTeams: async (apiBaseUrl: string, session: AuthSession | null) => {
    return authedGetJson<{ ok: true; teams: TeamSummary[] }>({
      url: `${apiBaseUrl}/v0/teams`,
      session,
      fallbackError: fallback.teamsList,
    });
  },

  createTeam: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    body: {
      name: string;
      slug: string;
    },
  ) => {
    return authedPostJson<{
      ok: true;
      team: {
        id: string;
        ownerUserId: string;
        name: string;
        slug: string;
      };
    }>({
      url: `${apiBaseUrl}/v0/teams`,
      session,
      body,
      fallbackError: fallback.teamCreate,
    });
  },

  listTeamMembers: async (apiBaseUrl: string, session: AuthSession | null, teamId: string) => {
    return authedGetJson<{ ok: true; members: TeamMember[] }>({
      url: `${apiBaseUrl}/v0/teams/${encodeURIComponent(teamId)}/members`,
      session,
      fallbackError: fallback.teamMembersList,
    });
  },

  addTeamMember: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    teamId: string,
    body: {
      userId: string;
      role: TeamMemberRole;
    },
  ) => {
    return authedPostJson<{ ok: true; member: TeamMember }>({
      url: `${apiBaseUrl}/v0/teams/${encodeURIComponent(teamId)}/members`,
      session,
      body,
      fallbackError: fallback.teamMemberCreate,
    });
  },

  listTeamEventTypes: async (apiBaseUrl: string, session: AuthSession | null, teamId: string) => {
    return authedGetJson<{
      ok: true;
      team: {
        id: string;
        ownerUserId: string;
        slug: string;
        name: string;
      };
      eventTypes: TeamEventType[];
    }>({
      url: `${apiBaseUrl}/v0/teams/${encodeURIComponent(teamId)}/event-types`,
      session,
      fallbackError: fallback.teamEventTypesList,
    });
  },

  createTeamEventType: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    body: {
      teamId: string;
      name: string;
      slug: string;
      durationMinutes: number;
      mode: 'round_robin' | 'collective';
      locationType?: 'video' | 'phone' | 'in_person' | 'custom';
      locationValue?: string | null;
      questions?: OrganizerEventQuestion[];
      requiredMemberUserIds?: string[];
    },
  ) => {
    return authedPostJson<{ ok: true; teamEventType: TeamEventType }>({
      url: `${apiBaseUrl}/v0/team-event-types`,
      session,
      body,
      fallbackError: fallback.teamEventTypeCreate,
    });
  },

  listWebhooks: async (apiBaseUrl: string, session: AuthSession | null) => {
    return authedGetJson<{ ok: true; webhooks: OrganizerWebhook[] }>({
      url: `${apiBaseUrl}/v0/webhooks`,
      session,
      fallbackError: fallback.webhooksList,
    });
  },

  createWebhook: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    body: {
      url: string;
      events: Array<'booking.created' | 'booking.canceled' | 'booking.rescheduled'>;
      secret: string;
    },
  ) => {
    return authedPostJson<{ ok: true; webhook: OrganizerWebhook }>({
      url: `${apiBaseUrl}/v0/webhooks`,
      session,
      body,
      fallbackError: fallback.webhookCreate,
    });
  },

  updateWebhook: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    webhookId: string,
    body: Partial<{
      url: string;
      events: Array<'booking.created' | 'booking.canceled' | 'booking.rescheduled'>;
      secret: string;
      isActive: boolean;
    }>,
  ) => {
    return authedPatchJson<{ ok: true; webhook: OrganizerWebhook }>({
      url: `${apiBaseUrl}/v0/webhooks/${encodeURIComponent(webhookId)}`,
      session,
      body,
      fallbackError: fallback.webhookPatch,
    });
  },

  runWebhookDeliveries: async (apiBaseUrl: string, session: AuthSession | null, limit?: number) => {
    return authedPostJson<{
      ok: true;
      processed: number;
      succeeded: number;
      retried: number;
      failed: number;
    }>({
      url: `${apiBaseUrl}/v0/webhooks/deliveries/run${limit ? `?limit=${encodeURIComponent(String(limit))}` : ''}`,
      session,
      body: {},
      fallbackError: fallback.webhookRun,
    });
  },

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
    return authedGetJson<{
      ok: true;
      summary: {
        pending: number;
        succeeded: number;
        failed: number;
      };
      failures: WritebackFailure[];
    }>({
      url: `${apiBaseUrl}/v0/calendar/writeback/status`,
      session,
      fallbackError: fallback.writebackStatus,
    });
  },

  runWritebackQueue: async (apiBaseUrl: string, session: AuthSession | null, limit?: number) => {
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
