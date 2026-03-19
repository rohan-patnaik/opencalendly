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
  dailyBookingLimit: number | null;
  weeklyBookingLimit: number | null;
  monthlyBookingLimit: number | null;
  locationType: 'video' | 'phone' | 'in_person' | 'custom';
  locationValue: string | null;
  questions: OrganizerEventQuestion[];
  isActive: boolean;
  createdAt: string;
};

export type NotificationRule = {
  id: string;
  notificationType: 'reminder' | 'follow_up';
  offsetMinutes: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
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

export type TimeOffBlock = {
  id: string;
  startAt: string;
  endAt: string;
  reason: string | null;
  source: string;
  sourceKey: string | null;
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
    dailyBookingLimit: number | null;
    weeklyBookingLimit: number | null;
    monthlyBookingLimit: number | null;
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

export type CalendarConnectionStatus = {
  id: string;
  provider: 'google' | 'microsoft';
  connected: boolean;
  externalEmail: string | null;
  useForConflictChecks: boolean;
  useForWriteback: boolean;
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

export type WritebackStatus = {
  summary: {
    pending: number;
    succeeded: number;
    failed: number;
  };
  failures: WritebackFailure[];
};
