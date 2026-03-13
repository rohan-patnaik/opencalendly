import type { Hono } from 'hono';

import type { createDb } from '@opencalendly/db';
import type {
  EventQuestion,
  TeamSchedulingMode,
  WebhookEvent,
  WebhookEventType,
} from '@opencalendly/shared';

export type HyperdriveBinding = {
  connectionString: string;
};

export type Bindings = {
  HYPERDRIVE?: HyperdriveBinding;
  DATABASE_URL?: string;
  APP_BASE_URL?: string;
  SESSION_SECRET?: string;
  TELEMETRY_HMAC_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  DEMO_DAILY_ACCOUNT_LIMIT?: string;
  DEMO_DAILY_CREDIT_LIMIT?: string;
  DEMO_CREDIT_BYPASS_EMAILS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  CLERK_SECRET_KEY?: string;
  CLERK_ALLOWED_AUDIENCES?: string;
  ENABLE_DEV_AUTH_BOOTSTRAP?: string;
};

export type ContextLike = {
  env: Bindings;
  json: (body: unknown, status?: number) => Response;
};

export type ApiApp = Hono<{ Bindings: Bindings }>;
export type IdempotencyScope = 'booking_create' | 'team_booking_create' | 'booking_reschedule';
export type Database = ReturnType<typeof createDb>['db'];
export type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DemoQuotaDb = Database | DatabaseTransaction;
export type QueryableDb = Pick<Database, 'select'>;
export type AuthenticatedUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  timezone: string;
};
export type SessionUserRecord = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  timezone: string;
};
export type BookingActionType = 'cancel' | 'reschedule';
export type LockedActionToken = {
  id: string;
  bookingId: string;
  actionType: BookingActionType;
  expiresAt: Date;
  consumedAt: Date | null;
  consumedBookingId: string | null;
};
export type LockedBooking = {
  id: string;
  eventTypeId: string;
  organizerId: string;
  inviteeName: string;
  inviteeEmail: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  metadata: string | null;
};
export type OrganizerProfile = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  timezone: string;
};
export type EventTypeProfile = {
  id: string;
  userId: string;
  slug: string;
  name: string;
  durationMinutes: number;
  dailyBookingLimit: number | null;
  weeklyBookingLimit: number | null;
  monthlyBookingLimit: number | null;
  locationType: string;
  locationValue: string | null;
  questions?: EventQuestion[];
  organizerTimezone?: string;
  isActive: boolean;
};
export type DemoAdmissionsDailyRow = {
  dateKey: string;
  admittedCount: number;
  dailyLimit: number;
};
export type DemoAccountDailyUsageRow = {
  id: string;
  dateKey: string;
  userId: string;
  creditsLimit: number;
  creditsUsed: number;
  isBypass: boolean;
  admittedAt: Date;
  lastActivityAt: Date;
};
export type WebhookSubscriptionRecord = {
  id: string;
  userId: string;
  url: string;
  secret: string;
  events: WebhookEventType[];
  isActive: boolean;
};
export type PendingWebhookDelivery = {
  id: string;
  subscriptionId: string;
  url: string;
  secret: string;
  eventId: string;
  eventType: WebhookEventType;
  payload: WebhookEvent;
  attemptCount: number;
  maxAttempts: number;
};
export type { WebhookEvent, WebhookEventType };
export type { TeamSchedulingMode };
export type PublicEventView = {
  eventType: {
    id: string;
    slug: string;
    name: string;
    durationMinutes: number;
    dailyBookingLimit: number | null;
    weeklyBookingLimit: number | null;
    monthlyBookingLimit: number | null;
    locationType: string;
    locationValue: string | null;
    questions: EventQuestion[];
  };
  organizer: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    timezone: string;
  };
};
export type TeamRecord = {
  id: string;
  ownerUserId: string;
  slug: string;
  name: string;
};
export type TeamMemberRecord = {
  userId: string;
  role: 'owner' | 'member';
};
export type TeamEventTypeContext = {
  team: TeamRecord;
  eventType: EventTypeProfile;
  mode: TeamSchedulingMode;
  roundRobinCursor: number;
  members: TeamMemberRecord[];
};
export type TeamMemberScheduleRecord = {
  userId: string;
  timezone: string;
  rules: Array<{
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
  }>;
  overrides: Array<{
    startAt: Date;
    endAt: Date;
    isAvailable: boolean;
  }>;
  bookings: Array<{
    startsAt: Date;
    endsAt: Date;
    status: string;
    metadata: string | null;
  }>;
};
export type CalendarProvider = 'google' | 'microsoft';
export type CalendarConnectionStatus = {
  provider: CalendarProvider;
  connected: boolean;
  externalEmail: string | null;
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
  lastError: string | null;
};
export type CalendarWritebackOperation = 'create' | 'cancel' | 'reschedule';
export type EmailDeliveryType =
  | 'booking_confirmation'
  | 'booking_cancellation'
  | 'booking_rescheduled'
  | 'booking_reminder'
  | 'booking_follow_up';
export type ConnectionConfig =
  | { source: 'hyperdrive' | 'database_url'; connectionString: string }
  | null;

export class BookingActionNotFoundError extends Error {}
export class BookingActionGoneError extends Error {}
export class LaunchDemoAuthError extends Error {}
export class DemoQuotaAdmissionError extends Error {}
export class DemoQuotaCreditsError extends Error {}
