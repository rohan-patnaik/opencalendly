export type DashboardUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  timezone: string;
};

export type AuthMeResponse = {
  ok: boolean;
  user: DashboardUser;
};

export type FunnelResponse = {
  ok: boolean;
  summary: {
    pageViews: number;
    slotSelections: number;
    bookingConfirmations: number;
    confirmed: number;
    canceled: number;
    rescheduled: number;
    conversionRate: number;
  };
  byEventType: Array<{
    eventTypeId: string;
    eventTypeName: string;
    pageViews: number;
    slotSelections: number;
    bookingConfirmations: number;
    confirmed: number;
    canceled: number;
    rescheduled: number;
  }>;
};

export type TeamResponse = {
  ok: boolean;
  roundRobinAssignments: Array<{
    teamEventTypeId: string;
    teamId: string;
    teamName: string;
    eventTypeId: string;
    eventTypeName: string;
    memberUserId: string;
    memberDisplayName: string;
    assignments: number;
  }>;
  collectiveBookings: Array<{
    teamEventTypeId: string;
    teamId: string;
    teamName: string;
    eventTypeId: string;
    eventTypeName: string;
    bookings: number;
  }>;
};

export type OperatorHealthResponse = {
  ok: boolean;
  status: 'ok' | 'degraded';
  alerts: string[];
  range: {
    startDate: string;
    endDate: string;
  };
  webhookDeliveries: {
    total: number;
    pending: number;
    succeeded: number;
    failed: number;
  };
  webhookQueue: {
    total: number;
    pending: number;
    succeeded: number;
    failed: number;
  };
  calendarWriteback: {
    total: number;
    pending: number;
    succeeded: number;
    failed: number;
  };
  calendarProviders: {
    totalConnected: number;
    disconnected: number;
    stale: number;
    errored: number;
    byProvider: Array<{
      provider: string;
      connected: boolean;
      externalEmail: string | null;
      lastSyncedAt: string | null;
      nextSyncAt: string | null;
      lastError: string | null;
      stale: boolean;
      status: 'ok' | 'degraded' | 'disconnected';
    }>;
  };
  emailDeliveries: {
    total: number;
    succeeded: number;
    failed: number;
    byType: Array<{
      emailType: string;
      total: number;
      succeeded: number;
      failed: number;
    }>;
  };
};
