export type BookingQuestion = {
  id: string;
  label: string;
  required: boolean;
  placeholder?: string;
};

export type PublicBookingActionLinks = {
  cancel?: {
    pageUrl: string;
  };
  reschedule?: {
    pageUrl: string;
  };
};

export type PublicBookingEmailDelivery = {
  sent: boolean;
  provider: string;
  error?: string;
};

export type PublicEventResponse = {
  ok: boolean;
  eventType: {
    name: string;
    slug: string;
    durationMinutes: number;
    locationType: string;
    locationValue: string | null;
    questions: BookingQuestion[];
  };
  organizer: {
    username: string;
    displayName: string;
    timezone: string;
  };
  error?: string;
};

export type PublicAvailabilitySlot = {
  startsAt: string;
  endsAt: string;
};

export type PublicAvailabilityResponse = {
  ok: boolean;
  timezone: string;
  slots: PublicAvailabilitySlot[];
  error?: string;
};

export type PublicBookingResponse = {
  ok: boolean;
  booking?: {
    id: string;
    startsAt: string;
    endsAt: string;
  };
  actions?: PublicBookingActionLinks;
  email?: PublicBookingEmailDelivery;
  error?: string;
};

export type TeamEventMember = {
  userId: string;
  role: 'owner' | 'member';
  user: {
    id: string;
    username: string;
    displayName: string;
    timezone: string;
  } | null;
};

export type TeamEventResponse = {
  ok: boolean;
  team: {
    id: string;
    slug: string;
    name: string;
  };
  eventType: {
    id: string;
    slug: string;
    name: string;
    durationMinutes: number;
    locationType: string;
    locationValue: string | null;
    questions: BookingQuestion[];
  };
  mode: 'round_robin' | 'collective';
  members: TeamEventMember[];
  error?: string;
};

export type TeamAvailabilitySlot = {
  startsAt: string;
  endsAt: string;
  assignmentUserIds: string[];
};

export type TeamAvailabilityResponse = {
  ok: boolean;
  mode: 'round_robin' | 'collective';
  timezone: string;
  slots: TeamAvailabilitySlot[];
  error?: string;
};

export type TeamBookingResponse = {
  ok: boolean;
  booking?: {
    id: string;
    startsAt: string;
    endsAt: string;
    assignmentUserIds: string[];
    teamMode: 'round_robin' | 'collective';
  };
  actions?: PublicBookingActionLinks;
  email?: PublicBookingEmailDelivery;
  error?: string;
};

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

export type BookingActionAvailabilityResponse = {
  ok: boolean;
  timezone: string;
  slots: Array<
    PublicAvailabilitySlot & {
      assignmentUserIds?: string[];
    }
  >;
  error?: string;
};

export type BookingCancelResponse = {
  ok: boolean;
  booking?: {
    id: string;
    status: 'canceled';
  };
  error?: string;
};

export type BookingRescheduleResponse = {
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
