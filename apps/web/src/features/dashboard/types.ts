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
  webhookDeliveries: {
    total: number;
    pending: number;
    succeeded: number;
    failed: number;
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
