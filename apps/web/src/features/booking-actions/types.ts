export type BookingActionLookupResponse = {
  ok: boolean;
  actionType: 'cancel' | 'reschedule';
  booking: {
    id: string;
    status: 'confirmed' | 'canceled' | 'rescheduled';
    startsAt: string;
    endsAt: string;
    timezone: string;
    inviteeName: string;
    inviteeEmail: string;
    rescheduledTo: {
      id: string;
      startsAt: string;
      endsAt: string;
    } | null;
    team: {
      teamId: string;
      teamSlug: string | null;
      teamEventTypeId: string;
      mode: 'round_robin' | 'collective';
      assignmentUserIds: string[];
    } | null;
  };
  eventType: {
    slug: string;
    name: string;
    durationMinutes: number;
  };
  organizer: {
    username: string;
    displayName: string;
    timezone: string;
  };
  actions: {
    canCancel: boolean;
    canReschedule: boolean;
  };
  error?: string;
};

export type BookingActionApiError = {
  ok: false;
  error: string;
};

export type AvailabilityResponse = {
  ok: boolean;
  timezone: string;
  slots: Array<{
    startsAt: string;
    endsAt: string;
    assignmentUserIds?: string[];
  }>;
  error?: string;
};

export type CancelResponse = {
  ok: boolean;
  booking?: {
    id: string;
    status: 'canceled';
  };
  error?: string;
};

export type RescheduleResponse = {
  ok: boolean;
  oldBooking?: {
    id: string;
    status: 'rescheduled';
  };
  newBooking?: {
    id: string;
    status: 'confirmed';
    startsAt: string;
    endsAt: string;
  };
  error?: string;
};

export type ActionStatus = 'active' | 'invalid' | 'expired';
