import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { Hono } from 'hono';

import {
  analyticsFunnelEvents,
  availabilityOverrides,
  availabilityRules,
  bookingExternalEvents,
  bookingActionTokens,
  bookings,
  calendarBusyWindows,
  calendarConnections,
  createDb,
  demoCreditsDaily,
  emailDeliveries,
  eventTypes,
  idempotencyRequests,
  sessions,
  teamBookingAssignments,
  teamEventTypeMembers,
  teamEventTypes,
  teamMembers,
  teams,
  users,
  waitlistEntries,
  webhookDeliveries,
  webhookSubscriptions,
} from '@opencalendly/db';
import {
  analyticsRangeQuerySchema,
  analyticsTrackFunnelEventSchema,
  availabilityQuerySchema,
  bookingActionTokenSchema,
  bookingCancelSchema,
  calendarConnectCompleteSchema,
  calendarConnectStartSchema,
  calendarSyncRequestSchema,
  calendarWritebackRunSchema,
  bookingCreateSchema,
  bookingRescheduleSchema,
  demoCreditsConsumeSchema,
  eventQuestionsSchema,
  eventTypeCreateSchema,
  eventTypeUpdateSchema,
  healthCheckSchema,
  magicLinkRequestSchema,
  setAvailabilityOverridesSchema,
  setAvailabilityRulesSchema,
  teamAddMemberSchema,
  teamBookingCreateSchema,
  teamCreateSchema,
  teamEventTypeCreateSchema,
  waitlistJoinSchema,
  webhookEventSchema,
  webhookSubscriptionCreateSchema,
  webhookSubscriptionUpdateSchema,
  verifyMagicLinkRequestSchema,
  type EventQuestion,
  type TeamSchedulingMode,
  type WebhookEvent,
  type WebhookEventType,
} from '@opencalendly/shared';

import {
  MAGIC_LINK_TTL_MINUTES,
  SESSION_TTL_DAYS,
  createRawToken,
  getBearerToken,
  hmacToken,
  hashToken,
} from './lib/auth';
import { computeAvailabilitySlots } from './lib/availability';
import { encryptSecret } from './lib/calendar-crypto';
import { createCalendarOAuthState, verifyCalendarOAuthState } from './lib/calendar-oauth-state';
import {
  resolveGoogleAccessToken,
  resolveGoogleSyncRange,
  resolveMicrosoftAccessToken,
  syncGoogleBusyWindows,
  syncMicrosoftBusyWindows,
} from './lib/calendar-sync';
import { processCalendarWriteback } from './lib/calendar-writeback';
import {
  evaluateBookingActionToken,
  parseBookingMetadata,
  resolveRequestedRescheduleSlot,
} from './lib/booking-actions';
import {
  BookingConflictError,
  BookingNotFoundError,
  BookingUniqueConstraintError,
  BookingValidationError,
  commitBooking,
  createBookingActionTokenSet,
  type PublicEventType,
} from './lib/booking';
import {
  sendBookingCancellationEmail,
  sendBookingConfirmationEmail,
  sendBookingRescheduledEmail,
} from './lib/email';
import {
  buildGoogleAuthorizationUrl,
  cancelGoogleCalendarEvent,
  createGoogleCalendarEvent,
  exchangeGoogleOAuthCode,
  findGoogleCalendarEventByIdempotencyKey,
  fetchGoogleUserProfile,
  updateGoogleCalendarEvent,
} from './lib/google-calendar';
import {
  buildMicrosoftAuthorizationUrl,
  cancelMicrosoftCalendarEvent,
  createMicrosoftCalendarEvent,
  exchangeMicrosoftOAuthCode,
  findMicrosoftCalendarEventByIdempotencyKey,
  fetchMicrosoftUserProfile,
  updateMicrosoftCalendarEvent,
} from './lib/microsoft-calendar';
import {
  buildDemoCreditsStatus,
  consumeDemoCreditFromState,
  parseDemoDailyPassLimit,
  toUtcDateKey,
} from './lib/demo-credits';
import {
  WEBHOOK_DEFAULT_MAX_ATTEMPTS,
  buildWebhookEvent,
  buildWebhookSignatureHeader,
  computeNextWebhookAttemptAt,
  isWebhookDeliveryExhausted,
  normalizeWebhookEvents,
  parseWebhookEventTypes,
} from './lib/webhooks';
import {
  chooseRoundRobinAssignee,
  computeTeamAvailabilitySlots,
  computeTeamSlotMatrix,
} from './lib/team-scheduling';
import {
  resolveAnalyticsRange,
  summarizeFunnelAnalytics,
  summarizeOperatorHealth,
  summarizeTeamAnalytics,
  type AnalyticsFunnelStage,
} from './lib/analytics';

type HyperdriveBinding = {
  connectionString: string;
};

type Bindings = {
  HYPERDRIVE?: HyperdriveBinding;
  DATABASE_URL?: string;
  APP_BASE_URL?: string;
  SESSION_SECRET?: string;
  TELEMETRY_HMAC_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  DEMO_DAILY_PASS_LIMIT?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
};

type ContextLike = {
  env: Bindings;
  json: (body: unknown, status?: number) => Response;
};

type IdempotencyScope = 'booking_create' | 'team_booking_create' | 'booking_reschedule';

type Database = ReturnType<typeof createDb>['db'];
type QueryableDb = Pick<Database, 'select'>;

type AuthenticatedUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  timezone: string;
};

type BookingActionType = 'cancel' | 'reschedule';

type LockedActionToken = {
  id: string;
  bookingId: string;
  actionType: BookingActionType;
  expiresAt: Date;
  consumedAt: Date | null;
  consumedBookingId: string | null;
};

type LockedBooking = {
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

type OrganizerProfile = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  timezone: string;
};

type EventTypeProfile = {
  id: string;
  userId: string;
  slug: string;
  name: string;
  durationMinutes: number;
  locationType: string;
  locationValue: string | null;
  isActive: boolean;
};

type DemoCreditsDailyRow = {
  dateKey: string;
  used: number;
  dailyLimit: number;
};

type WebhookSubscriptionRecord = {
  id: string;
  userId: string;
  url: string;
  secret: string;
  events: WebhookEventType[];
  isActive: boolean;
};

type PendingWebhookDelivery = {
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

type PublicEventView = {
  eventType: {
    id: string;
    slug: string;
    name: string;
    durationMinutes: number;
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

type TeamRecord = {
  id: string;
  ownerUserId: string;
  slug: string;
  name: string;
};

type TeamMemberRecord = {
  userId: string;
  role: 'owner' | 'member';
};

type TeamEventTypeContext = {
  team: TeamRecord;
  eventType: EventTypeProfile;
  mode: TeamSchedulingMode;
  roundRobinCursor: number;
  members: TeamMemberRecord[];
};

type TeamMemberScheduleRecord = {
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

type CalendarProvider = 'google' | 'microsoft';
type CalendarConnectionStatus = {
  provider: CalendarProvider;
  connected: boolean;
  externalEmail: string | null;
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
  lastError: string | null;
};

type CalendarWritebackOperation = 'create' | 'cancel' | 'reschedule';
type EmailDeliveryType = 'booking_confirmation' | 'booking_cancellation' | 'booking_rescheduled';

const app = new Hono<{ Bindings: Bindings }>();

class BookingActionNotFoundError extends Error {}
class BookingActionGoneError extends Error {}

type ConnectionConfig =
  | {
      source: 'hyperdrive' | 'database_url';
      connectionString: string;
    }
  | null;

const NEON_HOST_PATTERN = /\.neon\.tech(?::\d+)?(?:\/|$)/i;

const isNeonDatabaseUrl = (connectionString: string): boolean => {
  return NEON_HOST_PATTERN.test(connectionString);
};

const resolveConnectionString = (env: Bindings): ConnectionConfig => {
  if (env.HYPERDRIVE?.connectionString) {
    return {
      source: 'hyperdrive',
      connectionString: env.HYPERDRIVE.connectionString,
    };
  }

  const databaseUrl = env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return {
      source: 'database_url',
      connectionString: databaseUrl,
    };
  }

  return null;
};

const jsonError = (context: ContextLike, status: number, error: string): Response => {
  return context.json({ ok: false, error }, status);
};

const normalizeTimezone = (timezone: string | undefined): string => {
  if (!timezone) {
    return 'UTC';
  }
  const parsed = DateTime.now().setZone(timezone);
  return parsed.isValid ? timezone : 'UTC';
};

const MIN_CALENDAR_SECRET_LENGTH = 32;

const resolveCalendarEncryptionSecret = (env: Bindings): string | null => {
  const secret = env.SESSION_SECRET?.trim();
  if (!secret || secret.length < MIN_CALENDAR_SECRET_LENGTH) {
    return null;
  }
  return secret;
};

const resolveTelemetryHmacKey = (env: Bindings): string | null => {
  const telemetryHmacKey = env.TELEMETRY_HMAC_KEY?.trim();
  if (!telemetryHmacKey || telemetryHmacKey.length < MIN_CALENDAR_SECRET_LENGTH) {
    return null;
  }
  return telemetryHmacKey;
};

const resolveGoogleOAuthConfig = (
  env: Bindings,
): { clientId: string; clientSecret: string } | null => {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return null;
  }
  return { clientId, clientSecret };
};

const resolveMicrosoftOAuthConfig = (
  env: Bindings,
): { clientId: string; clientSecret: string } | null => {
  const clientId = env.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = env.MICROSOFT_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return null;
  }
  return { clientId, clientSecret };
};

const toCalendarConnectionStatus = (input: {
  provider: CalendarProvider;
  externalEmail: string | null;
  lastSyncedAt: Date | null;
  nextSyncAt: Date | null;
  lastError: string | null;
}): CalendarConnectionStatus => {
  return {
    provider: input.provider,
    connected: true,
    externalEmail: input.externalEmail,
    lastSyncedAt: input.lastSyncedAt ? input.lastSyncedAt.toISOString() : null,
    nextSyncAt: input.nextSyncAt ? input.nextSyncAt.toISOString() : null,
    lastError: input.lastError,
  };
};

const WEBHOOK_DELIVERY_BATCH_LIMIT_DEFAULT = 25;
const WEBHOOK_DELIVERY_BATCH_LIMIT_MAX = 100;
const CALENDAR_OAUTH_STATE_TTL_MINUTES = 10;
const CALENDAR_SYNC_NEXT_MINUTES = 15;
const GOOGLE_CALENDAR_PROVIDER: CalendarProvider = 'google';
const MICROSOFT_CALENDAR_PROVIDER: CalendarProvider = 'microsoft';
const CALENDAR_WRITEBACK_DEFAULT_MAX_ATTEMPTS = 5;
const CALENDAR_WRITEBACK_BATCH_LIMIT_DEFAULT = 25;
const CALENDAR_WRITEBACK_BATCH_LIMIT_MAX = 100;
const CALENDAR_WRITEBACK_LEASE_MINUTES = 3;
const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
const IDEMPOTENCY_KEY_MIN_LENGTH = 16;
const IDEMPOTENCY_KEY_MAX_LENGTH = 200;
const IDEMPOTENCY_IN_PROGRESS_TTL_MINUTES = 10;
const IDEMPOTENCY_COMPLETED_TTL_HOURS = 24;
const PUBLIC_ANALYTICS_RATE_LIMIT_WINDOW_MS = 60_000;
const PUBLIC_ANALYTICS_RATE_LIMIT_MAX_REQUESTS_PER_SCOPE = 120;
const PUBLIC_ANALYTICS_RATE_LIMIT_MAX_REQUESTS_PER_IP = 300;
const PUBLIC_ANALYTICS_RATE_LIMIT_MAX_KEYS = 5_000;
const PUBLIC_ANALYTICS_RATE_LIMIT_CLEANUP_INTERVAL = 50;
const PUBLIC_BOOKING_RATE_LIMIT_WINDOW_MS = 60_000;
const PUBLIC_BOOKING_RATE_LIMIT_MAX_AVAILABILITY_REQUESTS_PER_SCOPE = 120;
const PUBLIC_BOOKING_RATE_LIMIT_MAX_BOOKING_REQUESTS_PER_SCOPE = 30;
const PUBLIC_BOOKING_RATE_LIMIT_MAX_REQUESTS_PER_IP = 180;
const PUBLIC_BOOKING_RATE_LIMIT_MAX_KEYS = 8_000;
const PUBLIC_BOOKING_RATE_LIMIT_CLEANUP_INTERVAL = 50;
const publicAnalyticsRateLimitState = new Map<string, { windowStartMs: number; count: number }>();
let publicAnalyticsRateLimitRequestCounter = 0;
const publicBookingRateLimitState = new Map<string, { windowStartMs: number; count: number }>();
let publicBookingRateLimitRequestCounter = 0;

const toCalendarProvider = (value: string): CalendarProvider | null => {
  if (value === 'google' || value === 'microsoft') {
    return value;
  }
  return null;
};

const clampWebhookDeliveryBatchLimit = (rawLimit: string | undefined): number => {
  const parsed = rawLimit ? Number.parseInt(rawLimit, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return WEBHOOK_DELIVERY_BATCH_LIMIT_DEFAULT;
  }

  return Math.max(1, Math.min(WEBHOOK_DELIVERY_BATCH_LIMIT_MAX, parsed));
};

const clampCalendarWritebackBatchLimit = (rawLimit: number | string | undefined): number => {
  const parsed =
    typeof rawLimit === 'number'
      ? rawLimit
      : rawLimit
        ? Number.parseInt(rawLimit, 10)
        : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return CALENDAR_WRITEBACK_BATCH_LIMIT_DEFAULT;
  }
  return Math.max(1, Math.min(CALENDAR_WRITEBACK_BATCH_LIMIT_MAX, parsed));
};

const resolveClientIp = (request: Request): string => {
  const cloudflareIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cloudflareIp) {
    return cloudflareIp;
  }
  return 'unknown';
};

const isPublicAnalyticsRateLimited = (input: {
  ip: string;
  username: string;
  eventSlug: string;
  nowMs?: number;
}): boolean => {
  const nowMs = input.nowMs ?? Date.now();
  const cutoffMs = nowMs - PUBLIC_ANALYTICS_RATE_LIMIT_WINDOW_MS;

  const pruneRateLimitState = () => {
    const shouldCleanup =
      publicAnalyticsRateLimitState.size > PUBLIC_ANALYTICS_RATE_LIMIT_MAX_KEYS ||
      publicAnalyticsRateLimitRequestCounter % PUBLIC_ANALYTICS_RATE_LIMIT_CLEANUP_INTERVAL === 0;
    if (!shouldCleanup) {
      return;
    }

    for (const [key, state] of publicAnalyticsRateLimitState) {
      if (state.windowStartMs < cutoffMs) {
        publicAnalyticsRateLimitState.delete(key);
      }
    }

    if (publicAnalyticsRateLimitState.size > PUBLIC_ANALYTICS_RATE_LIMIT_MAX_KEYS) {
      const overflow = publicAnalyticsRateLimitState.size - PUBLIC_ANALYTICS_RATE_LIMIT_MAX_KEYS;
      let removed = 0;
      for (const key of publicAnalyticsRateLimitState.keys()) {
        publicAnalyticsRateLimitState.delete(key);
        removed += 1;
        if (removed >= overflow) {
          break;
        }
      }
    }
  };

  const consumeRateLimitKey = (key: string, maxRequests: number): boolean => {
    const existing = publicAnalyticsRateLimitState.get(key);
    if (!existing || existing.windowStartMs < cutoffMs) {
      publicAnalyticsRateLimitState.set(key, {
        windowStartMs: nowMs,
        count: 1,
      });
      return false;
    }

    if (existing.count >= maxRequests) {
      return true;
    }

    existing.count += 1;
    return false;
  };

  publicAnalyticsRateLimitRequestCounter += 1;
  pruneRateLimitState();

  const ipKey = `ip:${input.ip}`;
  if (consumeRateLimitKey(ipKey, PUBLIC_ANALYTICS_RATE_LIMIT_MAX_REQUESTS_PER_IP)) {
    return true;
  }

  const scopedKey = `scope:${input.ip}|${input.username}|${input.eventSlug}`;
  return consumeRateLimitKey(scopedKey, PUBLIC_ANALYTICS_RATE_LIMIT_MAX_REQUESTS_PER_SCOPE);
};

const isPublicBookingRateLimited = (input: {
  ip: string;
  scope: string;
  perScopeLimit: number;
  nowMs?: number;
}): boolean => {
  const nowMs = input.nowMs ?? Date.now();
  const cutoffMs = nowMs - PUBLIC_BOOKING_RATE_LIMIT_WINDOW_MS;

  const shouldCleanup =
    publicBookingRateLimitState.size > PUBLIC_BOOKING_RATE_LIMIT_MAX_KEYS ||
    publicBookingRateLimitRequestCounter % PUBLIC_BOOKING_RATE_LIMIT_CLEANUP_INTERVAL === 0;
  if (shouldCleanup) {
    for (const [key, state] of publicBookingRateLimitState) {
      if (state.windowStartMs < cutoffMs) {
        publicBookingRateLimitState.delete(key);
      }
    }

    if (publicBookingRateLimitState.size > PUBLIC_BOOKING_RATE_LIMIT_MAX_KEYS) {
      const overflow = publicBookingRateLimitState.size - PUBLIC_BOOKING_RATE_LIMIT_MAX_KEYS;
      let removed = 0;
      for (const key of publicBookingRateLimitState.keys()) {
        publicBookingRateLimitState.delete(key);
        removed += 1;
        if (removed >= overflow) {
          break;
        }
      }
    }
  }

  const consumeRateLimitKey = (key: string, maxRequests: number): boolean => {
    const existing = publicBookingRateLimitState.get(key);
    if (!existing || existing.windowStartMs < cutoffMs) {
      publicBookingRateLimitState.set(key, {
        windowStartMs: nowMs,
        count: 1,
      });
      return false;
    }

    if (existing.count >= maxRequests) {
      return true;
    }

    existing.count += 1;
    return false;
  };

  publicBookingRateLimitRequestCounter += 1;

  const ipKey = `ip:${input.ip}`;
  if (consumeRateLimitKey(ipKey, PUBLIC_BOOKING_RATE_LIMIT_MAX_REQUESTS_PER_IP)) {
    return true;
  }

  const scopedKey = `scope:${input.ip}|${input.scope}`;
  return consumeRateLimitKey(scopedKey, input.perScopeLimit);
};

const parseIdempotencyKey = (request: Request): { key: string } | { error: string } => {
  const rawKey = request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim();
  if (!rawKey) {
    return { error: `${IDEMPOTENCY_KEY_HEADER} header is required.` };
  }
  if (rawKey.length < IDEMPOTENCY_KEY_MIN_LENGTH || rawKey.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    return {
      error: `${IDEMPOTENCY_KEY_HEADER} must be between ${IDEMPOTENCY_KEY_MIN_LENGTH} and ${IDEMPOTENCY_KEY_MAX_LENGTH} characters.`,
    };
  }
  return { key: rawKey };
};

const recordAnalyticsFunnelEvent = async (
  db: Database,
  input: {
    organizerId: string;
    eventTypeId: string;
    stage: AnalyticsFunnelStage;
    teamEventTypeId?: string | null;
    metadata?: Record<string, unknown>;
    occurredAt?: Date;
  },
): Promise<void> => {
  await db.insert(analyticsFunnelEvents).values({
    organizerId: input.organizerId,
    eventTypeId: input.eventTypeId,
    ...(input.teamEventTypeId ? { teamEventTypeId: input.teamEventTypeId } : {}),
    stage: input.stage,
    ...(input.metadata ? { metadata: input.metadata } : {}),
    ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
  });
};

const tryRecordAnalyticsFunnelEvent = async (
  db: Database,
  input: Parameters<typeof recordAnalyticsFunnelEvent>[1],
): Promise<void> => {
  await recordAnalyticsFunnelEvent(db, input).catch((error) => {
    // Analytics writes are best-effort and must not fail booking flows.
    console.warn('analytics_funnel_event_write_failed', {
      eventTypeId: input.eventTypeId,
      stage: input.stage,
      error: error instanceof Error ? error.message : 'unknown',
    });
  });
};

const hashEmailForTelemetry = (email: string, telemetryHmacKey: string): string => {
  return hmacToken(email.trim().toLowerCase(), telemetryHmacKey);
};

const recordEmailDelivery = async (
  db: Database,
  telemetryHmacKey: string,
  input: {
    organizerId: string;
    bookingId: string;
    eventTypeId: string;
    recipientEmail: string;
    emailType: EmailDeliveryType;
    provider: string;
    status: 'succeeded' | 'failed';
    providerMessageId?: string;
    error?: string;
  },
): Promise<void> => {
  await db.insert(emailDeliveries).values({
    organizerId: input.organizerId,
    bookingId: input.bookingId,
    eventTypeId: input.eventTypeId,
    recipientEmailHash: hashEmailForTelemetry(input.recipientEmail, telemetryHmacKey),
    emailType: input.emailType,
    provider: input.provider,
    status: input.status,
    ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
    ...(input.error ? { error: input.error.slice(0, 1000) } : {}),
  });
};

const tryRecordEmailDelivery = async (
  env: Bindings,
  db: Database,
  input: Parameters<typeof recordEmailDelivery>[2],
): Promise<void> => {
  const telemetryHmacKey = resolveTelemetryHmacKey(env);
  if (!telemetryHmacKey) {
    console.warn('email_delivery_write_failed', {
      bookingId: input.bookingId,
      emailType: input.emailType,
      status: input.status,
      error: 'missing_telemetry_hmac_key',
    });
    return;
  }

  await recordEmailDelivery(db, telemetryHmacKey, input).catch((error) => {
    // Delivery telemetry is best-effort and should not fail request paths.
    console.warn('email_delivery_write_failed', {
      bookingId: input.bookingId,
      emailType: input.emailType,
      status: input.status,
      error: error instanceof Error ? error.message : 'unknown',
    });
  });
};

const stripTrailingSlash = (value: string): string => {
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const resolveAppBaseUrl = (env: Bindings, request: Request): string => {
  const configured = env.APP_BASE_URL?.trim();
  if (configured) {
    try {
      return stripTrailingSlash(new URL(configured).toString());
    } catch {
      // Fall back to request-derived URL if APP_BASE_URL is malformed.
    }
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }

  return requestUrl.origin;
};

const resolveEmbedTheme = (rawTheme: string | undefined): 'light' | 'dark' => {
  return rawTheme?.trim().toLowerCase() === 'dark' ? 'dark' : 'light';
};

const buildEmbedWidgetScript = (input: {
  iframeSrc: string;
  theme: 'light' | 'dark';
  timezone?: string;
}): string => {
  return `
(() => {
  const script = document.currentScript;
  if (!script) return;

  const timezone = ${JSON.stringify(input.timezone ?? '')};
  const theme = ${JSON.stringify(input.theme)};
  const frameSrc = ${JSON.stringify(input.iframeSrc)};

  const targetSelector = script.dataset.target || '';
  const mountPoint = targetSelector ? document.querySelector(targetSelector) : null;
  const container = mountPoint || document.createElement('div');

  if (!mountPoint) {
    script.parentNode?.insertBefore(container, script.nextSibling);
  }

  const radius = script.dataset.radius || (theme === 'dark' ? '14px' : '12px');
  const borderColor = theme === 'dark' ? '#1f2937' : '#d1d5db';
  const background = theme === 'dark' ? '#020617' : '#ffffff';
  const shadow = script.dataset.shadow || (theme === 'dark'
    ? '0 10px 24px rgba(15, 23, 42, 0.45)'
    : '0 10px 24px rgba(15, 23, 42, 0.10)');

  container.style.width = script.dataset.width || '100%';
  container.style.minHeight = script.dataset.height || '760px';
  container.style.border = \`1px solid \${borderColor}\`;
  container.style.borderRadius = radius;
  container.style.overflow = 'hidden';
  container.style.background = background;
  container.style.boxShadow = shadow;

  const iframe = document.createElement('iframe');
  iframe.src = frameSrc;
  iframe.style.width = '100%';
  iframe.style.height = script.dataset.height || '760px';
  iframe.style.border = '0';
  iframe.style.display = 'block';
  iframe.loading = 'lazy';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.title = script.dataset.title || 'OpenCalendly booking widget';

  if (timezone) {
    iframe.dataset.timezone = timezone;
  }
  iframe.dataset.theme = theme;

  container.innerHTML = '';
  container.appendChild(iframe);
})();
`;
};

const toEventQuestions = (value: unknown): EventQuestion[] => {
  const parsed = eventQuestionsSchema.safeParse(value ?? []);
  return parsed.success ? parsed.data : [];
};

const toWebhookSubscriptionRecord = (value: {
  id: string;
  userId: string;
  url: string;
  secret: string;
  events: unknown;
  isActive: boolean;
}): WebhookSubscriptionRecord => {
  return {
    id: value.id,
    userId: value.userId,
    url: value.url,
    secret: value.secret,
    events: parseWebhookEventTypes(value.events),
    isActive: value.isActive,
  };
};

const enqueueWebhookDeliveries = async (
  db: Database,
  input: {
    organizerId: string;
    type: WebhookEventType;
    booking: {
      id: string;
      eventTypeId: string;
      organizerId: string;
      inviteeEmail: string;
      inviteeName: string;
      startsAtIso: string;
      endsAtIso: string;
    };
    metadata?: Record<string, unknown>;
  },
): Promise<number> => {
  const subscriptions = await db
    .select({
      id: webhookSubscriptions.id,
      userId: webhookSubscriptions.userId,
      url: webhookSubscriptions.url,
      secret: webhookSubscriptions.secret,
      events: webhookSubscriptions.events,
      isActive: webhookSubscriptions.isActive,
    })
    .from(webhookSubscriptions)
    .where(
      and(eq(webhookSubscriptions.userId, input.organizerId), eq(webhookSubscriptions.isActive, true)),
    );

  const matchingSubscriptions = subscriptions
    .map((subscription) => toWebhookSubscriptionRecord(subscription))
    .filter((subscription) => subscription.events.includes(input.type));

  if (matchingSubscriptions.length === 0) {
    return 0;
  }

  const event = buildWebhookEvent({
    type: input.type,
    payload: {
      bookingId: input.booking.id,
      eventTypeId: input.booking.eventTypeId,
      organizerId: input.booking.organizerId,
      inviteeEmail: input.booking.inviteeEmail,
      inviteeName: input.booking.inviteeName,
      startsAt: input.booking.startsAtIso,
      endsAt: input.booking.endsAtIso,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    },
  });

  const deliveryWrites: Array<typeof webhookDeliveries.$inferInsert> = matchingSubscriptions.map(
    (subscription) => ({
      subscriptionId: subscription.id,
      eventId: event.id,
      eventType: event.type,
      payload: event,
      status: 'pending',
      attemptCount: 0,
      maxAttempts: WEBHOOK_DEFAULT_MAX_ATTEMPTS,
      nextAttemptAt: new Date(event.createdAt),
    }),
  );

  await db
    .insert(webhookDeliveries)
    .values(deliveryWrites)
    .onConflictDoNothing({
      target: [webhookDeliveries.subscriptionId, webhookDeliveries.eventId],
    });

  return matchingSubscriptions.length;
};

const executeWebhookDelivery = async (
  db: Database,
  delivery: PendingWebhookDelivery,
): Promise<'succeeded' | 'retried' | 'failed'> => {
  const now = new Date();
  const serializedPayload = JSON.stringify(delivery.payload);
  const timestampSeconds = Math.floor(now.getTime() / 1000);
  const signature = buildWebhookSignatureHeader(delivery.secret, serializedPayload, timestampSeconds);

  let responseStatus: number | null = null;
  let errorMessage: string | null = null;

  try {
    const response = await fetch(delivery.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenCalendly-Signature': signature,
        'X-OpenCalendly-Signature-Timestamp': String(timestampSeconds),
        'X-OpenCalendly-Delivery-Id': delivery.id,
        'X-OpenCalendly-Event': delivery.eventType,
        'X-OpenCalendly-Event-Id': delivery.eventId,
      },
      body: serializedPayload,
    });

    responseStatus = response.status;

    if (response.ok) {
      await db
        .update(webhookDeliveries)
        .set({
          status: 'succeeded',
          attemptCount: delivery.attemptCount + 1,
          lastAttemptAt: now,
          lastResponseStatus: response.status,
          lastError: null,
          nextAttemptAt: now,
          updatedAt: now,
        })
        .where(eq(webhookDeliveries.id, delivery.id));

      return 'succeeded';
    }

    const responseBody = await response.text();
    errorMessage = responseBody.slice(0, 2000) || `HTTP ${response.status}`;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Webhook delivery failed.';
  }

  const attemptedCount = delivery.attemptCount + 1;
  const exhausted = isWebhookDeliveryExhausted(attemptedCount, delivery.maxAttempts);

  if (exhausted) {
    await db
      .update(webhookDeliveries)
      .set({
        status: 'failed',
        attemptCount: attemptedCount,
        lastAttemptAt: now,
        ...(responseStatus !== null ? { lastResponseStatus: responseStatus } : {}),
        lastError: errorMessage,
        nextAttemptAt: now,
        updatedAt: now,
      })
      .where(eq(webhookDeliveries.id, delivery.id));

    return 'failed';
  }

  const nextAttemptAt = computeNextWebhookAttemptAt(attemptedCount, now);
  await db
    .update(webhookDeliveries)
    .set({
      status: 'pending',
      attemptCount: attemptedCount,
      lastAttemptAt: now,
      ...(responseStatus !== null ? { lastResponseStatus: responseStatus } : {}),
      lastError: errorMessage,
      nextAttemptAt,
      updatedAt: now,
    })
    .where(eq(webhookDeliveries.id, delivery.id));

  return 'retried';
};

type CalendarWritebackQueueResult = {
  queued: number;
  rowIds: string[];
};

type CalendarWritebackRunResult = {
  processed: number;
  succeeded: number;
  retried: number;
  failed: number;
};

const parseCalendarWritebackPayload = (
  value: unknown,
): {
  rescheduleTarget?: {
    bookingId: string;
    startsAtIso: string;
    endsAtIso: string;
  };
} => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const payload = value as Record<string, unknown>;
  const target = payload.rescheduleTarget;
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    return {};
  }

  const parsedTarget = target as Record<string, unknown>;
  if (
    typeof parsedTarget.bookingId !== 'string' ||
    typeof parsedTarget.startsAtIso !== 'string' ||
    typeof parsedTarget.endsAtIso !== 'string'
  ) {
    return {};
  }

  return {
    rescheduleTarget: {
      bookingId: parsedTarget.bookingId,
      startsAtIso: parsedTarget.startsAtIso,
      endsAtIso: parsedTarget.endsAtIso,
    },
  };
};

const enqueueCalendarWritebacksForBooking = async (
  db: Database,
  input: {
    bookingId: string;
    organizerId: string;
    operation: CalendarWritebackOperation;
    rescheduleTarget?: {
      bookingId: string;
      startsAtIso: string;
      endsAtIso: string;
    };
  },
): Promise<CalendarWritebackQueueResult> => {
  const connections = await db
    .select({
      id: calendarConnections.id,
      provider: calendarConnections.provider,
    })
    .from(calendarConnections)
    .where(
      and(
        eq(calendarConnections.userId, input.organizerId),
        inArray(calendarConnections.provider, [GOOGLE_CALENDAR_PROVIDER, MICROSOFT_CALENDAR_PROVIDER]),
      ),
    );

  if (connections.length === 0) {
    return {
      queued: 0,
      rowIds: [],
    };
  }

  const existingRows = await db
    .select({
      id: bookingExternalEvents.id,
      provider: bookingExternalEvents.provider,
      maxAttempts: bookingExternalEvents.maxAttempts,
    })
    .from(bookingExternalEvents)
    .where(eq(bookingExternalEvents.bookingId, input.bookingId));

  const existingByProvider = new Map(existingRows.map((row) => [row.provider, row]));
  const payload =
    input.operation === 'reschedule' && input.rescheduleTarget
      ? {
          rescheduleTarget: input.rescheduleTarget,
        }
      : {};
  const now = new Date();
  const rowIds: string[] = [];

  for (const connection of connections) {
    const provider = toCalendarProvider(connection.provider);
    if (!provider) {
      continue;
    }

    const existing = existingByProvider.get(connection.provider);
    if (existing) {
      await db
        .update(bookingExternalEvents)
        .set({
          organizerId: input.organizerId,
          connectionId: connection.id,
          operation: input.operation,
          status: 'pending',
          payload,
          attemptCount: 0,
          maxAttempts: existing.maxAttempts > 0 ? existing.maxAttempts : CALENDAR_WRITEBACK_DEFAULT_MAX_ATTEMPTS,
          nextAttemptAt: now,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(bookingExternalEvents.id, existing.id));

      rowIds.push(existing.id);
      continue;
    }

    const [inserted] = await db
      .insert(bookingExternalEvents)
      .values({
        bookingId: input.bookingId,
        organizerId: input.organizerId,
        connectionId: connection.id,
        provider,
        operation: input.operation,
        status: 'pending',
        payload,
        attemptCount: 0,
        maxAttempts: CALENDAR_WRITEBACK_DEFAULT_MAX_ATTEMPTS,
        nextAttemptAt: now,
      })
      .returning({
        id: bookingExternalEvents.id,
      });

    if (inserted) {
      rowIds.push(inserted.id);
    }
  }

  return {
    queued: rowIds.length,
    rowIds,
  };
};

const claimDueCalendarWritebackRowIds = async (
  db: Database,
  input: {
    now: Date;
    organizerId?: string;
    rowIds?: string[];
    limit: number;
  },
): Promise<string[]> => {
  const leaseUntil = new Date(input.now.getTime() + CALENDAR_WRITEBACK_LEASE_MINUTES * 60_000);
  return db.transaction(async (transaction) => {
    const organizerFilter = input.organizerId
      ? sql`and organizer_id = ${input.organizerId}`
      : sql``;
    const rowIdsFilter =
      input.rowIds && input.rowIds.length > 0
        ? sql`and id in (${sql.join(input.rowIds.map((id) => sql`${id}`), sql`, `)})`
        : sql``;

    const claimed = await transaction.execute<{ id: string }>(sql`
      with due_rows as (
        select id
        from booking_external_events
        where status = 'pending'
          and next_attempt_at <= ${input.now}
          ${organizerFilter}
          ${rowIdsFilter}
        order by next_attempt_at asc
        limit ${input.limit}
        for update skip locked
      )
      update booking_external_events as target
      set next_attempt_at = ${leaseUntil},
          updated_at = ${input.now}
      from due_rows
      where target.id = due_rows.id
      returning target.id
    `);

    return claimed.rows.map((row) => row.id);
  });
};

const runCalendarWritebackBatch = async (
  db: Database,
  env: Bindings,
  input: {
    organizerId?: string;
    rowIds?: string[];
    limit: number;
  },
): Promise<CalendarWritebackRunResult> => {
  const now = new Date();
  const claimedRowIds = await claimDueCalendarWritebackRowIds(db, {
    now,
    limit: input.limit,
    ...(input.organizerId ? { organizerId: input.organizerId } : {}),
    ...(input.rowIds && input.rowIds.length > 0 ? { rowIds: input.rowIds } : {}),
  });

  if (claimedRowIds.length === 0) {
    return {
      processed: 0,
      succeeded: 0,
      retried: 0,
      failed: 0,
    };
  }

  const rows = await db
    .select({
      id: bookingExternalEvents.id,
      bookingId: bookingExternalEvents.bookingId,
      organizerId: bookingExternalEvents.organizerId,
      connectionId: bookingExternalEvents.connectionId,
      provider: bookingExternalEvents.provider,
      operation: bookingExternalEvents.operation,
      status: bookingExternalEvents.status,
      externalEventId: bookingExternalEvents.externalEventId,
      payload: bookingExternalEvents.payload,
      attemptCount: bookingExternalEvents.attemptCount,
      maxAttempts: bookingExternalEvents.maxAttempts,
      bookingStartsAt: bookings.startsAt,
      bookingEndsAt: bookings.endsAt,
      bookingInviteeName: bookings.inviteeName,
      bookingInviteeEmail: bookings.inviteeEmail,
      bookingMetadata: bookings.metadata,
      eventTypeName: eventTypes.name,
      eventTypeLocationType: eventTypes.locationType,
      eventTypeLocationValue: eventTypes.locationValue,
      organizerTimezone: users.timezone,
      connectionAccessTokenEncrypted: calendarConnections.accessTokenEncrypted,
      connectionRefreshTokenEncrypted: calendarConnections.refreshTokenEncrypted,
      connectionAccessTokenExpiresAt: calendarConnections.accessTokenExpiresAt,
    })
    .from(bookingExternalEvents)
    .innerJoin(bookings, eq(bookings.id, bookingExternalEvents.bookingId))
    .innerJoin(eventTypes, eq(eventTypes.id, bookings.eventTypeId))
    .innerJoin(users, eq(users.id, bookingExternalEvents.organizerId))
    .leftJoin(calendarConnections, eq(calendarConnections.id, bookingExternalEvents.connectionId))
    .where(inArray(bookingExternalEvents.id, claimedRowIds))
    .orderBy(asc(bookingExternalEvents.updatedAt));

  const encryptionSecret = resolveCalendarEncryptionSecret(env);
  const googleConfig = resolveGoogleOAuthConfig(env);
  const microsoftConfig = resolveMicrosoftOAuthConfig(env);

  const result: CalendarWritebackRunResult = {
    processed: 0,
    succeeded: 0,
    retried: 0,
    failed: 0,
  };

  for (const row of rows) {
    result.processed += 1;

    const provider = toCalendarProvider(row.provider);
    const operation = row.operation as CalendarWritebackOperation;
    const payload = parseCalendarWritebackPayload(row.payload);
    const timezone =
      parseBookingMetadata(row.bookingMetadata, normalizeTimezone).timezone ??
      normalizeTimezone(row.organizerTimezone);
    const connectionId = row.connectionId;
    const connectionAccessTokenEncrypted = row.connectionAccessTokenEncrypted;
    const connectionRefreshTokenEncrypted = row.connectionRefreshTokenEncrypted;
    const connectionAccessTokenExpiresAt = row.connectionAccessTokenExpiresAt;

    const applyResult = async (
      writebackResult: Awaited<ReturnType<typeof processCalendarWriteback>>,
    ): Promise<void> => {
      await db
        .update(bookingExternalEvents)
        .set({
          status: writebackResult.status,
          attemptCount: writebackResult.attemptCount,
          nextAttemptAt: writebackResult.nextAttemptAt,
          lastAttemptAt: writebackResult.lastAttemptAt,
          lastError: writebackResult.lastError,
          externalEventId: writebackResult.externalEventId,
          updatedAt: now,
        })
        .where(eq(bookingExternalEvents.id, row.id));

      if (
        writebackResult.status === 'succeeded' &&
        writebackResult.transferExternalEventToBookingId &&
        writebackResult.externalEventId &&
        provider
      ) {
        const [targetRow] = await db
          .select({
            id: bookingExternalEvents.id,
          })
          .from(bookingExternalEvents)
          .where(
            and(
              eq(bookingExternalEvents.bookingId, writebackResult.transferExternalEventToBookingId),
              eq(bookingExternalEvents.provider, provider),
            ),
          )
          .limit(1);

        if (targetRow) {
          await db
            .update(bookingExternalEvents)
            .set({
              organizerId: row.organizerId,
              connectionId: row.connectionId,
              operation: 'create',
              status: 'succeeded',
              externalEventId: writebackResult.externalEventId,
              payload: {},
              attemptCount: 0,
              nextAttemptAt: now,
              lastAttemptAt: now,
              lastError: null,
              updatedAt: now,
            })
            .where(eq(bookingExternalEvents.id, targetRow.id));
        } else {
          await db.insert(bookingExternalEvents).values({
            bookingId: writebackResult.transferExternalEventToBookingId,
            organizerId: row.organizerId,
            connectionId: row.connectionId,
            provider,
            operation: 'create',
            status: 'succeeded',
            externalEventId: writebackResult.externalEventId,
            payload: {},
            attemptCount: 0,
            maxAttempts: row.maxAttempts > 0 ? row.maxAttempts : CALENDAR_WRITEBACK_DEFAULT_MAX_ATTEMPTS,
            nextAttemptAt: now,
            lastAttemptAt: now,
          });
        }
      }

      if (writebackResult.status === 'succeeded') {
        result.succeeded += 1;
      } else if (writebackResult.status === 'pending') {
        result.retried += 1;
      } else {
        result.failed += 1;
      }
    };

    if (
      !provider ||
      !connectionId ||
      !connectionAccessTokenEncrypted ||
      !connectionRefreshTokenEncrypted ||
      !connectionAccessTokenExpiresAt ||
      !encryptionSecret
    ) {
      const fallback = await processCalendarWriteback({
        record: {
          operation,
          attemptCount: row.attemptCount,
          maxAttempts: row.maxAttempts > 0 ? row.maxAttempts : CALENDAR_WRITEBACK_DEFAULT_MAX_ATTEMPTS,
          externalEventId: row.externalEventId,
          idempotencyKey: `${row.provider}:${row.bookingId}`,
        },
        booking: {
          eventName: row.eventTypeName,
          inviteeName: row.bookingInviteeName,
          inviteeEmail: row.bookingInviteeEmail,
          startsAtIso: row.bookingStartsAt.toISOString(),
          endsAtIso: row.bookingEndsAt.toISOString(),
          timezone,
          locationType: row.eventTypeLocationType,
          locationValue: row.eventTypeLocationValue,
        },
        ...(payload.rescheduleTarget ? { rescheduleTarget: payload.rescheduleTarget } : {}),
        providerClient: {
          createEvent: async () => {
            throw new Error('Calendar writeback is not configured.');
          },
          cancelEvent: async () => {
            throw new Error('Calendar writeback is not configured.');
          },
          updateEvent: async () => {
            throw new Error('Calendar writeback is not configured.');
          },
        },
        now,
      });
      await applyResult(fallback);
      continue;
    }

    const getToken = async (): Promise<string> => {
      if (provider === GOOGLE_CALENDAR_PROVIDER) {
        if (!googleConfig) {
          throw new Error('Google OAuth is not configured for calendar writeback.');
        }
        const resolved = await resolveGoogleAccessToken({
          connection: {
            accessTokenEncrypted: connectionAccessTokenEncrypted,
            refreshTokenEncrypted: connectionRefreshTokenEncrypted,
            accessTokenExpiresAt: connectionAccessTokenExpiresAt,
          },
          encryptionSecret,
          clientId: googleConfig.clientId,
          clientSecret: googleConfig.clientSecret,
          now,
        });
        await db
          .update(calendarConnections)
          .set({
            accessTokenEncrypted: encryptSecret(resolved.accessToken, encryptionSecret),
            refreshTokenEncrypted: encryptSecret(resolved.refreshToken, encryptionSecret),
            accessTokenExpiresAt: resolved.accessTokenExpiresAt,
            lastError: null,
            updatedAt: now,
          })
          .where(eq(calendarConnections.id, connectionId));
        return resolved.accessToken;
      }

      if (!microsoftConfig) {
        throw new Error('Microsoft OAuth is not configured for calendar writeback.');
      }
      const resolved = await resolveMicrosoftAccessToken({
        connection: {
          accessTokenEncrypted: connectionAccessTokenEncrypted,
          refreshTokenEncrypted: connectionRefreshTokenEncrypted,
          accessTokenExpiresAt: connectionAccessTokenExpiresAt,
        },
        encryptionSecret,
        clientId: microsoftConfig.clientId,
        clientSecret: microsoftConfig.clientSecret,
        now,
      });
      await db
        .update(calendarConnections)
        .set({
          accessTokenEncrypted: encryptSecret(resolved.accessToken, encryptionSecret),
          refreshTokenEncrypted: encryptSecret(resolved.refreshToken, encryptionSecret),
          accessTokenExpiresAt: resolved.accessTokenExpiresAt,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(calendarConnections.id, connectionId));
      return resolved.accessToken;
    };

    const providerClient = {
      createEvent: async (bookingContext: {
        idempotencyKey: string;
        eventName: string;
        inviteeName: string;
        inviteeEmail: string;
        startsAtIso: string;
        endsAtIso: string;
        timezone: string;
        locationType: string;
        locationValue: string | null;
      }) => {
        const accessToken = await getToken();
        if (provider === GOOGLE_CALENDAR_PROVIDER) {
          return createGoogleCalendarEvent({
            accessToken,
            idempotencyKey: bookingContext.idempotencyKey,
            eventName: bookingContext.eventName,
            inviteeName: bookingContext.inviteeName,
            inviteeEmail: bookingContext.inviteeEmail,
            startsAtIso: bookingContext.startsAtIso,
            endsAtIso: bookingContext.endsAtIso,
            timezone: bookingContext.timezone,
            locationType: bookingContext.locationType,
            locationValue: bookingContext.locationValue,
          });
        }

        return createMicrosoftCalendarEvent({
          accessToken,
          idempotencyKey: bookingContext.idempotencyKey,
          eventName: bookingContext.eventName,
          inviteeName: bookingContext.inviteeName,
          inviteeEmail: bookingContext.inviteeEmail,
          startsAtIso: bookingContext.startsAtIso,
          endsAtIso: bookingContext.endsAtIso,
          locationValue: bookingContext.locationValue,
        });
      },
      findEventByIdempotencyKey: async (lookupInput: { idempotencyKey: string }) => {
        const accessToken = await getToken();
        if (provider === GOOGLE_CALENDAR_PROVIDER) {
          return findGoogleCalendarEventByIdempotencyKey({
            accessToken,
            idempotencyKey: lookupInput.idempotencyKey,
          });
        }

        return findMicrosoftCalendarEventByIdempotencyKey({
          accessToken,
          idempotencyKey: lookupInput.idempotencyKey,
        });
      },
      cancelEvent: async (cancelInput: { externalEventId: string }) => {
        const accessToken = await getToken();
        if (provider === GOOGLE_CALENDAR_PROVIDER) {
          await cancelGoogleCalendarEvent({
            accessToken,
            externalEventId: cancelInput.externalEventId,
          });
          return;
        }
        await cancelMicrosoftCalendarEvent({
          accessToken,
          externalEventId: cancelInput.externalEventId,
        });
      },
      updateEvent: async (updateInput: {
        externalEventId: string;
        startsAtIso: string;
        endsAtIso: string;
      }) => {
        const accessToken = await getToken();
        if (provider === GOOGLE_CALENDAR_PROVIDER) {
          await updateGoogleCalendarEvent({
            accessToken,
            externalEventId: updateInput.externalEventId,
            startsAtIso: updateInput.startsAtIso,
            endsAtIso: updateInput.endsAtIso,
            timezone,
          });
          return;
        }
        await updateMicrosoftCalendarEvent({
          accessToken,
          externalEventId: updateInput.externalEventId,
          startsAtIso: updateInput.startsAtIso,
          endsAtIso: updateInput.endsAtIso,
        });
      },
    };

    const processed = await processCalendarWriteback({
      record: {
        operation,
        attemptCount: row.attemptCount,
        maxAttempts: row.maxAttempts > 0 ? row.maxAttempts : CALENDAR_WRITEBACK_DEFAULT_MAX_ATTEMPTS,
        externalEventId: row.externalEventId,
        idempotencyKey: `${row.provider}:${row.bookingId}`,
      },
      booking: {
        eventName: row.eventTypeName,
        inviteeName: row.bookingInviteeName,
        inviteeEmail: row.bookingInviteeEmail,
        startsAtIso: row.bookingStartsAt.toISOString(),
        endsAtIso: row.bookingEndsAt.toISOString(),
        timezone,
        locationType: row.eventTypeLocationType,
        locationValue: row.eventTypeLocationValue,
      },
      ...(payload.rescheduleTarget ? { rescheduleTarget: payload.rescheduleTarget } : {}),
      providerClient,
      now,
    });

    await applyResult(processed);
  }

  return result;
};

const isUniqueViolation = (error: unknown, constraint?: string): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { code?: string; constraint?: string };
  if (maybeError.code !== '23505') {
    return false;
  }
  if (!constraint) {
    return true;
  }
  return maybeError.constraint === constraint;
};

const withDatabase = async (
  context: ContextLike,
  handler: (db: Database) => Promise<Response>,
): Promise<Response> => {
  const connection = resolveConnectionString(context.env);
  if (!connection) {
    return jsonError(
      context,
      500,
      'Missing database connection string. Configure Hyperdrive or a Neon DATABASE_URL.',
    );
  }

  if (connection.source === 'database_url' && !isNeonDatabaseUrl(connection.connectionString)) {
    return jsonError(context, 500, 'DATABASE_URL must point to Neon Postgres (*.neon.tech).');
  }

  const { client, db } = createDb(connection.connectionString, {
    enforceNeon: connection.source === 'database_url',
  });
  try {
    await client.connect();
    return await handler(db);
  } finally {
    await client.end();
  }
};

const toCanonicalJson = (value: unknown): string => {
  const normalize = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map(normalize);
    }
    if (node && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return node;
  };

  return JSON.stringify(normalize(value));
};

const hashIdempotencyRequestPayload = (input: Record<string, unknown>): string => {
  return hashToken(toCanonicalJson(input));
};

const buildInProgressIdempotencyExpiry = (from: Date): Date => {
  return new Date(from.getTime() + IDEMPOTENCY_IN_PROGRESS_TTL_MINUTES * 60 * 1000);
};

const buildCompletedIdempotencyExpiry = (from: Date): Date => {
  return new Date(from.getTime() + IDEMPOTENCY_COMPLETED_TTL_HOURS * 60 * 60 * 1000);
};

const claimIdempotencyRequest = async (
  db: Database,
  input: {
    scope: IdempotencyScope;
    rawKey: string;
    requestHash: string;
    now?: Date;
  },
): Promise<
  | {
      state: 'claimed';
      keyHash: string;
    }
  | {
      state: 'replay';
      statusCode: 200 | 400 | 404 | 409 | 410 | 500;
      responseBody: Record<string, unknown>;
    }
  | {
      state: 'mismatch';
    }
  | {
      state: 'in_progress';
    }
> => {
  const now = input.now ?? new Date();
  const keyHash = hashToken(input.rawKey);
  const expiresAt = buildInProgressIdempotencyExpiry(now);

  try {
    await db.insert(idempotencyRequests).values({
      scope: input.scope,
      idempotencyKeyHash: keyHash,
      requestHash: input.requestHash,
      status: 'in_progress',
      expiresAt,
    });
    return {
      state: 'claimed',
      keyHash,
    };
  } catch (error) {
    if (!isUniqueViolation(error, 'idempotency_requests_scope_key_hash_unique')) {
      throw error;
    }
  }

  const [existing] = await db
    .select({
      requestHash: idempotencyRequests.requestHash,
      status: idempotencyRequests.status,
      responseStatusCode: idempotencyRequests.responseStatusCode,
      responseBody: idempotencyRequests.responseBody,
      expiresAt: idempotencyRequests.expiresAt,
    })
    .from(idempotencyRequests)
    .where(
      and(
        eq(idempotencyRequests.scope, input.scope),
        eq(idempotencyRequests.idempotencyKeyHash, keyHash),
      ),
    )
    .limit(1);

  if (!existing) {
    return { state: 'in_progress' };
  }

  if (existing.expiresAt.getTime() <= now.getTime()) {
    await db
      .delete(idempotencyRequests)
      .where(
        and(
          eq(idempotencyRequests.scope, input.scope),
          eq(idempotencyRequests.idempotencyKeyHash, keyHash),
          lte(idempotencyRequests.expiresAt, now),
        ),
      );

    try {
      await db.insert(idempotencyRequests).values({
        scope: input.scope,
        idempotencyKeyHash: keyHash,
        requestHash: input.requestHash,
        status: 'in_progress',
        expiresAt,
      });
      return {
        state: 'claimed',
        keyHash,
      };
    } catch (error) {
      if (isUniqueViolation(error, 'idempotency_requests_scope_key_hash_unique')) {
        return { state: 'in_progress' };
      }
      throw error;
    }
  }

  if (existing.requestHash !== input.requestHash) {
    return { state: 'mismatch' };
  }

  const responseStatusCode = existing.responseStatusCode;
  const isReplayStatusCode =
    responseStatusCode === 200 ||
    responseStatusCode === 400 ||
    responseStatusCode === 404 ||
    responseStatusCode === 409 ||
    responseStatusCode === 410 ||
    responseStatusCode === 500;
  if (
    existing.status === 'completed' &&
    isReplayStatusCode &&
    existing.responseBody &&
    typeof existing.responseBody === 'object' &&
    !Array.isArray(existing.responseBody)
  ) {
    return {
      state: 'replay',
      statusCode: responseStatusCode,
      responseBody: existing.responseBody as Record<string, unknown>,
    };
  }

  return { state: 'in_progress' };
};

const completeIdempotencyRequest = async (
  db: Database,
  input: {
    scope: IdempotencyScope;
    keyHash: string;
    statusCode: 200 | 400 | 404 | 409 | 410 | 500;
    responseBody: Record<string, unknown>;
    now?: Date;
  },
): Promise<void> => {
  const now = input.now ?? new Date();
  await db
    .update(idempotencyRequests)
    .set({
      status: 'completed',
      responseStatusCode: input.statusCode,
      responseBody: input.responseBody,
      completedAt: now,
      expiresAt: buildCompletedIdempotencyExpiry(now),
    })
    .where(
      and(
        eq(idempotencyRequests.scope, input.scope),
        eq(idempotencyRequests.idempotencyKeyHash, input.keyHash),
        eq(idempotencyRequests.status, 'in_progress'),
      ),
    );
};

const releaseIdempotencyRequest = async (
  db: Database,
  input: {
    scope: IdempotencyScope;
    keyHash: string;
  },
): Promise<void> => {
  await db
    .delete(idempotencyRequests)
    .where(
      and(
        eq(idempotencyRequests.scope, input.scope),
        eq(idempotencyRequests.idempotencyKeyHash, input.keyHash),
        eq(idempotencyRequests.status, 'in_progress'),
      ),
    );
};

const findPublicEventType = async (
  db: Database,
  username: string,
  slug: string,
): Promise<PublicEventType | null> => {
  const [row] = await db
    .select({
      eventTypeId: eventTypes.id,
      eventTypeUserId: eventTypes.userId,
      eventTypeSlug: eventTypes.slug,
      eventTypeName: eventTypes.name,
      durationMinutes: eventTypes.durationMinutes,
      locationType: eventTypes.locationType,
      locationValue: eventTypes.locationValue,
      questions: eventTypes.questions,
      isActive: eventTypes.isActive,
      organizerId: users.id,
      organizerEmail: users.email,
      organizerUsername: users.username,
      organizerDisplayName: users.displayName,
      organizerTimezone: users.timezone,
    })
    .from(eventTypes)
    .innerJoin(users, eq(users.id, eventTypes.userId))
    .where(and(eq(users.username, username), eq(eventTypes.slug, slug)))
    .limit(1);

  if (!row || !row.isActive) {
    return null;
  }

  return {
    id: row.eventTypeId,
    userId: row.eventTypeUserId,
    slug: row.eventTypeSlug,
    name: row.eventTypeName,
    durationMinutes: row.durationMinutes,
    locationType: row.locationType,
    locationValue: row.locationValue,
    questions: toEventQuestions(row.questions),
    isActive: row.isActive,
    organizerDisplayName: row.organizerDisplayName,
    organizerEmail: row.organizerEmail,
    organizerTimezone: normalizeTimezone(row.organizerTimezone),
  };
};

const findPublicEventView = async (
  db: Database,
  username: string,
  slug: string,
): Promise<PublicEventView | null> => {
  const eventType = await findPublicEventType(db, username, slug);

  if (!eventType) {
    return null;
  }

  const [organizer] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      timezone: users.timezone,
    })
    .from(users)
    .where(eq(users.id, eventType.userId))
    .limit(1);

  if (!organizer) {
    return null;
  }

  return {
    eventType: {
      id: eventType.id,
      slug: eventType.slug,
      name: eventType.name,
      durationMinutes: eventType.durationMinutes,
      locationType: eventType.locationType,
      locationValue: eventType.locationValue,
      questions: eventType.questions,
    },
    organizer: {
      id: organizer.id,
      email: organizer.email,
      username: organizer.username,
      displayName: organizer.displayName,
      timezone: normalizeTimezone(organizer.timezone),
    },
  };
};

const resolveTeamMode = (rawMode: string): TeamSchedulingMode | null => {
  if (rawMode === 'round_robin' || rawMode === 'collective') {
    return rawMode;
  }
  return null;
};

const findTeamEventTypeContext = async (
  db: Database,
  teamSlug: string,
  eventSlug: string,
): Promise<TeamEventTypeContext | null> => {
  const [row] = await db
    .select({
      teamId: teams.id,
      teamOwnerUserId: teams.ownerUserId,
      teamSlug: teams.slug,
      teamName: teams.name,
      teamEventTypeId: teamEventTypes.id,
      mode: teamEventTypes.mode,
      roundRobinCursor: teamEventTypes.roundRobinCursor,
      eventTypeId: eventTypes.id,
      eventTypeUserId: eventTypes.userId,
      eventTypeSlug: eventTypes.slug,
      eventTypeName: eventTypes.name,
      durationMinutes: eventTypes.durationMinutes,
      locationType: eventTypes.locationType,
      locationValue: eventTypes.locationValue,
      isActive: eventTypes.isActive,
    })
    .from(teamEventTypes)
    .innerJoin(teams, eq(teams.id, teamEventTypes.teamId))
    .innerJoin(eventTypes, eq(eventTypes.id, teamEventTypes.eventTypeId))
    .where(and(eq(teams.slug, teamSlug), eq(eventTypes.slug, eventSlug)))
    .limit(1);

  if (!row || !row.isActive) {
    return null;
  }

  const mode = resolveTeamMode(row.mode);
  if (!mode) {
    return null;
  }

  const requiredMembers = await db
    .select({
      userId: teamMembers.userId,
      role: teamMembers.role,
    })
    .from(teamEventTypeMembers)
    .innerJoin(
      teamMembers,
      and(
        eq(teamMembers.teamId, row.teamId),
        eq(teamMembers.userId, teamEventTypeMembers.userId),
      ),
    )
    .where(
      and(
        eq(teamEventTypeMembers.teamEventTypeId, row.teamEventTypeId),
        eq(teamEventTypeMembers.isRequired, true),
      ),
    )
    .orderBy(asc(teamMembers.createdAt), asc(teamMembers.userId));

  if (requiredMembers.length === 0) {
    return null;
  }

  return {
    team: {
      id: row.teamId,
      ownerUserId: row.teamOwnerUserId,
      slug: row.teamSlug,
      name: row.teamName,
    },
    eventType: {
      id: row.eventTypeId,
      userId: row.eventTypeUserId,
      slug: row.eventTypeSlug,
      name: row.eventTypeName,
      durationMinutes: row.durationMinutes,
      locationType: row.locationType,
      locationValue: row.locationValue,
      isActive: row.isActive,
    },
    mode,
    roundRobinCursor: row.roundRobinCursor,
    members: requiredMembers.map((member) => ({
      userId: member.userId,
      role: member.role,
    })),
  };
};

const listExternalBusyWindowsForUser = async (
  db: QueryableDb,
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<Array<{ startsAt: Date; endsAt: Date }>> => {
  return db
    .select({
      startsAt: calendarBusyWindows.startsAt,
      endsAt: calendarBusyWindows.endsAt,
    })
    .from(calendarBusyWindows)
    .where(
      and(
        eq(calendarBusyWindows.userId, userId),
        lt(calendarBusyWindows.startsAt, rangeEnd),
        gt(calendarBusyWindows.endsAt, rangeStart),
      ),
    );
};

const listTeamMemberSchedules = async (
  db: QueryableDb,
  memberIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<TeamMemberScheduleRecord[]> => {
  if (memberIds.length === 0) {
    return [];
  }

  const uniqueMemberIds = Array.from(new Set(memberIds));
  const memberUsers = await db
    .select({
      id: users.id,
      timezone: users.timezone,
    })
    .from(users)
    .where(inArray(users.id, uniqueMemberIds));

  const timezoneByUserId = new Map(
    memberUsers.map((memberUser) => [memberUser.id, normalizeTimezone(memberUser.timezone)]),
  );

  const schedules: TeamMemberScheduleRecord[] = [];

  for (const userId of uniqueMemberIds) {
    if (!timezoneByUserId.has(userId)) {
      continue;
    }

    const [rules, overrides, externalBusyWindows, directBookings, assignedBookings] = await Promise.all([
      db
        .select({
          dayOfWeek: availabilityRules.dayOfWeek,
          startMinute: availabilityRules.startMinute,
          endMinute: availabilityRules.endMinute,
          bufferBeforeMinutes: availabilityRules.bufferBeforeMinutes,
          bufferAfterMinutes: availabilityRules.bufferAfterMinutes,
        })
        .from(availabilityRules)
        .where(eq(availabilityRules.userId, userId)),
      db
        .select({
          startAt: availabilityOverrides.startAt,
          endAt: availabilityOverrides.endAt,
          isAvailable: availabilityOverrides.isAvailable,
        })
        .from(availabilityOverrides)
        .where(
          and(
            eq(availabilityOverrides.userId, userId),
            lt(availabilityOverrides.startAt, rangeEnd),
            gt(availabilityOverrides.endAt, rangeStart),
          ),
        ),
      listExternalBusyWindowsForUser(db, userId, rangeStart, rangeEnd),
      db
        .select({
          startsAt: bookings.startsAt,
          endsAt: bookings.endsAt,
          status: bookings.status,
          metadata: bookings.metadata,
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.organizerId, userId),
            eq(bookings.status, 'confirmed'),
            lt(bookings.startsAt, rangeEnd),
            gt(bookings.endsAt, rangeStart),
          ),
        ),
      db
        .select({
          startsAt: teamBookingAssignments.startsAt,
          endsAt: teamBookingAssignments.endsAt,
          status: bookings.status,
          metadata: bookings.metadata,
        })
        .from(teamBookingAssignments)
        .innerJoin(bookings, eq(bookings.id, teamBookingAssignments.bookingId))
        .where(
          and(
            eq(teamBookingAssignments.userId, userId),
            eq(bookings.status, 'confirmed'),
            lt(teamBookingAssignments.startsAt, rangeEnd),
            gt(teamBookingAssignments.endsAt, rangeStart),
          ),
        ),
    ]);

    const dedupedBookings = new Map<
      string,
      { startsAt: Date; endsAt: Date; status: string; metadata: string | null }
    >();
    for (const booking of [...directBookings, ...assignedBookings]) {
      const key = `${booking.startsAt.toISOString()}|${booking.endsAt.toISOString()}|${booking.metadata ?? ''}`;
      dedupedBookings.set(key, booking);
    }

    schedules.push({
      userId,
      timezone: timezoneByUserId.get(userId) ?? 'UTC',
      rules,
      overrides: [
        ...overrides,
        ...externalBusyWindows.map((window) => ({
          startAt: window.startsAt,
          endAt: window.endsAt,
          isAvailable: false,
        })),
      ],
      bookings: Array.from(dedupedBookings.values()),
    });
  }

  return schedules;
};

const resolveTeamRequestedSlot = (input: {
  mode: TeamSchedulingMode;
  memberSchedules: TeamMemberScheduleRecord[];
  requestedStartsAtIso: string;
  durationMinutes: number;
  rangeStartIso: string;
  days: number;
  roundRobinCursor: number;
}): {
  assignmentUserIds: string[];
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  nextRoundRobinCursor: number;
  requestedEndsAtIso: string;
} | null => {
  const startsAt = DateTime.fromISO(input.requestedStartsAtIso, { zone: 'utc' });
  if (!startsAt.isValid) {
    return null;
  }

  const endsAt = startsAt.plus({ minutes: input.durationMinutes });
  const requestedEndsAtIso = endsAt.toUTC().toISO();
  if (!requestedEndsAtIso) {
    return null;
  }

  const matrix = computeTeamSlotMatrix({
    members: input.memberSchedules,
    rangeStartIso: input.rangeStartIso,
    days: input.days,
    durationMinutes: input.durationMinutes,
  });

  const slotKey = `${input.requestedStartsAtIso}|${requestedEndsAtIso}`;
  const requestedSlot = matrix.get(slotKey);
  if (!requestedSlot) {
    return null;
  }

  const orderedMemberIds = input.memberSchedules
    .map((memberSchedule) => memberSchedule.userId)
    .sort((left, right) => left.localeCompare(right));
  const availableMemberIds = orderedMemberIds.filter((memberId) => requestedSlot.byUserId.has(memberId));

  if (input.mode === 'collective') {
    if (availableMemberIds.length !== orderedMemberIds.length) {
      return null;
    }

    let bufferBeforeMinutes = 0;
    let bufferAfterMinutes = 0;
    for (const memberId of orderedMemberIds) {
      const memberSlot = requestedSlot.byUserId.get(memberId);
      if (!memberSlot) {
        continue;
      }
      if (memberSlot.bufferBeforeMinutes > bufferBeforeMinutes) {
        bufferBeforeMinutes = memberSlot.bufferBeforeMinutes;
      }
      if (memberSlot.bufferAfterMinutes > bufferAfterMinutes) {
        bufferAfterMinutes = memberSlot.bufferAfterMinutes;
      }
    }

    return {
      assignmentUserIds: orderedMemberIds,
      bufferBeforeMinutes,
      bufferAfterMinutes,
      nextRoundRobinCursor: input.roundRobinCursor,
      requestedEndsAtIso,
    };
  }

  const selection = chooseRoundRobinAssignee({
    orderedMemberIds,
    availableMemberIds,
    cursor: input.roundRobinCursor,
  });
  if (!selection) {
    return null;
  }

  const selectedSlot = requestedSlot.byUserId.get(selection.assigneeUserId);
  if (!selectedSlot) {
    return null;
  }

  return {
    assignmentUserIds: [selection.assigneeUserId],
    bufferBeforeMinutes: selectedSlot.bufferBeforeMinutes,
    bufferAfterMinutes: selectedSlot.bufferAfterMinutes,
    nextRoundRobinCursor: selection.nextCursor,
    requestedEndsAtIso,
  };
};

const resolveAuthenticatedUser = async (
  db: Database,
  request: Request,
): Promise<AuthenticatedUser | null> => {
  const token = getBearerToken(request);
  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      timezone: users.timezone,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.displayName,
    timezone: normalizeTimezone(row.timezone),
  };
};

const resolveDemoDailyPassLimit = (env: Bindings): number => {
  return parseDemoDailyPassLimit(env.DEMO_DAILY_PASS_LIMIT?.trim());
};

const actionTokenMap = (
  tokens: Array<{
    actionType: BookingActionType;
    token: string;
    expiresAt: string;
  }>,
): {
  cancelToken: string;
  cancelExpiresAt: string;
  rescheduleToken: string;
  rescheduleExpiresAt: string;
} => {
  const cancel = tokens.find((token) => token.actionType === 'cancel');
  const reschedule = tokens.find((token) => token.actionType === 'reschedule');

  if (!cancel || !reschedule) {
    throw new Error('Missing booking action token(s).');
  }

  return {
    cancelToken: cancel.token,
    cancelExpiresAt: cancel.expiresAt,
    rescheduleToken: reschedule.token,
    rescheduleExpiresAt: reschedule.expiresAt,
  };
};

const buildActionUrls = (
  request: Request,
  tokenMap: {
    cancelToken: string;
    rescheduleToken: string;
  },
): {
  lookupCancelUrl: string;
  lookupRescheduleUrl: string;
  cancelUrl: string;
  rescheduleUrl: string;
} => {
  const origin = new URL(request.url).origin;

  return {
    lookupCancelUrl: `${origin}/v0/bookings/actions/${tokenMap.cancelToken}`,
    lookupRescheduleUrl: `${origin}/v0/bookings/actions/${tokenMap.rescheduleToken}`,
    cancelUrl: `${origin}/v0/bookings/actions/${tokenMap.cancelToken}/cancel`,
    rescheduleUrl: `${origin}/v0/bookings/actions/${tokenMap.rescheduleToken}/reschedule`,
  };
};

const lockActionToken = async (
  db: Database | Parameters<Parameters<Database['transaction']>[0]>[0],
  tokenHash: string,
): Promise<LockedActionToken | null> => {
  const locked = await db.execute<LockedActionToken>(sql`
    select
      id,
      booking_id as "bookingId",
      action_type as "actionType",
      expires_at as "expiresAt",
      consumed_at as "consumedAt",
      consumed_booking_id as "consumedBookingId"
    from booking_action_tokens
    where token_hash = ${tokenHash}
    for update
  `);

  return locked.rows[0] ?? null;
};

const lockBooking = async (
  db: Database | Parameters<Parameters<Database['transaction']>[0]>[0],
  bookingId: string,
): Promise<LockedBooking | null> => {
  const locked = await db.execute<LockedBooking>(sql`
    select
      id,
      event_type_id as "eventTypeId",
      organizer_id as "organizerId",
      invitee_name as "inviteeName",
      invitee_email as "inviteeEmail",
      starts_at as "startsAt",
      ends_at as "endsAt",
      status,
      metadata
    from bookings
    where id = ${bookingId}
    for update
  `);

  return locked.rows[0] ?? null;
};

app.get('/health', (context) => {
  return context.json(healthCheckSchema.parse({ status: 'ok' }));
});

app.get('/v0/db/ping', async (context) => {
  return withDatabase(context, async (db) => {
    const result = await db.execute<{ now: string }>(sql`select now()::text as now`);
    const now = result.rows[0]?.now ?? null;
    return context.json({ ok: true, now });
  });
});

app.post('/v0/auth/magic-link', async (context) => {
  return withDatabase(context, async (db) => {
    const body = await context.req.json().catch(() => null);
    const parsed = magicLinkRequestSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const payload = parsed.data;
    const email = payload.email.trim().toLowerCase();
    const username = payload.username?.trim().toLowerCase();
    const displayName = payload.displayName?.trim();
    const timezone = normalizeTimezone(payload.timezone);

    const [existing] = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        timezone: users.timezone,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let userId = existing?.id ?? '';

    if (!existing) {
      if (!username || !displayName) {
        return jsonError(
          context,
          400,
          'username and displayName are required when creating a new account.',
        );
      }

      try {
        const [inserted] = await db
          .insert(users)
          .values({
            email,
            username,
            displayName,
            timezone,
          })
          .returning({ id: users.id });

        userId = inserted?.id ?? '';
      } catch (error) {
        if (isUniqueViolation(error)) {
          return jsonError(context, 409, 'A user with that username or email already exists.');
        }
        throw error;
      }
    } else if (payload.timezone || payload.displayName) {
      await db
        .update(users)
        .set({
          timezone,
          displayName: displayName || existing.displayName,
        })
        .where(eq(users.id, existing.id));
      userId = existing.id;
    }

    if (!userId) {
      return jsonError(context, 500, 'Unable to create or resolve user account.');
    }

    const magicLinkToken = createRawToken();
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60_000);

    await db.insert(sessions).values({
      userId,
      tokenHash: hashToken(magicLinkToken),
      expiresAt,
    });

    return context.json({
      ok: true,
      magicLinkToken,
      expiresAt: expiresAt.toISOString(),
    });
  });
});

app.post('/v0/auth/verify', async (context) => {
  return withDatabase(context, async (db) => {
    const body = await context.req.json().catch(() => null);
    const parsed = verifyMagicLinkRequestSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const tokenHash = hashToken(parsed.data.token);
    const [row] = await db
      .select({
        sessionId: sessions.id,
        userId: users.id,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
        timezone: users.timezone,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
      .limit(1);

    if (!row) {
      return jsonError(context, 401, 'Magic link token is invalid or expired.');
    }

    const sessionToken = createRawToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

    await db
      .update(sessions)
      .set({
        tokenHash: hashToken(sessionToken),
        expiresAt,
      })
      .where(eq(sessions.id, row.sessionId));

    return context.json({
      ok: true,
      sessionToken,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: row.userId,
        email: row.email,
        username: row.username,
        displayName: row.displayName,
        timezone: normalizeTimezone(row.timezone),
      },
    });
  });
});

app.get('/v0/auth/me', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    return context.json({ ok: true, user: authedUser });
  });
});

app.get('/v0/analytics/funnel', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const query = Object.fromEntries(new URL(context.req.url).searchParams.entries());
    const parsed = analyticsRangeQuerySchema.safeParse(query);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid query params.');
    }

    let range: { start: Date; endExclusive: Date; startDate: string; endDate: string };
    try {
      range = resolveAnalyticsRange({
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
      });
    } catch (error) {
      return jsonError(context, 400, error instanceof Error ? error.message : 'Invalid range.');
    }

    const funnelWhere = [
      eq(analyticsFunnelEvents.organizerId, authedUser.id),
      gte(analyticsFunnelEvents.occurredAt, range.start),
      lt(analyticsFunnelEvents.occurredAt, range.endExclusive),
    ];
    if (parsed.data.eventTypeId) {
      funnelWhere.push(eq(analyticsFunnelEvents.eventTypeId, parsed.data.eventTypeId));
    }

    const bookingWhere = [
      eq(bookings.organizerId, authedUser.id),
      gte(bookings.createdAt, range.start),
      lt(bookings.createdAt, range.endExclusive),
      inArray(bookings.status, ['confirmed', 'canceled']),
    ];
    if (parsed.data.eventTypeId) {
      bookingWhere.push(eq(bookings.eventTypeId, parsed.data.eventTypeId));
    }

    const funnelDateBucket = sql<string>`to_char(timezone('utc', ${analyticsFunnelEvents.occurredAt}), 'YYYY-MM-DD')`;
    const bookingDateBucket = sql<string>`to_char(timezone('utc', ${bookings.createdAt}), 'YYYY-MM-DD')`;
    const bookingStatusBucket = sql<string>`case
      when ${bookings.rescheduledFromBookingId} is not null then 'rescheduled'
      else ${bookings.status}
    end`;

    const [funnelRows, bookingRows] = await Promise.all([
      db
        .select({
          stage: analyticsFunnelEvents.stage,
          eventTypeId: analyticsFunnelEvents.eventTypeId,
          date: funnelDateBucket.as('date'),
          count: sql<number>`count(*)::int`.as('count'),
        })
        .from(analyticsFunnelEvents)
        .where(and(...funnelWhere))
        .groupBy(analyticsFunnelEvents.stage, analyticsFunnelEvents.eventTypeId, funnelDateBucket),
      db
        .select({
          eventTypeId: bookings.eventTypeId,
          status: bookingStatusBucket.as('status'),
          date: bookingDateBucket.as('date'),
          count: sql<number>`count(*)::int`.as('count'),
        })
        .from(bookings)
        .where(and(...bookingWhere))
        .groupBy(bookings.eventTypeId, bookingStatusBucket, bookingDateBucket),
    ]);

    const eventTypeIds = Array.from(
      new Set([
        ...funnelRows.map((row) => row.eventTypeId),
        ...bookingRows.map((row) => row.eventTypeId),
      ]),
    );

    const eventTypeNameById = new Map<string, string>();
    if (eventTypeIds.length > 0) {
      const eventRows = await db
        .select({
          id: eventTypes.id,
          name: eventTypes.name,
        })
        .from(eventTypes)
        .where(inArray(eventTypes.id, eventTypeIds));
      for (const row of eventRows) {
        eventTypeNameById.set(row.id, row.name);
      }
    }

    const metrics = summarizeFunnelAnalytics({
      funnelRows,
      bookingRows,
      eventTypeNameById,
    });

    return context.json({
      ok: true,
      range: {
        startDate: range.startDate,
        endDate: range.endDate,
      },
      summary: metrics.summary,
      byEventType: metrics.byEventType,
      daily: metrics.daily,
    });
  });
});

app.get('/v0/analytics/team', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const query = Object.fromEntries(new URL(context.req.url).searchParams.entries());
    const parsed = analyticsRangeQuerySchema.safeParse(query);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid query params.');
    }

    let range: { start: Date; endExclusive: Date; startDate: string; endDate: string };
    try {
      range = resolveAnalyticsRange({
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
      });
    } catch (error) {
      return jsonError(context, 400, error instanceof Error ? error.message : 'Invalid range.');
    }

    const teamEventTypeWhere = [eq(teams.ownerUserId, authedUser.id)];
    if (parsed.data.teamId) {
      teamEventTypeWhere.push(eq(teamEventTypes.teamId, parsed.data.teamId));
    }
    if (parsed.data.eventTypeId) {
      teamEventTypeWhere.push(eq(teamEventTypes.eventTypeId, parsed.data.eventTypeId));
    }

    const teamEventTypeRows = await db
      .select({
        teamEventTypeId: teamEventTypes.id,
        teamId: teams.id,
        teamName: teams.name,
        mode: teamEventTypes.mode,
        eventTypeId: eventTypes.id,
        eventTypeName: eventTypes.name,
      })
      .from(teamEventTypes)
      .innerJoin(teams, eq(teams.id, teamEventTypes.teamId))
      .innerJoin(eventTypes, eq(eventTypes.id, teamEventTypes.eventTypeId))
      .where(and(...teamEventTypeWhere));

    if (teamEventTypeRows.length === 0) {
      return context.json({
        ok: true,
        range: {
          startDate: range.startDate,
          endDate: range.endDate,
        },
        roundRobinAssignments: [],
        collectiveBookings: [],
      });
    }

    const teamEventTypeById = new Map(
      teamEventTypeRows.map((row) => [row.teamEventTypeId, row] as const),
    );
    const teamEventTypeIdsByEventTypeId = new Map<string, string[]>();
    for (const row of teamEventTypeRows) {
      const existing = teamEventTypeIdsByEventTypeId.get(row.eventTypeId);
      if (existing) {
        existing.push(row.teamEventTypeId);
      } else {
        teamEventTypeIdsByEventTypeId.set(row.eventTypeId, [row.teamEventTypeId]);
      }
    }

    const bookingEventTypeIds = Array.from(teamEventTypeIdsByEventTypeId.keys());
    const teamBookingRows =
      bookingEventTypeIds.length === 0
        ? []
        : await db
            .select({
              bookingId: bookings.id,
              eventTypeId: bookings.eventTypeId,
              metadata: bookings.metadata,
            })
            .from(bookings)
            .where(
              and(
                inArray(bookings.eventTypeId, bookingEventTypeIds),
                gte(bookings.createdAt, range.start),
                lt(bookings.createdAt, range.endExclusive),
              ),
            );

    const bookingIds = teamBookingRows.map((row) => row.bookingId);
    const assignmentRows =
      bookingIds.length === 0
        ? []
        : await db
            .select({
              bookingId: teamBookingAssignments.bookingId,
              teamEventTypeId: teamBookingAssignments.teamEventTypeId,
              memberUserId: teamBookingAssignments.userId,
              memberDisplayName: users.displayName,
            })
            .from(teamBookingAssignments)
            .innerJoin(users, eq(users.id, teamBookingAssignments.userId))
            .where(inArray(teamBookingAssignments.bookingId, bookingIds));

    const assignmentRowsByBookingId = new Map<
      string,
      Array<{
        teamEventTypeId: string;
        memberUserId: string;
        memberDisplayName: string;
      }>
    >();
    for (const row of assignmentRows) {
      const existing = assignmentRowsByBookingId.get(row.bookingId);
      if (existing) {
        existing.push(row);
      } else {
        assignmentRowsByBookingId.set(row.bookingId, [row]);
      }
    }

    const metadataByBookingId = new Map<
      string,
      ReturnType<typeof parseBookingMetadata>['team'] | undefined
    >();
    const metadataMemberUserIds = new Set<string>();
    for (const row of teamBookingRows) {
      const parsedTeamMetadata = parseBookingMetadata(row.metadata, normalizeTimezone).team;
      metadataByBookingId.set(row.bookingId, parsedTeamMetadata);
      for (const memberUserId of parsedTeamMetadata?.assignmentUserIds ?? []) {
        metadataMemberUserIds.add(memberUserId);
      }
    }

    const memberDisplayNameByUserId = new Map<string, string>();
    for (const row of assignmentRows) {
      memberDisplayNameByUserId.set(row.memberUserId, row.memberDisplayName);
    }

    const missingMemberUserIds = Array.from(metadataMemberUserIds).filter(
      (memberUserId) => !memberDisplayNameByUserId.has(memberUserId),
    );
    if (missingMemberUserIds.length > 0) {
      const missingMemberRows = await db
        .select({
          id: users.id,
          displayName: users.displayName,
        })
        .from(users)
        .where(inArray(users.id, missingMemberUserIds));
      for (const row of missingMemberRows) {
        memberDisplayNameByUserId.set(row.id, row.displayName);
      }
    }

    const roundRobinRows: Array<{
      teamEventTypeId: string;
      memberUserId: string;
      memberDisplayName: string;
    }> = [];
    const collectiveRows: Array<{
      bookingId: string;
      teamEventTypeId: string;
    }> = [];

    for (const row of teamBookingRows) {
      const bookingAssignmentRows = assignmentRowsByBookingId.get(row.bookingId) ?? [];
      const parsedTeamMetadata = metadataByBookingId.get(row.bookingId);

      let teamEventTypeId: string | null = null;
      if (
        parsedTeamMetadata?.teamEventTypeId &&
        teamEventTypeById.has(parsedTeamMetadata.teamEventTypeId)
      ) {
        teamEventTypeId = parsedTeamMetadata.teamEventTypeId;
      } else if (bookingAssignmentRows.length > 0) {
        teamEventTypeId = bookingAssignmentRows[0]?.teamEventTypeId ?? null;
      } else {
        const fallbackTeamEventTypeIds = teamEventTypeIdsByEventTypeId.get(row.eventTypeId) ?? [];
        if (fallbackTeamEventTypeIds.length === 1) {
          teamEventTypeId = fallbackTeamEventTypeIds[0] ?? null;
        }
      }

      if (!teamEventTypeId) {
        continue;
      }

      const teamEventTypeMeta = teamEventTypeById.get(teamEventTypeId);
      if (!teamEventTypeMeta) {
        continue;
      }

      const mode = parsedTeamMetadata?.mode ?? teamEventTypeMeta.mode;
      if (mode === 'collective') {
        collectiveRows.push({
          bookingId: row.bookingId,
          teamEventTypeId,
        });
        continue;
      }

      const assignmentSource =
        bookingAssignmentRows.length > 0
          ? bookingAssignmentRows
              .filter((assignment) => assignment.teamEventTypeId === teamEventTypeId)
              .map((assignment) => ({
                memberUserId: assignment.memberUserId,
                memberDisplayName: assignment.memberDisplayName,
              }))
          : (parsedTeamMetadata?.assignmentUserIds ?? []).map((memberUserId) => ({
              memberUserId,
              memberDisplayName:
                memberDisplayNameByUserId.get(memberUserId) ?? 'Unknown Member',
            }));

      for (const assignment of assignmentSource) {
        roundRobinRows.push({
          teamEventTypeId,
          memberUserId: assignment.memberUserId,
          memberDisplayName: assignment.memberDisplayName,
        });
      }
    }

    const metrics = summarizeTeamAnalytics({
      teamEventTypeRows,
      roundRobinRows,
      collectiveRows,
    });

    return context.json({
      ok: true,
      range: {
        startDate: range.startDate,
        endDate: range.endDate,
      },
      roundRobinAssignments: metrics.roundRobinAssignments,
      collectiveBookings: metrics.collectiveBookings,
    });
  });
});

app.get('/v0/analytics/operator/health', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const query = Object.fromEntries(new URL(context.req.url).searchParams.entries());
    const parsed = analyticsRangeQuerySchema.safeParse(query);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid query params.');
    }

    let range: { start: Date; endExclusive: Date; startDate: string; endDate: string };
    try {
      range = resolveAnalyticsRange({
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
      });
    } catch (error) {
      return jsonError(context, 400, error instanceof Error ? error.message : 'Invalid range.');
    }

    const [webhookRows, emailRows] = await Promise.all([
      db
        .select({
          status: webhookDeliveries.status,
          count: sql<number>`count(*)::int`.as('count'),
        })
        .from(webhookDeliveries)
        .innerJoin(webhookSubscriptions, eq(webhookSubscriptions.id, webhookDeliveries.subscriptionId))
        .where(
          and(
            eq(webhookSubscriptions.userId, authedUser.id),
            gte(webhookDeliveries.createdAt, range.start),
            lt(webhookDeliveries.createdAt, range.endExclusive),
          ),
        )
        .groupBy(webhookDeliveries.status),
      db
        .select({
          status: emailDeliveries.status,
          emailType: emailDeliveries.emailType,
          count: sql<number>`count(*)::int`.as('count'),
        })
        .from(emailDeliveries)
        .where(
          and(
            eq(emailDeliveries.organizerId, authedUser.id),
            gte(emailDeliveries.createdAt, range.start),
            lt(emailDeliveries.createdAt, range.endExclusive),
          ),
        )
        .groupBy(emailDeliveries.status, emailDeliveries.emailType),
    ]);

    const metrics = summarizeOperatorHealth({
      webhookRows,
      emailRows,
    });

    return context.json({
      ok: true,
      range: {
        startDate: range.startDate,
        endDate: range.endDate,
      },
      webhookDeliveries: metrics.webhookDeliveries,
      emailDeliveries: metrics.emailDeliveries,
    });
  });
});

app.get('/v0/calendar/sync/status', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const rows = await db
      .select({
        provider: calendarConnections.provider,
        externalEmail: calendarConnections.externalEmail,
        lastSyncedAt: calendarConnections.lastSyncedAt,
        nextSyncAt: calendarConnections.nextSyncAt,
        lastError: calendarConnections.lastError,
      })
      .from(calendarConnections)
      .where(eq(calendarConnections.userId, authedUser.id))
      .orderBy(asc(calendarConnections.createdAt));

    const statuses = rows
      .map((row) => {
        const provider = toCalendarProvider(row.provider);
        if (!provider) {
          return null;
        }
        return toCalendarConnectionStatus({
          provider,
          externalEmail: row.externalEmail,
          lastSyncedAt: row.lastSyncedAt,
          nextSyncAt: row.nextSyncAt,
          lastError: row.lastError,
        });
      })
      .filter((status): status is CalendarConnectionStatus => status !== null);

    const requiredProviders: CalendarProvider[] = [
      GOOGLE_CALENDAR_PROVIDER,
      MICROSOFT_CALENDAR_PROVIDER,
    ];
    for (const provider of requiredProviders) {
      if (!statuses.some((status) => status.provider === provider)) {
        statuses.push({
          provider,
          connected: false,
          externalEmail: null,
          lastSyncedAt: null,
          nextSyncAt: null,
          lastError: null,
        });
      }
    }

    return context.json({
      ok: true,
      providers: statuses,
    });
  });
});

app.post('/v0/calendar/google/connect/start', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const body = await context.req.json().catch(() => null);
    const parsed = calendarConnectStartSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const googleConfig = resolveGoogleOAuthConfig(context.env);
    const encryptionSecret = resolveCalendarEncryptionSecret(context.env);
    if (!googleConfig || !encryptionSecret) {
      return jsonError(
        context,
        500,
        'Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and SESSION_SECRET.',
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + CALENDAR_OAUTH_STATE_TTL_MINUTES * 60_000);
    const state = createCalendarOAuthState({
      userId: authedUser.id,
      provider: GOOGLE_CALENDAR_PROVIDER,
      redirectUri: parsed.data.redirectUri,
      expiresAt,
      secret: encryptionSecret,
    });

    const authUrl = buildGoogleAuthorizationUrl({
      clientId: googleConfig.clientId,
      redirectUri: parsed.data.redirectUri,
      state,
    });

    return context.json({
      ok: true,
      provider: GOOGLE_CALENDAR_PROVIDER,
      authUrl,
      state,
      expiresAt: expiresAt.toISOString(),
    });
  });
});

app.post('/v0/calendar/google/connect/complete', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const body = await context.req.json().catch(() => null);
    const parsed = calendarConnectCompleteSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const googleConfig = resolveGoogleOAuthConfig(context.env);
    const encryptionSecret = resolveCalendarEncryptionSecret(context.env);
    if (!googleConfig || !encryptionSecret) {
      return jsonError(
        context,
        500,
        'Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and SESSION_SECRET.',
      );
    }

    const state = verifyCalendarOAuthState({
      token: parsed.data.state,
      secret: encryptionSecret,
      now: new Date(),
    });
    if (
      !state ||
      state.provider !== GOOGLE_CALENDAR_PROVIDER ||
      state.userId !== authedUser.id ||
      state.redirectUri !== parsed.data.redirectUri
    ) {
      return jsonError(context, 400, 'OAuth state is invalid or expired.');
    }

    try {
      const tokenPayload = await exchangeGoogleOAuthCode({
        clientId: googleConfig.clientId,
        clientSecret: googleConfig.clientSecret,
        code: parsed.data.code,
        redirectUri: parsed.data.redirectUri,
      });
      const profile = await fetchGoogleUserProfile(tokenPayload.access_token);

      const existingConnection = await db
        .select({
          id: calendarConnections.id,
          refreshTokenEncrypted: calendarConnections.refreshTokenEncrypted,
        })
        .from(calendarConnections)
        .where(
          and(
            eq(calendarConnections.userId, authedUser.id),
            eq(calendarConnections.provider, GOOGLE_CALENDAR_PROVIDER),
          ),
        )
        .limit(1);

      const refreshTokenEncrypted =
        tokenPayload.refresh_token && tokenPayload.refresh_token.length > 0
          ? encryptSecret(tokenPayload.refresh_token, encryptionSecret)
          : existingConnection[0]?.refreshTokenEncrypted ?? null;

      if (!refreshTokenEncrypted) {
        return jsonError(
          context,
          400,
          'Google did not return a refresh token. Reconnect with prompt=consent to grant offline access.',
        );
      }

      const now = new Date();
      const accessTokenExpiresAt = new Date(now.getTime() + tokenPayload.expires_in * 1000);

      await db
        .insert(calendarConnections)
        .values({
          userId: authedUser.id,
          provider: GOOGLE_CALENDAR_PROVIDER,
          externalAccountId: profile.sub,
          externalEmail: profile.email ?? null,
          accessTokenEncrypted: encryptSecret(tokenPayload.access_token, encryptionSecret),
          refreshTokenEncrypted,
          accessTokenExpiresAt,
          scope: tokenPayload.scope ?? null,
          lastError: null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [calendarConnections.userId, calendarConnections.provider],
          set: {
            externalAccountId: profile.sub,
            externalEmail: profile.email ?? null,
            accessTokenEncrypted: encryptSecret(tokenPayload.access_token, encryptionSecret),
            refreshTokenEncrypted,
            accessTokenExpiresAt,
            scope: tokenPayload.scope ?? null,
            lastError: null,
            updatedAt: now,
          },
        });

      const [connection] = await db
        .select({
          provider: calendarConnections.provider,
          externalEmail: calendarConnections.externalEmail,
          lastSyncedAt: calendarConnections.lastSyncedAt,
          nextSyncAt: calendarConnections.nextSyncAt,
          lastError: calendarConnections.lastError,
        })
        .from(calendarConnections)
        .where(
          and(
            eq(calendarConnections.userId, authedUser.id),
            eq(calendarConnections.provider, GOOGLE_CALENDAR_PROVIDER),
          ),
        )
        .limit(1);

      if (!connection) {
        return jsonError(context, 500, 'Unable to persist calendar connection.');
      }

      return context.json({
        ok: true,
        connection: toCalendarConnectionStatus({
          provider: GOOGLE_CALENDAR_PROVIDER,
          externalEmail: connection.externalEmail,
          lastSyncedAt: connection.lastSyncedAt,
          nextSyncAt: connection.nextSyncAt,
          lastError: connection.lastError,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google OAuth exchange failed.';
      return jsonError(context, 502, message);
    }
  });
});

app.post('/v0/calendar/google/disconnect', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const disconnected = await db.transaction(async (transaction) => {
      const rows = await transaction
        .select({
          id: calendarConnections.id,
        })
        .from(calendarConnections)
        .where(
          and(
            eq(calendarConnections.userId, authedUser.id),
            eq(calendarConnections.provider, GOOGLE_CALENDAR_PROVIDER),
          ),
        );

      if (rows.length === 0) {
        return false;
      }

      const connectionIds = rows.map((row) => row.id);

      await transaction
        .delete(calendarBusyWindows)
        .where(inArray(calendarBusyWindows.connectionId, connectionIds));

      await transaction
        .update(bookingExternalEvents)
        .set({
          connectionId: null,
          updatedAt: new Date(),
        })
        .where(inArray(bookingExternalEvents.connectionId, connectionIds));

      await transaction
        .delete(calendarConnections)
        .where(inArray(calendarConnections.id, connectionIds));

      return true;
    });

    return context.json({
      ok: true,
      provider: GOOGLE_CALENDAR_PROVIDER,
      disconnected,
    });
  });
});

app.post('/v0/calendar/google/sync', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    let body: unknown = {};
    const rawBody = await context.req.text();
    if (rawBody.trim().length > 0) {
      try {
        body = JSON.parse(rawBody) as unknown;
      } catch {
        return jsonError(context, 400, 'Malformed JSON body.');
      }
    }

    const parsed = calendarSyncRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const googleConfig = resolveGoogleOAuthConfig(context.env);
    const encryptionSecret = resolveCalendarEncryptionSecret(context.env);
    if (!googleConfig || !encryptionSecret) {
      return jsonError(
        context,
        500,
        'Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and SESSION_SECRET.',
      );
    }

    const [connection] = await db
      .select({
        id: calendarConnections.id,
        accessTokenEncrypted: calendarConnections.accessTokenEncrypted,
        refreshTokenEncrypted: calendarConnections.refreshTokenEncrypted,
        accessTokenExpiresAt: calendarConnections.accessTokenExpiresAt,
      })
      .from(calendarConnections)
      .where(
        and(
          eq(calendarConnections.userId, authedUser.id),
          eq(calendarConnections.provider, GOOGLE_CALENDAR_PROVIDER),
        ),
      )
      .limit(1);

    if (!connection) {
      return jsonError(context, 404, 'Google calendar is not connected.');
    }

    const now = new Date();
    let range: { startIso: string; endIso: string };
    try {
      range = resolveGoogleSyncRange(now, parsed.data.start, parsed.data.end);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync range is invalid.';
      return jsonError(context, 400, message);
    }

    try {
      const token = await resolveGoogleAccessToken({
        connection,
        encryptionSecret,
        clientId: googleConfig.clientId,
        clientSecret: googleConfig.clientSecret,
        now,
      });

      const busyWindows = await syncGoogleBusyWindows({
        accessToken: token.accessToken,
        startIso: range.startIso,
        endIso: range.endIso,
      });

      const nextSyncAt = new Date(now.getTime() + CALENDAR_SYNC_NEXT_MINUTES * 60_000);
      const dedupedBusyWindows = Array.from(
        busyWindows.reduce((map, window) => {
          map.set(`${window.startsAt.toISOString()}|${window.endsAt.toISOString()}`, window);
          return map;
        }, new Map<string, { startsAt: Date; endsAt: Date }>())
          .values(),
      );

      await db.transaction(async (transaction) => {
        await transaction.execute(sql`select id from users where id = ${authedUser.id} for update`);

        await transaction
          .delete(calendarBusyWindows)
          .where(
            and(
              eq(calendarBusyWindows.connectionId, connection.id),
              lt(calendarBusyWindows.startsAt, new Date(range.endIso)),
              gt(calendarBusyWindows.endsAt, new Date(range.startIso)),
            ),
          );

        if (dedupedBusyWindows.length > 0) {
          await transaction.insert(calendarBusyWindows).values(
            dedupedBusyWindows.map((window) => ({
              connectionId: connection.id,
              userId: authedUser.id,
              provider: GOOGLE_CALENDAR_PROVIDER,
              startsAt: window.startsAt,
              endsAt: window.endsAt,
            })),
          );
        }

        await transaction
          .update(calendarConnections)
          .set({
            accessTokenEncrypted: encryptSecret(token.accessToken, encryptionSecret),
            refreshTokenEncrypted: encryptSecret(token.refreshToken, encryptionSecret),
            accessTokenExpiresAt: token.accessTokenExpiresAt,
            lastSyncedAt: now,
            nextSyncAt,
            lastError: null,
            updatedAt: now,
          })
          .where(eq(calendarConnections.id, connection.id));
      });

      return context.json({
        ok: true,
        provider: GOOGLE_CALENDAR_PROVIDER,
        syncWindow: range,
        busyWindowCount: dedupedBusyWindows.length,
        refreshedAccessToken: token.refreshed,
        lastSyncedAt: now.toISOString(),
        nextSyncAt: nextSyncAt.toISOString(),
      });
    } catch (error) {
      const message = (error instanceof Error ? error.message : 'Calendar sync failed.').slice(0, 1000);
      const nextSyncAt = new Date(now.getTime() + CALENDAR_SYNC_NEXT_MINUTES * 60_000);

      await db
        .update(calendarConnections)
        .set({
          lastError: message,
          nextSyncAt,
          updatedAt: now,
        })
        .where(eq(calendarConnections.id, connection.id));

      return jsonError(context, 502, message);
    }
  });
});

app.post('/v0/calendar/microsoft/connect/start', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const body = await context.req.json().catch(() => null);
    const parsed = calendarConnectStartSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const microsoftConfig = resolveMicrosoftOAuthConfig(context.env);
    const encryptionSecret = resolveCalendarEncryptionSecret(context.env);
    if (!microsoftConfig || !encryptionSecret) {
      return jsonError(
        context,
        500,
        'Microsoft OAuth is not configured. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and SESSION_SECRET.',
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + CALENDAR_OAUTH_STATE_TTL_MINUTES * 60_000);
    const state = createCalendarOAuthState({
      userId: authedUser.id,
      provider: MICROSOFT_CALENDAR_PROVIDER,
      redirectUri: parsed.data.redirectUri,
      expiresAt,
      secret: encryptionSecret,
    });

    const authUrl = buildMicrosoftAuthorizationUrl({
      clientId: microsoftConfig.clientId,
      redirectUri: parsed.data.redirectUri,
      state,
    });

    return context.json({
      ok: true,
      provider: MICROSOFT_CALENDAR_PROVIDER,
      authUrl,
      state,
      expiresAt: expiresAt.toISOString(),
    });
  });
});

app.post('/v0/calendar/microsoft/connect/complete', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const body = await context.req.json().catch(() => null);
    const parsed = calendarConnectCompleteSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const microsoftConfig = resolveMicrosoftOAuthConfig(context.env);
    const encryptionSecret = resolveCalendarEncryptionSecret(context.env);
    if (!microsoftConfig || !encryptionSecret) {
      return jsonError(
        context,
        500,
        'Microsoft OAuth is not configured. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and SESSION_SECRET.',
      );
    }

    const state = verifyCalendarOAuthState({
      token: parsed.data.state,
      secret: encryptionSecret,
      now: new Date(),
    });
    if (
      !state ||
      state.provider !== MICROSOFT_CALENDAR_PROVIDER ||
      state.userId !== authedUser.id ||
      state.redirectUri !== parsed.data.redirectUri
    ) {
      return jsonError(context, 400, 'OAuth state is invalid or expired.');
    }

    try {
      const tokenPayload = await exchangeMicrosoftOAuthCode({
        clientId: microsoftConfig.clientId,
        clientSecret: microsoftConfig.clientSecret,
        code: parsed.data.code,
        redirectUri: parsed.data.redirectUri,
      });
      const profile = await fetchMicrosoftUserProfile(tokenPayload.access_token);

      const existingConnection = await db
        .select({
          id: calendarConnections.id,
          refreshTokenEncrypted: calendarConnections.refreshTokenEncrypted,
        })
        .from(calendarConnections)
        .where(
          and(
            eq(calendarConnections.userId, authedUser.id),
            eq(calendarConnections.provider, MICROSOFT_CALENDAR_PROVIDER),
          ),
        )
        .limit(1);

      const refreshTokenEncrypted =
        tokenPayload.refresh_token && tokenPayload.refresh_token.length > 0
          ? encryptSecret(tokenPayload.refresh_token, encryptionSecret)
          : existingConnection[0]?.refreshTokenEncrypted ?? null;

      if (!refreshTokenEncrypted) {
        return jsonError(
          context,
          400,
          'Microsoft did not return a refresh token. Reconnect and approve offline access.',
        );
      }

      const now = new Date();
      const accessTokenExpiresAt = new Date(now.getTime() + tokenPayload.expires_in * 1000);

      await db
        .insert(calendarConnections)
        .values({
          userId: authedUser.id,
          provider: MICROSOFT_CALENDAR_PROVIDER,
          externalAccountId: profile.sub,
          externalEmail: profile.email ?? null,
          accessTokenEncrypted: encryptSecret(tokenPayload.access_token, encryptionSecret),
          refreshTokenEncrypted,
          accessTokenExpiresAt,
          scope: tokenPayload.scope ?? null,
          lastError: null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [calendarConnections.userId, calendarConnections.provider],
          set: {
            externalAccountId: profile.sub,
            externalEmail: profile.email ?? null,
            accessTokenEncrypted: encryptSecret(tokenPayload.access_token, encryptionSecret),
            refreshTokenEncrypted,
            accessTokenExpiresAt,
            scope: tokenPayload.scope ?? null,
            lastError: null,
            updatedAt: now,
          },
        });

      const [connection] = await db
        .select({
          provider: calendarConnections.provider,
          externalEmail: calendarConnections.externalEmail,
          lastSyncedAt: calendarConnections.lastSyncedAt,
          nextSyncAt: calendarConnections.nextSyncAt,
          lastError: calendarConnections.lastError,
        })
        .from(calendarConnections)
        .where(
          and(
            eq(calendarConnections.userId, authedUser.id),
            eq(calendarConnections.provider, MICROSOFT_CALENDAR_PROVIDER),
          ),
        )
        .limit(1);

      if (!connection) {
        return jsonError(context, 500, 'Unable to persist calendar connection.');
      }

      return context.json({
        ok: true,
        connection: toCalendarConnectionStatus({
          provider: MICROSOFT_CALENDAR_PROVIDER,
          externalEmail: connection.externalEmail,
          lastSyncedAt: connection.lastSyncedAt,
          nextSyncAt: connection.nextSyncAt,
          lastError: connection.lastError,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Microsoft OAuth exchange failed.';
      return jsonError(context, 502, message);
    }
  });
});

app.post('/v0/calendar/microsoft/disconnect', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const disconnected = await db.transaction(async (transaction) => {
      const rows = await transaction
        .select({
          id: calendarConnections.id,
        })
        .from(calendarConnections)
        .where(
          and(
            eq(calendarConnections.userId, authedUser.id),
            eq(calendarConnections.provider, MICROSOFT_CALENDAR_PROVIDER),
          ),
        );

      if (rows.length === 0) {
        return false;
      }

      const connectionIds = rows.map((row) => row.id);

      await transaction
        .delete(calendarBusyWindows)
        .where(inArray(calendarBusyWindows.connectionId, connectionIds));

      await transaction
        .update(bookingExternalEvents)
        .set({
          connectionId: null,
          updatedAt: new Date(),
        })
        .where(inArray(bookingExternalEvents.connectionId, connectionIds));

      await transaction
        .delete(calendarConnections)
        .where(inArray(calendarConnections.id, connectionIds));

      return true;
    });

    return context.json({
      ok: true,
      provider: MICROSOFT_CALENDAR_PROVIDER,
      disconnected,
    });
  });
});

app.post('/v0/calendar/microsoft/sync', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    let body: unknown = {};
    const rawBody = await context.req.text();
    if (rawBody.trim().length > 0) {
      try {
        body = JSON.parse(rawBody) as unknown;
      } catch {
        return jsonError(context, 400, 'Malformed JSON body.');
      }
    }
    const parsed = calendarSyncRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const microsoftConfig = resolveMicrosoftOAuthConfig(context.env);
    const encryptionSecret = resolveCalendarEncryptionSecret(context.env);
    if (!microsoftConfig || !encryptionSecret) {
      return jsonError(
        context,
        500,
        'Microsoft OAuth is not configured. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and SESSION_SECRET.',
      );
    }

    const [connection] = await db
      .select({
        id: calendarConnections.id,
        accessTokenEncrypted: calendarConnections.accessTokenEncrypted,
        refreshTokenEncrypted: calendarConnections.refreshTokenEncrypted,
        accessTokenExpiresAt: calendarConnections.accessTokenExpiresAt,
      })
      .from(calendarConnections)
      .where(
        and(
          eq(calendarConnections.userId, authedUser.id),
          eq(calendarConnections.provider, MICROSOFT_CALENDAR_PROVIDER),
        ),
      )
      .limit(1);

    if (!connection) {
      return jsonError(context, 404, 'Microsoft calendar is not connected.');
    }

    const now = new Date();
    let range: { startIso: string; endIso: string };
    try {
      range = resolveGoogleSyncRange(now, parsed.data.start, parsed.data.end);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync range is invalid.';
      return jsonError(context, 400, message);
    }

    try {
      const token = await resolveMicrosoftAccessToken({
        connection,
        encryptionSecret,
        clientId: microsoftConfig.clientId,
        clientSecret: microsoftConfig.clientSecret,
        now,
      });

      const busyWindows = await syncMicrosoftBusyWindows({
        accessToken: token.accessToken,
        scheduleSmtp: authedUser.email,
        startIso: range.startIso,
        endIso: range.endIso,
      });

      const nextSyncAt = new Date(now.getTime() + CALENDAR_SYNC_NEXT_MINUTES * 60_000);
      const dedupedBusyWindows = Array.from(
        busyWindows.reduce((map, window) => {
          map.set(`${window.startsAt.toISOString()}|${window.endsAt.toISOString()}`, window);
          return map;
        }, new Map<string, { startsAt: Date; endsAt: Date }>())
          .values(),
      );

      await db.transaction(async (transaction) => {
        await transaction.execute(sql`select id from users where id = ${authedUser.id} for update`);

        await transaction
          .delete(calendarBusyWindows)
          .where(
            and(
              eq(calendarBusyWindows.connectionId, connection.id),
              lt(calendarBusyWindows.startsAt, new Date(range.endIso)),
              gt(calendarBusyWindows.endsAt, new Date(range.startIso)),
            ),
          );

        if (dedupedBusyWindows.length > 0) {
          await transaction.insert(calendarBusyWindows).values(
            dedupedBusyWindows.map((window) => ({
              connectionId: connection.id,
              userId: authedUser.id,
              provider: MICROSOFT_CALENDAR_PROVIDER,
              startsAt: window.startsAt,
              endsAt: window.endsAt,
            })),
          );
        }

        await transaction
          .update(calendarConnections)
          .set({
            accessTokenEncrypted: encryptSecret(token.accessToken, encryptionSecret),
            refreshTokenEncrypted: encryptSecret(token.refreshToken, encryptionSecret),
            accessTokenExpiresAt: token.accessTokenExpiresAt,
            lastSyncedAt: now,
            nextSyncAt,
            lastError: null,
            updatedAt: now,
          })
          .where(eq(calendarConnections.id, connection.id));
      });

      return context.json({
        ok: true,
        provider: MICROSOFT_CALENDAR_PROVIDER,
        syncWindow: range,
        busyWindowCount: dedupedBusyWindows.length,
        refreshedAccessToken: token.refreshed,
        lastSyncedAt: now.toISOString(),
        nextSyncAt: nextSyncAt.toISOString(),
      });
    } catch (error) {
      const message = (error instanceof Error ? error.message : 'Calendar sync failed.').slice(0, 1000);
      const nextSyncAt = new Date(now.getTime() + CALENDAR_SYNC_NEXT_MINUTES * 60_000);

      await db
        .update(calendarConnections)
        .set({
          lastError: message,
          nextSyncAt,
          updatedAt: now,
        })
        .where(eq(calendarConnections.id, connection.id));

      return jsonError(context, 502, message);
    }
  });
});

app.get('/v0/calendar/writeback/status', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const rows = await db
      .select({
        status: bookingExternalEvents.status,
      })
      .from(bookingExternalEvents)
      .where(eq(bookingExternalEvents.organizerId, authedUser.id));

    const summary = rows.reduce(
      (acc, row) => {
        if (row.status === 'succeeded') {
          acc.succeeded += 1;
        } else if (row.status === 'failed') {
          acc.failed += 1;
        } else {
          acc.pending += 1;
        }
        return acc;
      },
      {
        pending: 0,
        succeeded: 0,
        failed: 0,
      },
    );

    const failures = await db
      .select({
        id: bookingExternalEvents.id,
        bookingId: bookingExternalEvents.bookingId,
        provider: bookingExternalEvents.provider,
        operation: bookingExternalEvents.operation,
        attemptCount: bookingExternalEvents.attemptCount,
        maxAttempts: bookingExternalEvents.maxAttempts,
        nextAttemptAt: bookingExternalEvents.nextAttemptAt,
        lastAttemptAt: bookingExternalEvents.lastAttemptAt,
        lastError: bookingExternalEvents.lastError,
        updatedAt: bookingExternalEvents.updatedAt,
      })
      .from(bookingExternalEvents)
      .where(
        and(
          eq(bookingExternalEvents.organizerId, authedUser.id),
          eq(bookingExternalEvents.status, 'failed'),
        ),
      )
      .orderBy(desc(bookingExternalEvents.updatedAt))
      .limit(20);

    return context.json({
      ok: true,
      summary,
      failures: failures.map((failure) => ({
        id: failure.id,
        bookingId: failure.bookingId,
        provider: failure.provider,
        operation: failure.operation,
        attemptCount: failure.attemptCount,
        maxAttempts: failure.maxAttempts,
        nextAttemptAt: failure.nextAttemptAt.toISOString(),
        lastAttemptAt: failure.lastAttemptAt ? failure.lastAttemptAt.toISOString() : null,
        lastError: failure.lastError,
        updatedAt: failure.updatedAt.toISOString(),
      })),
    });
  });
});

app.post('/v0/calendar/writeback/run', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    let body: unknown = {};
    const rawBody = await context.req.text();
    if (rawBody.trim().length > 0) {
      try {
        body = JSON.parse(rawBody) as unknown;
      } catch {
        return jsonError(context, 400, 'Malformed JSON body.');
      }
    }

    const parsed = calendarWritebackRunSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const limit = clampCalendarWritebackBatchLimit(parsed.data.limit ?? context.req.query('limit'));
    const outcome = await runCalendarWritebackBatch(db, context.env, {
      organizerId: authedUser.id,
      limit,
    });

    return context.json({
      ok: true,
      limit,
      ...outcome,
    });
  });
});

app.get('/v0/embed/widget.js', async (context) => {
  return withDatabase(context, async (db) => {
    const username = context.req.query('username')?.trim().toLowerCase();
    const eventSlug = context.req.query('eventSlug')?.trim().toLowerCase();

    if (!username || !eventSlug) {
      return jsonError(context, 400, 'username and eventSlug query params are required.');
    }

    const eventView = await findPublicEventView(db, username, eventSlug);
    if (!eventView) {
      return jsonError(context, 404, 'Event type not found.');
    }

    const timezone = context.req.query('timezone')?.trim();
    const theme = resolveEmbedTheme(context.req.query('theme'));
    const appBaseUrl = resolveAppBaseUrl(context.env, context.req.raw);
    const iframeUrl = new URL(
      `/${encodeURIComponent(username)}/${encodeURIComponent(eventSlug)}`,
      appBaseUrl,
    );

    iframeUrl.searchParams.set('embed', '1');
    iframeUrl.searchParams.set('theme', theme);
    if (timezone) {
      iframeUrl.searchParams.set('timezone', timezone);
    }

    const script = buildEmbedWidgetScript({
      iframeSrc: iframeUrl.toString(),
      theme,
      ...(timezone ? { timezone } : {}),
    });

    return new Response(script, {
      status: 200,
      headers: {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'public, max-age=60',
      },
    });
  });
});

app.get('/v0/webhooks', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const rows = await db
      .select({
        id: webhookSubscriptions.id,
        url: webhookSubscriptions.url,
        events: webhookSubscriptions.events,
        isActive: webhookSubscriptions.isActive,
        createdAt: webhookSubscriptions.createdAt,
        updatedAt: webhookSubscriptions.updatedAt,
      })
      .from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.userId, authedUser.id))
      .orderBy(desc(webhookSubscriptions.createdAt));

    return context.json({
      ok: true,
      webhooks: rows.map((row) => ({
        id: row.id,
        url: row.url,
        events: parseWebhookEventTypes(row.events),
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    });
  });
});

app.post('/v0/webhooks', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const body = await context.req.json().catch(() => null);
    const parsed = webhookSubscriptionCreateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    try {
      const [inserted] = await db
        .insert(webhookSubscriptions)
        .values({
          userId: authedUser.id,
          url: parsed.data.url,
          secret: parsed.data.secret,
          events: normalizeWebhookEvents(parsed.data.events),
          isActive: true,
        })
        .returning({
          id: webhookSubscriptions.id,
          url: webhookSubscriptions.url,
          events: webhookSubscriptions.events,
          isActive: webhookSubscriptions.isActive,
          createdAt: webhookSubscriptions.createdAt,
          updatedAt: webhookSubscriptions.updatedAt,
        });

      if (!inserted) {
        return jsonError(context, 500, 'Failed to create webhook subscription.');
      }

      return context.json({
        ok: true,
        webhook: {
          id: inserted.id,
          url: inserted.url,
          events: parseWebhookEventTypes(inserted.events),
          isActive: inserted.isActive,
          createdAt: inserted.createdAt.toISOString(),
          updatedAt: inserted.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error, 'webhook_subscriptions_user_url_unique')) {
        return jsonError(context, 409, 'A webhook subscription with that URL already exists.');
      }
      throw error;
    }
  });
});

app.patch('/v0/webhooks/:id', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const body = await context.req.json().catch(() => null);
    const parsed = webhookSubscriptionUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const updateValues: Partial<typeof webhookSubscriptions.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (parsed.data.url !== undefined) {
      updateValues.url = parsed.data.url;
    }
    if (parsed.data.secret !== undefined) {
      updateValues.secret = parsed.data.secret;
    }
    if (parsed.data.events !== undefined) {
      updateValues.events = normalizeWebhookEvents(parsed.data.events);
    }
    if (parsed.data.isActive !== undefined) {
      updateValues.isActive = parsed.data.isActive;
    }

    try {
      const [updated] = await db
        .update(webhookSubscriptions)
        .set(updateValues)
        .where(
          and(eq(webhookSubscriptions.id, context.req.param('id')), eq(webhookSubscriptions.userId, authedUser.id)),
        )
        .returning({
          id: webhookSubscriptions.id,
          url: webhookSubscriptions.url,
          events: webhookSubscriptions.events,
          isActive: webhookSubscriptions.isActive,
          createdAt: webhookSubscriptions.createdAt,
          updatedAt: webhookSubscriptions.updatedAt,
        });

      if (!updated) {
        return jsonError(context, 404, 'Webhook subscription not found.');
      }

      return context.json({
        ok: true,
        webhook: {
          id: updated.id,
          url: updated.url,
          events: parseWebhookEventTypes(updated.events),
          isActive: updated.isActive,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error, 'webhook_subscriptions_user_url_unique')) {
        return jsonError(context, 409, 'A webhook subscription with that URL already exists.');
      }
      throw error;
    }
  });
});

app.post('/v0/webhooks/deliveries/run', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const limit = clampWebhookDeliveryBatchLimit(context.req.query('limit'));

    const dueRows = await db
      .select({
        id: webhookDeliveries.id,
        subscriptionId: webhookDeliveries.subscriptionId,
        eventId: webhookDeliveries.eventId,
        eventType: webhookDeliveries.eventType,
        payload: webhookDeliveries.payload,
        attemptCount: webhookDeliveries.attemptCount,
        maxAttempts: webhookDeliveries.maxAttempts,
        url: webhookSubscriptions.url,
        secret: webhookSubscriptions.secret,
      })
      .from(webhookDeliveries)
      .innerJoin(webhookSubscriptions, eq(webhookSubscriptions.id, webhookDeliveries.subscriptionId))
      .where(
        and(
          eq(webhookSubscriptions.userId, authedUser.id),
          eq(webhookDeliveries.status, 'pending'),
          lte(webhookDeliveries.nextAttemptAt, new Date()),
        ),
      )
      .orderBy(webhookDeliveries.nextAttemptAt)
      .limit(limit);

    const deliveries: PendingWebhookDelivery[] = [];
    let failed = 0;
    for (const row of dueRows) {
      const eventType = parseWebhookEventTypes([row.eventType])[0];
      const payload = webhookEventSchema.safeParse(row.payload);
      if (!eventType || !payload.success) {
        const now = new Date();
        await db
          .update(webhookDeliveries)
          .set({
            status: 'failed',
            attemptCount: row.maxAttempts,
            lastAttemptAt: now,
            lastError: 'Delivery payload failed validation.',
            nextAttemptAt: now,
            updatedAt: now,
          })
          .where(eq(webhookDeliveries.id, row.id));
        failed += 1;
        continue;
      }

      deliveries.push({
        id: row.id,
        subscriptionId: row.subscriptionId,
        url: row.url,
        secret: row.secret,
        eventId: row.eventId,
        eventType,
        payload: payload.data,
        attemptCount: row.attemptCount,
        maxAttempts: row.maxAttempts,
      });
    }

    let succeeded = 0;
    let retried = 0;

    for (const delivery of deliveries) {
      const outcome = await executeWebhookDelivery(db, delivery);
      if (outcome === 'succeeded') {
        succeeded += 1;
      } else if (outcome === 'retried') {
        retried += 1;
      } else {
        failed += 1;
      }
    }

    return context.json({
      ok: true,
      processed: dueRows.length,
      succeeded,
      retried,
      failed,
    });
  });
});

app.get('/v0/demo-credits/status', async (context) => {
  return withDatabase(context, async (db) => {
    const now = new Date();
    const dateKey = toUtcDateKey(now);
    const dailyLimit = resolveDemoDailyPassLimit(context.env);

    const [row] = await db
      .select({
        used: demoCreditsDaily.used,
      })
      .from(demoCreditsDaily)
      .where(eq(demoCreditsDaily.dateKey, dateKey))
      .limit(1);

    const status = buildDemoCreditsStatus({
      date: dateKey,
      dailyLimit,
      used: row?.used ?? 0,
    });

    return context.json({
      ok: true,
      ...status,
    });
  });
});

app.post('/v0/demo-credits/consume', async (context) => {
  return withDatabase(context, async (db) => {
    const body = await context.req.json().catch(() => null);
    const parsed = demoCreditsConsumeSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }
    const normalizedEmail = parsed.data.email.trim().toLowerCase();

    const now = new Date();
    const dateKey = toUtcDateKey(now);
    const dailyLimit = resolveDemoDailyPassLimit(context.env);

    const result = await db.transaction(async (transaction) => {
      await transaction
        .insert(demoCreditsDaily)
        .values({
          dateKey,
          used: 0,
          dailyLimit,
        })
        .onConflictDoNothing({ target: demoCreditsDaily.dateKey });

      const locked = await transaction.execute<DemoCreditsDailyRow>(sql`
        select
          date_key as "dateKey",
          used,
          daily_limit as "dailyLimit"
        from demo_credits_daily
        where date_key = ${dateKey}
        for update
      `);

      const row = locked.rows[0];
      if (!row) {
        throw new Error('Unable to resolve daily credits row.');
      }

      const consumed = consumeDemoCreditFromState({
        date: dateKey,
        dailyLimit,
        used: row.used,
      });

      if (!consumed.consumed) {
        return consumed;
      }

      await transaction
        .update(demoCreditsDaily)
        .set({
          used: consumed.status.used,
          dailyLimit,
          updatedAt: now,
        })
        .where(eq(demoCreditsDaily.dateKey, dateKey));

      return consumed;
    });

    if (!result.consumed) {
      return context.json(
        {
          ok: false,
          error: 'Daily demo passes are exhausted.',
          email: normalizedEmail,
          ...result.status,
        },
        429,
      );
    }

    return context.json({
      ok: true,
      consumed: true,
      email: normalizedEmail,
      ...result.status,
    });
  });
});

app.post('/v0/waitlist', async (context) => {
  return withDatabase(context, async (db) => {
    const body = await context.req.json().catch(() => null);
    const parsed = waitlistJoinSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const now = new Date();
    const dateKey = toUtcDateKey(now);
    const normalizedEmail = parsed.data.email.trim().toLowerCase();

    const inserted = await db
      .insert(waitlistEntries)
      .values({
        dateKey,
        email: normalizedEmail,
        source: parsed.data.source.trim(),
        metadata: parsed.data.metadata ?? {},
      })
      .onConflictDoNothing({
        target: [waitlistEntries.dateKey, waitlistEntries.email],
      })
      .returning({ id: waitlistEntries.id });

    return context.json({
      ok: true,
      joined: inserted.length > 0,
    });
  });
});

app.post('/v0/dev/demo-credits/reset', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const now = new Date();
    const dateKey = toUtcDateKey(now);
    const dailyLimit = resolveDemoDailyPassLimit(context.env);

    await db.transaction(async (transaction) => {
      await transaction
        .insert(demoCreditsDaily)
        .values({
          dateKey,
          used: 0,
          dailyLimit,
        })
        .onConflictDoNothing({ target: demoCreditsDaily.dateKey });

      await transaction
        .update(demoCreditsDaily)
        .set({
          used: 0,
          dailyLimit,
          updatedAt: now,
        })
        .where(eq(demoCreditsDaily.dateKey, dateKey));
    });

    const status = buildDemoCreditsStatus({
      date: dateKey,
      dailyLimit,
      used: 0,
    });

    return context.json({
      ok: true,
      ...status,
    });
  });
});

app.post('/v0/event-types', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const body = await context.req.json().catch(() => null);
    const sanitizedBody =
      body && typeof body === 'object'
        ? {
            ...body,
            slug: typeof body.slug === 'string' ? body.slug.toLowerCase().trim() : body.slug,
          }
        : body;
    const parsed = eventTypeCreateSchema.safeParse(sanitizedBody);

    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const payload = parsed.data;

    try {
      const [inserted] = await db
        .insert(eventTypes)
        .values({
          userId: authedUser.id,
          name: payload.name,
          slug: payload.slug,
          durationMinutes: payload.durationMinutes,
          locationType: payload.locationType,
          locationValue: payload.locationValue ?? null,
          questions: payload.questions,
        })
        .returning({
          id: eventTypes.id,
          slug: eventTypes.slug,
          name: eventTypes.name,
          durationMinutes: eventTypes.durationMinutes,
          locationType: eventTypes.locationType,
          locationValue: eventTypes.locationValue,
          questions: eventTypes.questions,
          isActive: eventTypes.isActive,
        });

      if (!inserted) {
        return jsonError(context, 500, 'Failed to create event type.');
      }

      return context.json({
        ok: true,
        eventType: {
          ...inserted,
          questions: toEventQuestions(inserted.questions),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error, 'event_types_user_slug_unique')) {
        return jsonError(context, 409, 'An event type with that slug already exists.');
      }
      throw error;
    }
  });
});

app.patch('/v0/event-types/:id', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const body = await context.req.json().catch(() => null);
    const sanitizedBody =
      body && typeof body === 'object'
        ? {
            ...body,
            slug: typeof body.slug === 'string' ? body.slug.toLowerCase().trim() : body.slug,
          }
        : body;
    const parsed = eventTypeUpdateSchema.safeParse(sanitizedBody);

    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const payload = parsed.data;
    const updateValues: Partial<typeof eventTypes.$inferInsert> = {};

    if (payload.name !== undefined) {
      updateValues.name = payload.name;
    }
    if (payload.slug !== undefined) {
      updateValues.slug = payload.slug;
    }
    if (payload.durationMinutes !== undefined) {
      updateValues.durationMinutes = payload.durationMinutes;
    }
    if (payload.locationType !== undefined) {
      updateValues.locationType = payload.locationType;
    }
    if (payload.locationValue !== undefined) {
      updateValues.locationValue = payload.locationValue ?? null;
    }
    if (payload.questions !== undefined) {
      updateValues.questions = payload.questions;
    }
    if (payload.isActive !== undefined) {
      updateValues.isActive = payload.isActive;
    }

    try {
      const [updated] = await db
        .update(eventTypes)
        .set(updateValues)
        .where(and(eq(eventTypes.id, context.req.param('id')), eq(eventTypes.userId, authedUser.id)))
        .returning({
          id: eventTypes.id,
          slug: eventTypes.slug,
          name: eventTypes.name,
          durationMinutes: eventTypes.durationMinutes,
          locationType: eventTypes.locationType,
          locationValue: eventTypes.locationValue,
          questions: eventTypes.questions,
          isActive: eventTypes.isActive,
        });

      if (!updated) {
        return jsonError(context, 404, 'Event type not found.');
      }

      return context.json({
        ok: true,
        eventType: {
          ...updated,
          questions: toEventQuestions(updated.questions),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error, 'event_types_user_slug_unique')) {
        return jsonError(context, 409, 'An event type with that slug already exists.');
      }
      throw error;
    }
  });
});

app.post('/v0/teams', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const body = await context.req.json().catch(() => null);
    const sanitizedBody =
      body && typeof body === 'object'
        ? {
            ...body,
            slug: typeof body.slug === 'string' ? body.slug.toLowerCase().trim() : body.slug,
          }
        : body;
    const parsed = teamCreateSchema.safeParse(sanitizedBody);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    try {
      const [team] = await db
        .insert(teams)
        .values({
          ownerUserId: authedUser.id,
          name: parsed.data.name,
          slug: parsed.data.slug,
        })
        .returning({
          id: teams.id,
          ownerUserId: teams.ownerUserId,
          name: teams.name,
          slug: teams.slug,
        });

      if (!team) {
        return jsonError(context, 500, 'Failed to create team.');
      }

      await db.insert(teamMembers).values({
        teamId: team.id,
        userId: authedUser.id,
        role: 'owner',
      });

      return context.json({
        ok: true,
        team,
      });
    } catch (error) {
      if (isUniqueViolation(error, 'teams_slug_unique')) {
        return jsonError(context, 409, 'A team with that slug already exists.');
      }
      if (isUniqueViolation(error, 'team_members_team_user_unique')) {
        return jsonError(context, 409, 'User is already a team member.');
      }
      throw error;
    }
  });
});

app.post('/v0/teams/:teamId/members', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const teamId = context.req.param('teamId');
    const body = await context.req.json().catch(() => null);
    const parsed = teamAddMemberSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const [team] = await db
      .select({
        id: teams.id,
        ownerUserId: teams.ownerUserId,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      return jsonError(context, 404, 'Team not found.');
    }
    if (team.ownerUserId !== authedUser.id) {
      return jsonError(context, 403, 'Only the team owner can add members.');
    }

    const [memberUser] = await db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.id, parsed.data.userId))
      .limit(1);

    if (!memberUser) {
      return jsonError(context, 404, 'User not found.');
    }

    try {
      const [inserted] = await db
        .insert(teamMembers)
        .values({
          teamId: team.id,
          userId: parsed.data.userId,
          role: parsed.data.role,
        })
        .returning({
          teamId: teamMembers.teamId,
          userId: teamMembers.userId,
          role: teamMembers.role,
        });

      if (!inserted) {
        return jsonError(context, 500, 'Failed to add team member.');
      }

      return context.json({
        ok: true,
        member: {
          ...inserted,
          user: memberUser,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error, 'team_members_team_user_unique')) {
        return jsonError(context, 409, 'User is already a team member.');
      }
      throw error;
    }
  });
});

app.post('/v0/team-event-types', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const body = await context.req.json().catch(() => null);
    const sanitizedBody =
      body && typeof body === 'object'
        ? {
            ...body,
            slug: typeof body.slug === 'string' ? body.slug.toLowerCase().trim() : body.slug,
          }
        : body;
    const parsed = teamEventTypeCreateSchema.safeParse(sanitizedBody);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const payload = parsed.data;
    const [team] = await db
      .select({
        id: teams.id,
        ownerUserId: teams.ownerUserId,
      })
      .from(teams)
      .where(eq(teams.id, payload.teamId))
      .limit(1);

    if (!team) {
      return jsonError(context, 404, 'Team not found.');
    }
    if (team.ownerUserId !== authedUser.id) {
      return jsonError(context, 403, 'Only the team owner can create team event types.');
    }

    const teamMemberRows = await db
      .select({
        userId: teamMembers.userId,
      })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, team.id));

    const teamMemberSet = new Set(teamMemberRows.map((member) => member.userId));
    const requiredMemberUserIds = payload.requiredMemberUserIds
      ? Array.from(new Set(payload.requiredMemberUserIds))
      : Array.from(teamMemberSet);

    if (requiredMemberUserIds.length === 0) {
      return jsonError(context, 400, 'Team event type must include at least one required member.');
    }

    if (requiredMemberUserIds.some((memberId) => !teamMemberSet.has(memberId))) {
      return jsonError(context, 400, 'All required members must belong to the team.');
    }

    try {
      const result = await db.transaction(async (transaction) => {
        const [eventType] = await transaction
          .insert(eventTypes)
          .values({
            userId: authedUser.id,
            name: payload.name,
            slug: payload.slug,
            durationMinutes: payload.durationMinutes,
            locationType: payload.locationType,
            locationValue: payload.locationValue ?? null,
            questions: payload.questions,
          })
          .returning({
            id: eventTypes.id,
            userId: eventTypes.userId,
            slug: eventTypes.slug,
            name: eventTypes.name,
            durationMinutes: eventTypes.durationMinutes,
            locationType: eventTypes.locationType,
            locationValue: eventTypes.locationValue,
            questions: eventTypes.questions,
            isActive: eventTypes.isActive,
          });

        if (!eventType) {
          throw new Error('Failed to create base event type.');
        }

        const [teamEventType] = await transaction
          .insert(teamEventTypes)
          .values({
            teamId: team.id,
            eventTypeId: eventType.id,
            mode: payload.mode,
          })
          .returning({
            id: teamEventTypes.id,
            mode: teamEventTypes.mode,
            roundRobinCursor: teamEventTypes.roundRobinCursor,
          });

        if (!teamEventType) {
          throw new Error('Failed to create team event type.');
        }

        await transaction.insert(teamEventTypeMembers).values(
          requiredMemberUserIds.map((memberUserId) => ({
            teamEventTypeId: teamEventType.id,
            userId: memberUserId,
            isRequired: true,
          })),
        );

        return {
          teamEventType,
          eventType,
        };
      });

      return context.json({
        ok: true,
        teamEventType: {
          id: result.teamEventType.id,
          teamId: team.id,
          mode: result.teamEventType.mode,
          roundRobinCursor: result.teamEventType.roundRobinCursor,
          requiredMemberUserIds,
          eventType: {
            ...result.eventType,
            questions: toEventQuestions(result.eventType.questions),
          },
        },
      });
    } catch (error) {
      if (isUniqueViolation(error, 'event_types_user_slug_unique')) {
        return jsonError(context, 409, 'An event type with that slug already exists.');
      }
      if (isUniqueViolation(error, 'team_event_type_members_event_type_user_unique')) {
        return jsonError(context, 409, 'Duplicate team event member assignment.');
      }
      throw error;
    }
  });
});

app.put('/v0/me/availability/rules', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const body = await context.req.json().catch(() => null);
    const parsed = setAvailabilityRulesSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    await db.transaction(async (transaction) => {
      await transaction.delete(availabilityRules).where(eq(availabilityRules.userId, authedUser.id));

      if (parsed.data.rules.length > 0) {
        await transaction.insert(availabilityRules).values(
          parsed.data.rules.map((rule) => ({
            userId: authedUser.id,
            dayOfWeek: rule.dayOfWeek,
            startMinute: rule.startMinute,
            endMinute: rule.endMinute,
            bufferBeforeMinutes: rule.bufferBeforeMinutes,
            bufferAfterMinutes: rule.bufferAfterMinutes,
          })),
        );
      }
    });

    return context.json({
      ok: true,
      count: parsed.data.rules.length,
    });
  });
});

app.put('/v0/me/availability/overrides', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const body = await context.req.json().catch(() => null);
    const parsed = setAvailabilityOverridesSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    await db.transaction(async (transaction) => {
      await transaction
        .delete(availabilityOverrides)
        .where(eq(availabilityOverrides.userId, authedUser.id));

      if (parsed.data.overrides.length > 0) {
        await transaction.insert(availabilityOverrides).values(
          parsed.data.overrides.map((override) => ({
            userId: authedUser.id,
            startAt: new Date(override.startAt),
            endAt: new Date(override.endAt),
            isAvailable: override.isAvailable,
            reason: override.reason ?? null,
          })),
        );
      }
    });

    return context.json({
      ok: true,
      count: parsed.data.overrides.length,
    });
  });
});

app.post('/v0/analytics/funnel/events', async (context) => {
  const body = await context.req.json().catch(() => null);
  const parsed = analyticsTrackFunnelEventSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
  }

  const requestIp = resolveClientIp(context.req.raw);
  if (
    isPublicAnalyticsRateLimited({
      ip: requestIp,
      username: parsed.data.username,
      eventSlug: parsed.data.eventSlug,
    })
  ) {
    return jsonError(context, 429, 'Rate limit exceeded. Try again in a minute.');
  }

  return withDatabase(context, async (db) => {
    const eventType = await findPublicEventType(db, parsed.data.username, parsed.data.eventSlug);
    if (!eventType) {
      return jsonError(context, 404, 'Event type not found.');
    }

    await recordAnalyticsFunnelEvent(db, {
      organizerId: eventType.userId,
      eventTypeId: eventType.id,
      stage: parsed.data.stage,
      metadata: {
        source: 'public_booking_page',
      },
    }).catch((error) => {
      console.warn('analytics_funnel_event_write_failed', {
        eventTypeId: eventType.id,
        stage: parsed.data.stage,
        error: error instanceof Error ? error.message : 'unknown',
      });
    });

    return context.json({ ok: true });
  });
});

app.get('/v0/users/:username/event-types/:slug', async (context) => {
  return withDatabase(context, async (db) => {
    const username = context.req.param('username');
    const slug = context.req.param('slug');
    const result = await findPublicEventView(db, username, slug);

    if (!result) {
      return jsonError(context, 404, 'Event type not found.');
    }

    return context.json({
      ok: true,
      eventType: {
        ...result.eventType,
      },
      organizer: {
        username: result.organizer.username,
        displayName: result.organizer.displayName,
        timezone: result.organizer.timezone,
      },
    });
  });
});

app.get('/v0/users/:username/event-types/:slug/availability', async (context) => {
  const username = context.req.param('username');
  const slug = context.req.param('slug');
  const requestIp = resolveClientIp(context.req.raw);
  if (
    isPublicBookingRateLimited({
      ip: requestIp,
      scope: `availability|${username}|${slug}`,
      perScopeLimit: PUBLIC_BOOKING_RATE_LIMIT_MAX_AVAILABILITY_REQUESTS_PER_SCOPE,
    })
  ) {
    return jsonError(context, 429, 'Rate limit exceeded. Try again in a minute.');
  }

  return withDatabase(context, async (db) => {
    const eventType = await findPublicEventType(db, username, slug);

    if (!eventType) {
      return jsonError(context, 404, 'Event type not found.');
    }

    const query = availabilityQuerySchema.safeParse({
      timezone: context.req.query('timezone') ?? undefined,
      start: context.req.query('start') ?? undefined,
      days: context.req.query('days') ?? undefined,
    });

    if (!query.success) {
      return jsonError(context, 400, query.error.issues[0]?.message ?? 'Invalid query params.');
    }

    const startIso = query.data.start ?? DateTime.utc().toISO();
    if (!startIso) {
      return jsonError(context, 400, 'Invalid range start.');
    }
    const rangeStart = DateTime.fromISO(startIso, { zone: 'utc' });
    if (!rangeStart.isValid) {
      return jsonError(context, 400, 'Invalid range start.');
    }

    const days = query.data.days ?? 7;
    const rangeEnd = rangeStart.plus({ days });

    const [rules, overrides, externalBusyWindows, existingBookings] = await Promise.all([
      db
        .select({
          dayOfWeek: availabilityRules.dayOfWeek,
          startMinute: availabilityRules.startMinute,
          endMinute: availabilityRules.endMinute,
          bufferBeforeMinutes: availabilityRules.bufferBeforeMinutes,
          bufferAfterMinutes: availabilityRules.bufferAfterMinutes,
        })
        .from(availabilityRules)
        .where(eq(availabilityRules.userId, eventType.userId)),
      db
        .select({
          startAt: availabilityOverrides.startAt,
          endAt: availabilityOverrides.endAt,
          isAvailable: availabilityOverrides.isAvailable,
        })
        .from(availabilityOverrides)
        .where(
          and(
            eq(availabilityOverrides.userId, eventType.userId),
            lt(availabilityOverrides.startAt, rangeEnd.toJSDate()),
            gt(availabilityOverrides.endAt, rangeStart.toJSDate()),
          ),
        ),
      listExternalBusyWindowsForUser(db, eventType.userId, rangeStart.toJSDate(), rangeEnd.toJSDate()),
      db
        .select({
          startsAt: bookings.startsAt,
          endsAt: bookings.endsAt,
          status: bookings.status,
          metadata: bookings.metadata,
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.organizerId, eventType.userId),
            eq(bookings.status, 'confirmed'),
            lt(bookings.startsAt, rangeEnd.toJSDate()),
            gt(bookings.endsAt, rangeStart.toJSDate()),
          ),
        ),
    ]);

    const slots = computeAvailabilitySlots({
      organizerTimezone: eventType.organizerTimezone,
      rangeStartIso: startIso,
      days,
      durationMinutes: eventType.durationMinutes,
      rules,
      overrides: [
        ...overrides,
        ...externalBusyWindows.map((window) => ({
          startAt: window.startsAt,
          endAt: window.endsAt,
          isAvailable: false,
        })),
      ],
      bookings: existingBookings,
    });

    return context.json({
      ok: true,
      timezone: normalizeTimezone(query.data.timezone),
      slots: slots.map((slot) => ({
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      })),
    });
  });
});

app.get('/v0/teams/:teamSlug/event-types/:eventSlug/availability', async (context) => {
  const teamSlug = context.req.param('teamSlug');
  const eventSlug = context.req.param('eventSlug');
  const requestIp = resolveClientIp(context.req.raw);
  if (
    isPublicBookingRateLimited({
      ip: requestIp,
      scope: `team-availability|${teamSlug}|${eventSlug}`,
      perScopeLimit: PUBLIC_BOOKING_RATE_LIMIT_MAX_AVAILABILITY_REQUESTS_PER_SCOPE,
    })
  ) {
    return jsonError(context, 429, 'Rate limit exceeded. Try again in a minute.');
  }

  return withDatabase(context, async (db) => {
    const teamEventContext = await findTeamEventTypeContext(db, teamSlug, eventSlug);

    if (!teamEventContext) {
      return jsonError(context, 404, 'Team event type not found.');
    }

    const query = availabilityQuerySchema.safeParse({
      timezone: context.req.query('timezone') ?? undefined,
      start: context.req.query('start') ?? undefined,
      days: context.req.query('days') ?? undefined,
    });
    if (!query.success) {
      return jsonError(context, 400, query.error.issues[0]?.message ?? 'Invalid query params.');
    }

    const startIso = query.data.start ?? DateTime.utc().toISO();
    if (!startIso) {
      return jsonError(context, 400, 'Invalid range start.');
    }
    const rangeStart = DateTime.fromISO(startIso, { zone: 'utc' });
    if (!rangeStart.isValid) {
      return jsonError(context, 400, 'Invalid range start.');
    }

    const days = query.data.days ?? 7;
    const rangeEnd = rangeStart.plus({ days });
    const memberSchedules = await listTeamMemberSchedules(
      db,
      teamEventContext.members.map((member) => member.userId),
      rangeStart.toJSDate(),
      rangeEnd.toJSDate(),
    );

    const availability = computeTeamAvailabilitySlots({
      mode: teamEventContext.mode,
      members: memberSchedules,
      rangeStartIso: startIso,
      days,
      durationMinutes: teamEventContext.eventType.durationMinutes,
      roundRobinCursor: teamEventContext.roundRobinCursor,
    });

    return context.json({
      ok: true,
      mode: teamEventContext.mode,
      timezone: normalizeTimezone(query.data.timezone),
      slots: availability.slots.map((slot) => ({
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        assignmentUserIds: slot.assignmentUserIds,
      })),
    });
  });
});

app.post('/v0/team-bookings', async (context) => {
  const body = await context.req.json().catch(() => null);
  const parsed = teamBookingCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
  }

  const idempotencyKey = parseIdempotencyKey(context.req.raw);
  if ('error' in idempotencyKey) {
    return jsonError(context, 400, idempotencyKey.error);
  }

  const payload = parsed.data;
  const requestIp = resolveClientIp(context.req.raw);

  const timezone = normalizeTimezone(payload.timezone);
  const startsAt = DateTime.fromISO(payload.startsAt, { zone: 'utc' });
  if (!startsAt.isValid) {
    return jsonError(context, 400, 'Invalid startsAt value.');
  }

  const requestedStartsAtIso = startsAt.toUTC().toISO();
  if (!requestedStartsAtIso) {
    return jsonError(context, 400, 'Unable to normalize startsAt.');
  }

  const idempotencyRequestHash = hashIdempotencyRequestPayload({
    teamSlug: payload.teamSlug,
    eventSlug: payload.eventSlug,
    startsAt: payload.startsAt,
    timezone,
    inviteeName: payload.inviteeName,
    inviteeEmail: payload.inviteeEmail,
    answers: payload.answers ?? {},
  });

  return withDatabase(context, async (db) => {
    const idempotencyState = await claimIdempotencyRequest(db, {
      scope: 'team_booking_create',
      rawKey: idempotencyKey.key,
      requestHash: idempotencyRequestHash,
    });
    if (idempotencyState.state === 'replay') {
      return context.json(idempotencyState.responseBody, idempotencyState.statusCode);
    }
    if (idempotencyState.state === 'mismatch') {
      return jsonError(
        context,
        409,
        'Idempotency key reuse with different request payload is not allowed.',
      );
    }
    if (idempotencyState.state === 'in_progress') {
      return jsonError(context, 409, 'A request with this idempotency key is already in progress.');
    }
    if (
      isPublicBookingRateLimited({
        ip: requestIp,
        scope: `team-booking|${payload.teamSlug}|${payload.eventSlug}`,
        perScopeLimit: PUBLIC_BOOKING_RATE_LIMIT_MAX_BOOKING_REQUESTS_PER_SCOPE,
      })
    ) {
      await releaseIdempotencyRequest(db, {
        scope: 'team_booking_create',
        keyHash: idempotencyState.keyHash,
      });
      return jsonError(context, 429, 'Rate limit exceeded. Try again in a minute.');
    }

    try {
      const result = await db.transaction(async (transaction) => {
        const lockedTeamEventResult = await transaction.execute<{
          teamEventTypeId: string;
          teamId: string;
          teamName: string;
          mode: string;
          roundRobinCursor: number;
          eventTypeId: string;
          eventTypeName: string;
          durationMinutes: number;
          locationType: string;
          locationValue: string | null;
          isActive: boolean;
        }>(sql`
          select
            tet.id as "teamEventTypeId",
            tet.team_id as "teamId",
            t.name as "teamName",
            tet.mode,
            tet.round_robin_cursor as "roundRobinCursor",
            et.id as "eventTypeId",
            et.name as "eventTypeName",
            et.duration_minutes as "durationMinutes",
            et.location_type as "locationType",
            et.location_value as "locationValue",
            et.is_active as "isActive"
          from team_event_types tet
          inner join teams t on t.id = tet.team_id
          inner join event_types et on et.id = tet.event_type_id
          where t.slug = ${payload.teamSlug} and et.slug = ${payload.eventSlug}
          for update
        `);

        const teamEventRow = lockedTeamEventResult.rows[0];
        const mode = teamEventRow ? resolveTeamMode(teamEventRow.mode) : null;
        if (!teamEventRow || !teamEventRow.isActive || !mode) {
          throw new BookingNotFoundError('Team event type not found.');
        }

        const memberRows = await transaction
          .select({
            userId: teamEventTypeMembers.userId,
          })
          .from(teamEventTypeMembers)
          .where(
            and(
              eq(teamEventTypeMembers.teamEventTypeId, teamEventRow.teamEventTypeId),
              eq(teamEventTypeMembers.isRequired, true),
            ),
          )
          .orderBy(asc(teamEventTypeMembers.userId));

        const memberUserIds = memberRows.map((member) => member.userId);
        if (memberUserIds.length === 0) {
          throw new BookingValidationError('Team event has no required members.');
        }

        const rangeStart = startsAt.minus({ days: 1 });
        const requestedEndsAt = startsAt.plus({ minutes: teamEventRow.durationMinutes });
        const rangeEnd = requestedEndsAt.plus({ days: 1 });
        const rangeStartIso = rangeStart.toUTC().toISO();
        if (!rangeStartIso) {
          throw new BookingValidationError('Unable to build slot validation range.');
        }

        const memberSchedules = await listTeamMemberSchedules(
          transaction,
          memberUserIds,
          rangeStart.toJSDate(),
          rangeEnd.toJSDate(),
        );
        if (memberSchedules.length !== memberUserIds.length) {
          throw new BookingValidationError('Some required team members no longer exist.');
        }

        const slotResolution = resolveTeamRequestedSlot({
          mode,
          memberSchedules,
          requestedStartsAtIso,
          durationMinutes: teamEventRow.durationMinutes,
          rangeStartIso,
          days: 2,
          roundRobinCursor: teamEventRow.roundRobinCursor,
        });
        if (!slotResolution) {
          throw new BookingConflictError('Selected slot is no longer available.');
        }

        // Organizer for a team booking is deterministically the first assigned member.
        const organizerId = slotResolution.assignmentUserIds[0];
        if (!organizerId) {
          throw new BookingValidationError('Unable to assign team booking.');
        }

        const metadata = JSON.stringify({
          answers: payload.answers ?? {},
          timezone,
          bufferBeforeMinutes: slotResolution.bufferBeforeMinutes,
          bufferAfterMinutes: slotResolution.bufferAfterMinutes,
          team: {
            teamId: teamEventRow.teamId,
            teamSlug: payload.teamSlug,
            teamEventTypeId: teamEventRow.teamEventTypeId,
            mode,
            assignmentUserIds: slotResolution.assignmentUserIds,
          },
        });

        const tokenSet = createBookingActionTokenSet();

        let insertedBooking: {
          id: string;
          eventTypeId: string;
          organizerId: string;
          inviteeName: string;
          inviteeEmail: string;
          startsAt: Date;
          endsAt: Date;
        } | null = null;
        try {
          const [bookingInsert] = await transaction
            .insert(bookings)
            .values({
              eventTypeId: teamEventRow.eventTypeId,
              organizerId,
              inviteeName: payload.inviteeName,
              inviteeEmail: payload.inviteeEmail,
              startsAt: startsAt.toJSDate(),
              endsAt: new Date(slotResolution.requestedEndsAtIso),
              metadata,
            })
            .returning({
              id: bookings.id,
              eventTypeId: bookings.eventTypeId,
              organizerId: bookings.organizerId,
              inviteeName: bookings.inviteeName,
              inviteeEmail: bookings.inviteeEmail,
              startsAt: bookings.startsAt,
              endsAt: bookings.endsAt,
            });
          insertedBooking = bookingInsert ?? null;
        } catch (error) {
          if (isUniqueViolation(error, 'bookings_unique_slot')) {
            throw new BookingConflictError('Selected slot is no longer available.');
          }
          throw error;
        }

        if (!insertedBooking) {
          throw new Error('Failed to create team booking.');
        }

        await transaction.insert(bookingActionTokens).values(
          tokenSet.tokenWrites.map((tokenWrite) => ({
            bookingId: insertedBooking.id,
            actionType: tokenWrite.actionType,
            tokenHash: tokenWrite.tokenHash,
            expiresAt: tokenWrite.expiresAt,
          })),
        );

        try {
          await transaction.insert(teamBookingAssignments).values(
            slotResolution.assignmentUserIds.map((memberUserId) => ({
              bookingId: insertedBooking.id,
              teamEventTypeId: teamEventRow.teamEventTypeId,
              userId: memberUserId,
              startsAt: insertedBooking.startsAt,
              endsAt: insertedBooking.endsAt,
            })),
          );
        } catch (error) {
          if (isUniqueViolation(error, 'team_booking_assignments_user_slot_unique')) {
            throw new BookingConflictError('Selected slot is no longer available.');
          }
          throw error;
        }

        if (mode === 'round_robin') {
          await transaction
            .update(teamEventTypes)
            .set({
              roundRobinCursor: slotResolution.nextRoundRobinCursor,
            })
            .where(eq(teamEventTypes.id, teamEventRow.teamEventTypeId));
        }

        const [organizer] = await transaction
          .select({
            id: users.id,
            email: users.email,
            displayName: users.displayName,
          })
          .from(users)
          .where(eq(users.id, organizerId))
          .limit(1);

        if (!organizer) {
          throw new Error('Assigned organizer not found.');
        }

        return {
          booking: insertedBooking,
          eventType: {
            id: teamEventRow.eventTypeId,
            name: teamEventRow.eventTypeName,
            locationType: teamEventRow.locationType,
            locationValue: teamEventRow.locationValue,
          },
          team: {
            id: teamEventRow.teamId,
            name: teamEventRow.teamName,
            mode,
            teamEventTypeId: teamEventRow.teamEventTypeId,
          },
          organizer,
          actionTokens: tokenSet.publicTokens,
          assignmentUserIds: slotResolution.assignmentUserIds,
        };
      });

      const tokens = actionTokenMap(result.actionTokens);
      const actionUrls = buildActionUrls(context.req.raw, {
        cancelToken: tokens.cancelToken,
        rescheduleToken: tokens.rescheduleToken,
      });

      await tryRecordAnalyticsFunnelEvent(db, {
        organizerId: result.booking.organizerId,
        eventTypeId: result.booking.eventTypeId,
        teamEventTypeId: result.team.teamEventTypeId,
        stage: 'booking_confirmed',
        occurredAt: new Date(),
      });

      const email = await sendBookingConfirmationEmail(context.env, {
        inviteeEmail: payload.inviteeEmail,
        inviteeName: payload.inviteeName,
        organizerDisplayName:
          result.team.mode === 'collective' ? `${result.team.name} Team` : result.organizer.displayName,
        eventName: result.eventType.name,
        startsAt: result.booking.startsAt.toISOString(),
        timezone,
        locationType: result.eventType.locationType,
        locationValue: result.eventType.locationValue,
        cancelLink: actionUrls.lookupCancelUrl,
        rescheduleLink: actionUrls.lookupRescheduleUrl,
        idempotencyKey: `booking-confirmation:${result.booking.id}`,
      });

      await tryRecordEmailDelivery(context.env, db, {
        organizerId: result.booking.organizerId,
        bookingId: result.booking.id,
        eventTypeId: result.booking.eventTypeId,
        recipientEmail: result.booking.inviteeEmail,
        emailType: 'booking_confirmation',
        provider: email.provider,
        status: email.sent ? 'succeeded' : 'failed',
        ...(email.messageId ? { providerMessageId: email.messageId } : {}),
        ...(email.error ? { error: email.error } : {}),
      });

      const queuedWebhookDeliveries = await enqueueWebhookDeliveries(db, {
        organizerId: result.booking.organizerId,
        type: 'booking.created',
        booking: {
          id: result.booking.id,
          eventTypeId: result.booking.eventTypeId,
          organizerId: result.booking.organizerId,
          inviteeEmail: result.booking.inviteeEmail,
          inviteeName: result.booking.inviteeName,
          startsAtIso: result.booking.startsAt.toISOString(),
          endsAtIso: result.booking.endsAt.toISOString(),
        },
        metadata: {
          timezone,
          teamId: result.team.id,
          teamEventTypeId: result.team.teamEventTypeId,
          teamMode: result.team.mode,
          assignmentUserIds: result.assignmentUserIds,
          actionLookupCancelUrl: actionUrls.lookupCancelUrl,
          actionLookupRescheduleUrl: actionUrls.lookupRescheduleUrl,
        },
      });

      const writebackQueue = await enqueueCalendarWritebacksForBooking(db, {
        bookingId: result.booking.id,
        organizerId: result.booking.organizerId,
        operation: 'create',
      });
      const writebackResult =
        writebackQueue.queued > 0
          ? await runCalendarWritebackBatch(db, context.env, {
              organizerId: result.booking.organizerId,
              rowIds: writebackQueue.rowIds,
              limit: clampCalendarWritebackBatchLimit(writebackQueue.queued),
            })
          : {
              processed: 0,
              succeeded: 0,
              retried: 0,
              failed: 0,
          };

      const responseBody: Record<string, unknown> = {
        ok: true,
        booking: {
          id: result.booking.id,
          eventTypeId: result.booking.eventTypeId,
          organizerId: result.booking.organizerId,
          inviteeName: result.booking.inviteeName,
          inviteeEmail: result.booking.inviteeEmail,
          startsAt: result.booking.startsAt.toISOString(),
          endsAt: result.booking.endsAt.toISOString(),
          assignmentUserIds: result.assignmentUserIds,
          teamMode: result.team.mode,
        },
        actions: {
          cancel: {
            token: tokens.cancelToken,
            expiresAt: tokens.cancelExpiresAt,
            lookupUrl: actionUrls.lookupCancelUrl,
            url: actionUrls.cancelUrl,
          },
          reschedule: {
            token: tokens.rescheduleToken,
            expiresAt: tokens.rescheduleExpiresAt,
            lookupUrl: actionUrls.lookupRescheduleUrl,
            url: actionUrls.rescheduleUrl,
          },
        },
        email,
        webhooks: {
          queued: queuedWebhookDeliveries,
        },
        calendarWriteback: {
          queued: writebackQueue.queued,
          ...writebackResult,
        },
      };

      await completeIdempotencyRequest(db, {
        scope: 'team_booking_create',
        keyHash: idempotencyState.keyHash,
        statusCode: 200,
        responseBody,
      });

      return context.json(responseBody);
    } catch (error) {
      if (error instanceof BookingNotFoundError) {
        const responseBody: Record<string, unknown> = {
          ok: false,
          error: 'Team event type not found.',
        };
        await completeIdempotencyRequest(db, {
          scope: 'team_booking_create',
          keyHash: idempotencyState.keyHash,
          statusCode: 404,
          responseBody,
        });
        return context.json(responseBody, 404);
      }
      if (error instanceof BookingValidationError) {
        const responseBody: Record<string, unknown> = { ok: false, error: error.message };
        await completeIdempotencyRequest(db, {
          scope: 'team_booking_create',
          keyHash: idempotencyState.keyHash,
          statusCode: 400,
          responseBody,
        });
        return context.json(responseBody, 400);
      }
      if (error instanceof BookingConflictError) {
        const responseBody: Record<string, unknown> = { ok: false, error: error.message };
        await completeIdempotencyRequest(db, {
          scope: 'team_booking_create',
          keyHash: idempotencyState.keyHash,
          statusCode: 409,
          responseBody,
        });
        return context.json(responseBody, 409);
      }
      console.error('Unexpected error in team booking create:', error);
      const responseBody: Record<string, unknown> = {
        ok: false,
        error: 'Internal server error.',
      };
      await completeIdempotencyRequest(db, {
        scope: 'team_booking_create',
        keyHash: idempotencyState.keyHash,
        statusCode: 500,
        responseBody,
      });
      return context.json(responseBody, 500);
    }
  });
});

app.post('/v0/bookings', async (context) => {
  const body = await context.req.json().catch(() => null);
  const parsed = bookingCreateSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
  }

  const idempotencyKey = parseIdempotencyKey(context.req.raw);
  if ('error' in idempotencyKey) {
    return jsonError(context, 400, idempotencyKey.error);
  }

  const payload = parsed.data;
  const requestIp = resolveClientIp(context.req.raw);

  const timezone = normalizeTimezone(payload.timezone);
  const idempotencyRequestHash = hashIdempotencyRequestPayload({
    username: payload.username,
    eventSlug: payload.eventSlug,
    startsAt: payload.startsAt,
    timezone,
    inviteeName: payload.inviteeName,
    inviteeEmail: payload.inviteeEmail,
    answers: payload.answers ?? {},
  });

  return withDatabase(context, async (db) => {
    const idempotencyState = await claimIdempotencyRequest(db, {
      scope: 'booking_create',
      rawKey: idempotencyKey.key,
      requestHash: idempotencyRequestHash,
    });
    if (idempotencyState.state === 'replay') {
      return context.json(idempotencyState.responseBody, idempotencyState.statusCode);
    }
    if (idempotencyState.state === 'mismatch') {
      return jsonError(
        context,
        409,
        'Idempotency key reuse with different request payload is not allowed.',
      );
    }
    if (idempotencyState.state === 'in_progress') {
      return jsonError(context, 409, 'A request with this idempotency key is already in progress.');
    }
    if (
      isPublicBookingRateLimited({
        ip: requestIp,
        scope: `booking|${payload.username}|${payload.eventSlug}`,
        perScopeLimit: PUBLIC_BOOKING_RATE_LIMIT_MAX_BOOKING_REQUESTS_PER_SCOPE,
      })
    ) {
      await releaseIdempotencyRequest(db, {
        scope: 'booking_create',
        keyHash: idempotencyState.keyHash,
      });
      return jsonError(context, 429, 'Rate limit exceeded. Try again in a minute.');
    }

    try {
      const result = await commitBooking(
        {
          getPublicEventType: async (username, eventSlug) => {
            return findPublicEventType(db, username, eventSlug);
          },
          withEventTypeTransaction: async (eventTypeId, callback) => {
            return db.transaction(async (transaction) => {
              return callback({
                lockEventType: async (lockedEventTypeId) => {
                  const locked = await transaction.execute<{ id: string; userId: string }>(
                    sql`select id, user_id as "userId" from event_types where id = ${lockedEventTypeId} and is_active = true for update`,
                  );

                  if (!locked.rows[0] || locked.rows[0].id !== eventTypeId) {
                    throw new BookingNotFoundError('Event type not found.');
                  }

                  await transaction.execute(
                    sql`select id from users where id = ${locked.rows[0].userId} for update`,
                  );
                },
                listRules: async (userId) => {
                  return transaction
                    .select({
                      dayOfWeek: availabilityRules.dayOfWeek,
                      startMinute: availabilityRules.startMinute,
                      endMinute: availabilityRules.endMinute,
                      bufferBeforeMinutes: availabilityRules.bufferBeforeMinutes,
                      bufferAfterMinutes: availabilityRules.bufferAfterMinutes,
                    })
                    .from(availabilityRules)
                    .where(eq(availabilityRules.userId, userId));
                },
                listOverrides: async (userId, rangeStart, rangeEnd) => {
                  return transaction
                    .select({
                      startAt: availabilityOverrides.startAt,
                      endAt: availabilityOverrides.endAt,
                      isAvailable: availabilityOverrides.isAvailable,
                    })
                    .from(availabilityOverrides)
                    .where(
                      and(
                        eq(availabilityOverrides.userId, userId),
                        lt(availabilityOverrides.startAt, rangeEnd),
                        gt(availabilityOverrides.endAt, rangeStart),
                      ),
                    );
                },
                listExternalBusyWindows: async (userId, rangeStart, rangeEnd) => {
                  return listExternalBusyWindowsForUser(transaction, userId, rangeStart, rangeEnd);
                },
                listConfirmedBookings: async (organizerId, rangeStart, rangeEnd) => {
                  return transaction
                    .select({
                      id: bookings.id,
                      startsAt: bookings.startsAt,
                      endsAt: bookings.endsAt,
                      status: bookings.status,
                      metadata: bookings.metadata,
                    })
                    .from(bookings)
                    .where(
                      and(
                        eq(bookings.organizerId, organizerId),
                        eq(bookings.status, 'confirmed'),
                        lt(bookings.startsAt, rangeEnd),
                        gt(bookings.endsAt, rangeStart),
                      ),
                    );
                },
                insertActionTokens: async (bookingId, tokens) => {
                  if (tokens.length === 0) {
                    return;
                  }

                  await transaction.insert(bookingActionTokens).values(
                    tokens.map((token) => ({
                      bookingId,
                      actionType: token.actionType,
                      tokenHash: token.tokenHash,
                      expiresAt: token.expiresAt,
                    })),
                  );
                },
                insertBooking: async (input) => {
                  try {
                    const [inserted] = await transaction
                      .insert(bookings)
                      .values({
                        eventTypeId: input.eventTypeId,
                        organizerId: input.organizerId,
                        inviteeName: input.inviteeName,
                        inviteeEmail: input.inviteeEmail,
                        startsAt: input.startsAt,
                        endsAt: input.endsAt,
                        metadata: input.metadata,
                      })
                      .returning({
                        id: bookings.id,
                        eventTypeId: bookings.eventTypeId,
                        organizerId: bookings.organizerId,
                        inviteeName: bookings.inviteeName,
                        inviteeEmail: bookings.inviteeEmail,
                        startsAt: bookings.startsAt,
                        endsAt: bookings.endsAt,
                      });

                    if (!inserted) {
                      throw new Error('Insert failed.');
                    }

                    return inserted;
                  } catch (error) {
                    if (isUniqueViolation(error, 'bookings_unique_slot')) {
                      throw new BookingUniqueConstraintError('Slot already booked.');
                    }
                    throw error;
                  }
                },
              });
            });
          },
        },
        {
          username: payload.username,
          eventSlug: payload.eventSlug,
          startsAt: payload.startsAt,
          timezone,
          inviteeName: payload.inviteeName,
          inviteeEmail: payload.inviteeEmail,
          ...(payload.answers ? { answers: payload.answers } : {}),
        },
      );

      const tokens = actionTokenMap(result.actionTokens);
      const actionUrls = buildActionUrls(context.req.raw, {
        cancelToken: tokens.cancelToken,
        rescheduleToken: tokens.rescheduleToken,
      });

      await tryRecordAnalyticsFunnelEvent(db, {
        organizerId: result.booking.organizerId,
        eventTypeId: result.booking.eventTypeId,
        stage: 'booking_confirmed',
        occurredAt: new Date(),
      });

      const email = await sendBookingConfirmationEmail(context.env, {
        inviteeEmail: payload.inviteeEmail,
        inviteeName: payload.inviteeName,
        organizerDisplayName: result.eventType.organizerDisplayName,
        eventName: result.eventType.name,
        startsAt: result.booking.startsAt.toISOString(),
        timezone,
        locationType: result.eventType.locationType,
        locationValue: result.eventType.locationValue,
        cancelLink: actionUrls.lookupCancelUrl,
        rescheduleLink: actionUrls.lookupRescheduleUrl,
        idempotencyKey: `booking-confirmation:${result.booking.id}`,
      });

      await tryRecordEmailDelivery(context.env, db, {
        organizerId: result.booking.organizerId,
        bookingId: result.booking.id,
        eventTypeId: result.booking.eventTypeId,
        recipientEmail: result.booking.inviteeEmail,
        emailType: 'booking_confirmation',
        provider: email.provider,
        status: email.sent ? 'succeeded' : 'failed',
        ...(email.messageId ? { providerMessageId: email.messageId } : {}),
        ...(email.error ? { error: email.error } : {}),
      });

      const queuedWebhookDeliveries = await enqueueWebhookDeliveries(db, {
        organizerId: result.booking.organizerId,
        type: 'booking.created',
        booking: {
          id: result.booking.id,
          eventTypeId: result.booking.eventTypeId,
          organizerId: result.booking.organizerId,
          inviteeEmail: result.booking.inviteeEmail,
          inviteeName: result.booking.inviteeName,
          startsAtIso: result.booking.startsAt.toISOString(),
          endsAtIso: result.booking.endsAt.toISOString(),
        },
        metadata: {
          timezone,
          actionLookupCancelUrl: actionUrls.lookupCancelUrl,
          actionLookupRescheduleUrl: actionUrls.lookupRescheduleUrl,
        },
      });

      const writebackQueue = await enqueueCalendarWritebacksForBooking(db, {
        bookingId: result.booking.id,
        organizerId: result.booking.organizerId,
        operation: 'create',
      });
      const writebackResult =
        writebackQueue.queued > 0
          ? await runCalendarWritebackBatch(db, context.env, {
              organizerId: result.booking.organizerId,
              rowIds: writebackQueue.rowIds,
              limit: clampCalendarWritebackBatchLimit(writebackQueue.queued),
            })
          : {
              processed: 0,
              succeeded: 0,
              retried: 0,
              failed: 0,
          };

      const responseBody: Record<string, unknown> = {
        ok: true,
        booking: {
          id: result.booking.id,
          eventTypeId: result.booking.eventTypeId,
          organizerId: result.booking.organizerId,
          inviteeName: result.booking.inviteeName,
          inviteeEmail: result.booking.inviteeEmail,
          startsAt: result.booking.startsAt.toISOString(),
          endsAt: result.booking.endsAt.toISOString(),
        },
        actions: {
          cancel: {
            token: tokens.cancelToken,
            expiresAt: tokens.cancelExpiresAt,
            lookupUrl: actionUrls.lookupCancelUrl,
            url: actionUrls.cancelUrl,
          },
          reschedule: {
            token: tokens.rescheduleToken,
            expiresAt: tokens.rescheduleExpiresAt,
            lookupUrl: actionUrls.lookupRescheduleUrl,
            url: actionUrls.rescheduleUrl,
          },
        },
        email,
        webhooks: {
          queued: queuedWebhookDeliveries,
        },
        calendarWriteback: {
          queued: writebackQueue.queued,
          ...writebackResult,
        },
      };

      await completeIdempotencyRequest(db, {
        scope: 'booking_create',
        keyHash: idempotencyState.keyHash,
        statusCode: 200,
        responseBody,
      });

      return context.json(responseBody);
    } catch (error) {
      if (error instanceof BookingNotFoundError) {
        const responseBody: Record<string, unknown> = {
          ok: false,
          error: 'Event type not found.',
        };
        await completeIdempotencyRequest(db, {
          scope: 'booking_create',
          keyHash: idempotencyState.keyHash,
          statusCode: 404,
          responseBody,
        });
        return context.json(responseBody, 404);
      }
      if (error instanceof BookingValidationError) {
        const responseBody: Record<string, unknown> = { ok: false, error: error.message };
        await completeIdempotencyRequest(db, {
          scope: 'booking_create',
          keyHash: idempotencyState.keyHash,
          statusCode: 400,
          responseBody,
        });
        return context.json(responseBody, 400);
      }
      if (error instanceof BookingConflictError) {
        const responseBody: Record<string, unknown> = { ok: false, error: error.message };
        await completeIdempotencyRequest(db, {
          scope: 'booking_create',
          keyHash: idempotencyState.keyHash,
          statusCode: 409,
          responseBody,
        });
        return context.json(responseBody, 409);
      }
      console.error('Unexpected error in booking create:', error);
      const responseBody: Record<string, unknown> = {
        ok: false,
        error: 'Internal server error.',
      };
      await completeIdempotencyRequest(db, {
        scope: 'booking_create',
        keyHash: idempotencyState.keyHash,
        statusCode: 500,
        responseBody,
      });
      return context.json(responseBody, 500);
    }
  });
});

app.get('/v0/bookings/actions/:token', async (context) => {
  return withDatabase(context, async (db) => {
    const tokenParam = bookingActionTokenSchema.safeParse(context.req.param('token'));
    if (!tokenParam.success) {
      return jsonError(context, 404, 'Action link is invalid or expired.');
    }

    const [row] = await db
      .select({
        actionType: bookingActionTokens.actionType,
        expiresAt: bookingActionTokens.expiresAt,
        consumedAt: bookingActionTokens.consumedAt,
        consumedBookingId: bookingActionTokens.consumedBookingId,
        bookingId: bookings.id,
        bookingStatus: bookings.status,
        bookingStartsAt: bookings.startsAt,
        bookingEndsAt: bookings.endsAt,
        bookingMetadata: bookings.metadata,
        inviteeName: bookings.inviteeName,
        inviteeEmail: bookings.inviteeEmail,
        eventTypeSlug: eventTypes.slug,
        eventTypeName: eventTypes.name,
        eventTypeDurationMinutes: eventTypes.durationMinutes,
        organizerUsername: users.username,
        organizerDisplayName: users.displayName,
        organizerTimezone: users.timezone,
      })
      .from(bookingActionTokens)
      .innerJoin(bookings, eq(bookings.id, bookingActionTokens.bookingId))
      .innerJoin(eventTypes, eq(eventTypes.id, bookings.eventTypeId))
      .innerJoin(users, eq(users.id, bookings.organizerId))
      .where(eq(bookingActionTokens.tokenHash, hashToken(tokenParam.data)))
      .limit(1);

    if (!row) {
      return jsonError(context, 404, 'Action link is invalid or expired.');
    }

    const actionType = row.actionType as BookingActionType;
    const tokenState = evaluateBookingActionToken({
      actionType,
      bookingStatus: row.bookingStatus,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt,
      now: new Date(),
    });
    if (tokenState === 'gone') {
      return jsonError(context, 410, 'Action link is invalid or expired.');
    }

    const metadata = parseBookingMetadata(row.bookingMetadata, normalizeTimezone);
    const timezone = metadata.timezone ?? normalizeTimezone(row.organizerTimezone);

    let rescheduledTo: { id: string; startsAt: string; endsAt: string } | null = null;
    if (row.bookingStatus === 'rescheduled') {
      const [child] = row.consumedBookingId
        ? await db
            .select({
              id: bookings.id,
              startsAt: bookings.startsAt,
              endsAt: bookings.endsAt,
            })
            .from(bookings)
            .where(eq(bookings.id, row.consumedBookingId))
            .limit(1)
        : await db
            .select({
              id: bookings.id,
              startsAt: bookings.startsAt,
              endsAt: bookings.endsAt,
            })
            .from(bookings)
            .where(eq(bookings.rescheduledFromBookingId, row.bookingId))
            .orderBy(desc(bookings.createdAt))
            .limit(1);

      if (child) {
        rescheduledTo = {
          id: child.id,
          startsAt: child.startsAt.toISOString(),
          endsAt: child.endsAt.toISOString(),
        };
      }
    }

    return context.json({
      ok: true,
      actionType,
      booking: {
        id: row.bookingId,
        status: row.bookingStatus,
        startsAt: row.bookingStartsAt.toISOString(),
        endsAt: row.bookingEndsAt.toISOString(),
        timezone,
        inviteeName: row.inviteeName,
        inviteeEmail: row.inviteeEmail,
        rescheduledTo,
      },
      eventType: {
        slug: row.eventTypeSlug,
        name: row.eventTypeName,
        durationMinutes: row.eventTypeDurationMinutes,
      },
      organizer: {
        username: row.organizerUsername,
        displayName: row.organizerDisplayName,
        timezone: normalizeTimezone(row.organizerTimezone),
      },
      actions: {
        canCancel: actionType === 'cancel' && tokenState === 'usable',
        canReschedule:
          actionType === 'reschedule' && tokenState === 'usable',
      },
    });
  });
});

app.post('/v0/bookings/actions/:token/cancel', async (context) => {
  return withDatabase(context, async (db) => {
    const tokenParam = bookingActionTokenSchema.safeParse(context.req.param('token'));
    if (!tokenParam.success) {
      return jsonError(context, 404, 'Action link is invalid or expired.');
    }

    const body = await context.req.json().catch(() => ({}));
    const parsed = bookingCancelSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const now = new Date();

    try {
      const result = await db.transaction(async (transaction) => {
        const token = await lockActionToken(transaction, hashToken(tokenParam.data));
        if (!token || token.actionType !== 'cancel') {
          throw new BookingActionNotFoundError('Action link is invalid or expired.');
        }

        const booking = await lockBooking(transaction, token.bookingId);
        if (!booking) {
          throw new BookingActionNotFoundError('Booking not found.');
        }

        const [eventType] = await transaction
          .select({
            id: eventTypes.id,
            userId: eventTypes.userId,
            slug: eventTypes.slug,
            name: eventTypes.name,
            durationMinutes: eventTypes.durationMinutes,
            locationType: eventTypes.locationType,
            locationValue: eventTypes.locationValue,
            isActive: eventTypes.isActive,
          })
          .from(eventTypes)
          .where(eq(eventTypes.id, booking.eventTypeId))
          .limit(1);

        const [organizer] = await transaction
          .select({
            id: users.id,
            email: users.email,
            username: users.username,
            displayName: users.displayName,
            timezone: users.timezone,
          })
          .from(users)
          .where(eq(users.id, booking.organizerId))
          .limit(1);

        if (!eventType || !organizer) {
          throw new BookingActionNotFoundError('Booking context not found.');
        }

        const tokenState = evaluateBookingActionToken({
          actionType: token.actionType,
          bookingStatus: booking.status,
          expiresAt: token.expiresAt,
          consumedAt: token.consumedAt,
          now,
        });

        if (tokenState === 'gone') {
          throw new BookingActionGoneError('Action link is invalid or expired.');
        }

        if (tokenState === 'idempotent-replay') {
          await transaction
            .update(bookingActionTokens)
            .set({
              consumedAt: now,
            })
            .where(
              and(
                eq(bookingActionTokens.bookingId, booking.id),
                isNull(bookingActionTokens.consumedAt),
              ),
            );

          await transaction
            .delete(teamBookingAssignments)
            .where(eq(teamBookingAssignments.bookingId, booking.id));

          return {
            booking,
            eventType,
            organizer,
            alreadyProcessed: true,
          };
        }

        if (tokenState !== 'usable' || booking.status !== 'confirmed') {
          throw new BookingActionGoneError('Booking is not cancelable.');
        }

        const [canceledBooking] = await transaction
          .update(bookings)
          .set({
            status: 'canceled',
            canceledAt: now,
            canceledBy: 'invitee',
            cancellationReason: parsed.data.reason ?? null,
          })
          .where(eq(bookings.id, booking.id))
          .returning({
            id: bookings.id,
            eventTypeId: bookings.eventTypeId,
            organizerId: bookings.organizerId,
            inviteeName: bookings.inviteeName,
            inviteeEmail: bookings.inviteeEmail,
            startsAt: bookings.startsAt,
            endsAt: bookings.endsAt,
            status: bookings.status,
            metadata: bookings.metadata,
          });

        if (!canceledBooking) {
          throw new Error('Failed to cancel booking.');
        }

        await transaction
          .update(bookingActionTokens)
          .set({
            consumedAt: now,
          })
          .where(
            and(eq(bookingActionTokens.bookingId, booking.id), isNull(bookingActionTokens.consumedAt)),
          );

        await transaction
          .delete(teamBookingAssignments)
          .where(eq(teamBookingAssignments.bookingId, booking.id));

        return {
          booking: canceledBooking,
          eventType,
          organizer,
          alreadyProcessed: false,
        };
      });

      const timezone =
        parseBookingMetadata(result.booking.metadata, normalizeTimezone).timezone ??
        normalizeTimezone(result.organizer.timezone);

      const email = result.alreadyProcessed
        ? {
            sent: false,
            provider: 'none' as const,
            error: 'Idempotent replay: cancellation already processed.',
          }
        : await Promise.all([
            sendBookingCancellationEmail(context.env, {
              recipientEmail: result.booking.inviteeEmail,
              recipientName: result.booking.inviteeName,
              recipientRole: 'invitee',
              organizerDisplayName: result.organizer.displayName,
              eventName: result.eventType.name,
              startsAt: result.booking.startsAt.toISOString(),
              timezone,
              cancellationReason: parsed.data.reason ?? null,
              idempotencyKey: `booking-cancel:${result.booking.id}:invitee`,
            }),
            sendBookingCancellationEmail(context.env, {
              recipientEmail: result.organizer.email,
              recipientName: result.organizer.displayName,
              recipientRole: 'organizer',
              organizerDisplayName: result.organizer.displayName,
              eventName: result.eventType.name,
              startsAt: result.booking.startsAt.toISOString(),
              timezone,
              cancellationReason: parsed.data.reason ?? null,
              idempotencyKey: `booking-cancel:${result.booking.id}:organizer`,
            }),
          ]);

      if (!result.alreadyProcessed && Array.isArray(email)) {
        const [inviteeEmailResult, organizerEmailResult] = email;
        if (inviteeEmailResult) {
          await tryRecordEmailDelivery(context.env, db, {
            organizerId: result.booking.organizerId,
            bookingId: result.booking.id,
            eventTypeId: result.booking.eventTypeId,
            recipientEmail: result.booking.inviteeEmail,
            emailType: 'booking_cancellation',
            provider: inviteeEmailResult.provider,
            status: inviteeEmailResult.sent ? 'succeeded' : 'failed',
            ...(inviteeEmailResult.messageId
              ? { providerMessageId: inviteeEmailResult.messageId }
              : {}),
            ...(inviteeEmailResult.error ? { error: inviteeEmailResult.error } : {}),
          });
        }
        if (organizerEmailResult) {
          await tryRecordEmailDelivery(context.env, db, {
            organizerId: result.booking.organizerId,
            bookingId: result.booking.id,
            eventTypeId: result.booking.eventTypeId,
            recipientEmail: result.organizer.email,
            emailType: 'booking_cancellation',
            provider: organizerEmailResult.provider,
            status: organizerEmailResult.sent ? 'succeeded' : 'failed',
            ...(organizerEmailResult.messageId
              ? { providerMessageId: organizerEmailResult.messageId }
              : {}),
            ...(organizerEmailResult.error ? { error: organizerEmailResult.error } : {}),
          });
        }
      }

      const queuedWebhookDeliveries = result.alreadyProcessed
        ? 0
        : await enqueueWebhookDeliveries(db, {
            organizerId: result.booking.organizerId,
            type: 'booking.canceled',
            booking: {
              id: result.booking.id,
              eventTypeId: result.booking.eventTypeId,
              organizerId: result.booking.organizerId,
              inviteeEmail: result.booking.inviteeEmail,
              inviteeName: result.booking.inviteeName,
              startsAtIso: result.booking.startsAt.toISOString(),
              endsAtIso: result.booking.endsAt.toISOString(),
            },
            metadata: {
              cancellationReason: parsed.data.reason ?? null,
            },
          });

      const writebackQueue = result.alreadyProcessed
        ? { queued: 0, rowIds: [] as string[] }
        : await enqueueCalendarWritebacksForBooking(db, {
            bookingId: result.booking.id,
            organizerId: result.booking.organizerId,
            operation: 'cancel',
          });
      const writebackResult =
        writebackQueue.queued > 0
          ? await runCalendarWritebackBatch(db, context.env, {
              organizerId: result.booking.organizerId,
              rowIds: writebackQueue.rowIds,
              limit: clampCalendarWritebackBatchLimit(writebackQueue.queued),
            })
          : {
              processed: 0,
              succeeded: 0,
              retried: 0,
              failed: 0,
            };

      return context.json({
        ok: true,
        booking: {
          id: result.booking.id,
          status: result.booking.status,
        },
        email,
        webhooks: {
          queued: queuedWebhookDeliveries,
        },
        calendarWriteback: {
          queued: writebackQueue.queued,
          ...writebackResult,
        },
      });
    } catch (error) {
      if (error instanceof BookingActionNotFoundError) {
        return jsonError(context, 404, 'Action link is invalid or expired.');
      }
      if (error instanceof BookingActionGoneError) {
        return jsonError(context, 410, 'Action link is invalid or expired.');
      }
      throw error;
    }
  });
});

app.post('/v0/bookings/actions/:token/reschedule', async (context) => {
  const tokenParam = bookingActionTokenSchema.safeParse(context.req.param('token'));
  if (!tokenParam.success) {
    return jsonError(context, 404, 'Action link is invalid or expired.');
  }

  const body = await context.req.json().catch(() => null);
  const parsed = bookingRescheduleSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
  }

  const idempotencyKey = parseIdempotencyKey(context.req.raw);
  if ('error' in idempotencyKey) {
    return jsonError(context, 400, idempotencyKey.error);
  }

  const timezone = normalizeTimezone(parsed.data.timezone);
  const startsAt = DateTime.fromISO(parsed.data.startsAt, { zone: 'utc' });
  if (!startsAt.isValid) {
    return jsonError(context, 400, 'Invalid startsAt value.');
  }

  const requestIp = resolveClientIp(context.req.raw);

  const requestedStartsAtIso = startsAt.toUTC().toISO();
  if (!requestedStartsAtIso) {
    return jsonError(context, 400, 'Unable to normalize startsAt.');
  }

  const idempotencyRequestHash = hashIdempotencyRequestPayload({
    token: tokenParam.data,
    startsAt: parsed.data.startsAt,
    timezone,
  });

  return withDatabase(context, async (db) => {
    const idempotencyState = await claimIdempotencyRequest(db, {
      scope: 'booking_reschedule',
      rawKey: idempotencyKey.key,
      requestHash: idempotencyRequestHash,
    });
    if (idempotencyState.state === 'replay') {
      return context.json(idempotencyState.responseBody, idempotencyState.statusCode);
    }
    if (idempotencyState.state === 'mismatch') {
      return jsonError(
        context,
        409,
        'Idempotency key reuse with different request payload is not allowed.',
      );
    }
    if (idempotencyState.state === 'in_progress') {
      return jsonError(context, 409, 'A request with this idempotency key is already in progress.');
    }
    if (
      isPublicBookingRateLimited({
        ip: requestIp,
        scope: `reschedule|${hashToken(tokenParam.data)}`,
        perScopeLimit: PUBLIC_BOOKING_RATE_LIMIT_MAX_BOOKING_REQUESTS_PER_SCOPE,
      })
    ) {
      await releaseIdempotencyRequest(db, {
        scope: 'booking_reschedule',
        keyHash: idempotencyState.keyHash,
      });
      return jsonError(context, 429, 'Rate limit exceeded. Try again in a minute.');
    }

    try {
      const now = new Date();
      const result = await db.transaction(async (transaction) => {
        const token = await lockActionToken(transaction, hashToken(tokenParam.data));
        if (!token || token.actionType !== 'reschedule') {
          throw new BookingActionNotFoundError('Action link is invalid or expired.');
        }

        const booking = await lockBooking(transaction, token.bookingId);
        if (!booking) {
          throw new BookingActionNotFoundError('Booking not found.');
        }

        const eventTypeResult = await transaction.execute<EventTypeProfile>(sql`
          select
            id,
            user_id as "userId",
            slug,
            name,
            duration_minutes as "durationMinutes",
            location_type as "locationType",
            location_value as "locationValue",
            is_active as "isActive"
          from event_types
          where id = ${booking.eventTypeId}
          for update
        `);

        const organizerResult = await transaction.execute<OrganizerProfile>(sql`
          select
            id,
            email,
            username,
            display_name as "displayName",
            timezone
          from users
          where id = ${booking.organizerId}
          for update
        `);

        const eventTypeRow = eventTypeResult.rows[0];
        const organizerRow = organizerResult.rows[0];

        if (!eventTypeRow || !organizerRow || !eventTypeRow.isActive) {
          throw new BookingActionNotFoundError('Booking context not found.');
        }

        const findReplayBooking = async (): Promise<LockedBooking | null> => {
          const [rescheduledBooking] = token.consumedBookingId
            ? await transaction
                .select({
                  id: bookings.id,
                  eventTypeId: bookings.eventTypeId,
                  organizerId: bookings.organizerId,
                  inviteeName: bookings.inviteeName,
                  inviteeEmail: bookings.inviteeEmail,
                  startsAt: bookings.startsAt,
                  endsAt: bookings.endsAt,
                  status: bookings.status,
                  metadata: bookings.metadata,
                })
                .from(bookings)
                .where(eq(bookings.id, token.consumedBookingId))
                .limit(1)
            : await transaction
                .select({
                  id: bookings.id,
                  eventTypeId: bookings.eventTypeId,
                  organizerId: bookings.organizerId,
                  inviteeName: bookings.inviteeName,
                  inviteeEmail: bookings.inviteeEmail,
                  startsAt: bookings.startsAt,
                  endsAt: bookings.endsAt,
                  status: bookings.status,
                  metadata: bookings.metadata,
                })
                .from(bookings)
                .where(eq(bookings.rescheduledFromBookingId, booking.id))
                .orderBy(desc(bookings.createdAt))
                .limit(1);

          return rescheduledBooking ?? null;
        };

        const tokenState = evaluateBookingActionToken({
          actionType: token.actionType,
          bookingStatus: booking.status,
          expiresAt: token.expiresAt,
          consumedAt: token.consumedAt,
          now,
        });

        if (tokenState === 'idempotent-replay') {
          const replayBooking = await findReplayBooking();
          if (!replayBooking) {
            throw new BookingActionGoneError('Action link is invalid or expired.');
          }

          return {
            oldBooking: booking,
            newBooking: replayBooking,
            eventType: eventTypeRow,
            organizer: organizerRow,
            actionTokens: null,
            alreadyProcessed: true,
          };
        }

        if (tokenState === 'gone' || booking.status !== 'confirmed') {
          throw new BookingActionGoneError('Booking is not reschedulable.');
        }

        const requestedEndsAt = startsAt.plus({ minutes: eventTypeRow.durationMinutes });
        const requestedEndsAtIso = requestedEndsAt.toUTC().toISO();
        if (!requestedEndsAtIso) {
          throw new BookingValidationError('Unable to normalize end time.');
        }

        const rangeStart = startsAt.minus({ days: 1 });
        const rangeEnd = requestedEndsAt.plus({ days: 1 });
        const rangeStartIso = rangeStart.toUTC().toISO();
        if (!rangeStartIso) {
          throw new BookingValidationError('Unable to build slot validation range.');
        }

        const existingMetadata = parseBookingMetadata(booking.metadata, normalizeTimezone);
        const existingTeamAssignments = await transaction
          .select({
            teamEventTypeId: teamBookingAssignments.teamEventTypeId,
            userId: teamBookingAssignments.userId,
          })
          .from(teamBookingAssignments)
          .where(eq(teamBookingAssignments.bookingId, booking.id))
          .orderBy(asc(teamBookingAssignments.userId));

        let bufferBeforeMinutes = 0;
        let bufferAfterMinutes = 0;
        let teamAssignmentWrite: { teamEventTypeId: string; userIds: string[]; mode: TeamSchedulingMode } | null =
          null;

        if (existingTeamAssignments.length === 0) {
          const [rules, overrides, externalBusyWindows, existingBookings] = await Promise.all([
            transaction
              .select({
                dayOfWeek: availabilityRules.dayOfWeek,
                startMinute: availabilityRules.startMinute,
                endMinute: availabilityRules.endMinute,
                bufferBeforeMinutes: availabilityRules.bufferBeforeMinutes,
                bufferAfterMinutes: availabilityRules.bufferAfterMinutes,
              })
              .from(availabilityRules)
              .where(eq(availabilityRules.userId, organizerRow.id)),
            transaction
              .select({
                startAt: availabilityOverrides.startAt,
                endAt: availabilityOverrides.endAt,
                isAvailable: availabilityOverrides.isAvailable,
              })
              .from(availabilityOverrides)
              .where(
                and(
                  eq(availabilityOverrides.userId, organizerRow.id),
                  lt(availabilityOverrides.startAt, rangeEnd.toJSDate()),
                  gt(availabilityOverrides.endAt, rangeStart.toJSDate()),
                ),
              ),
            listExternalBusyWindowsForUser(
              transaction,
              organizerRow.id,
              rangeStart.toJSDate(),
              rangeEnd.toJSDate(),
            ),
            transaction
              .select({
                id: bookings.id,
                startsAt: bookings.startsAt,
                endsAt: bookings.endsAt,
                status: bookings.status,
                metadata: bookings.metadata,
              })
              .from(bookings)
              .where(
                and(
                  eq(bookings.organizerId, organizerRow.id),
                  eq(bookings.status, 'confirmed'),
                  lt(bookings.startsAt, rangeEnd.toJSDate()),
                  gt(bookings.endsAt, rangeStart.toJSDate()),
                ),
              ),
          ]);

          const slotResolution = resolveRequestedRescheduleSlot({
            requestedStartsAtIso,
            durationMinutes: eventTypeRow.durationMinutes,
            organizerTimezone: normalizeTimezone(organizerRow.timezone),
            rules,
            overrides: [
              ...overrides,
              ...externalBusyWindows.map((window) => ({
                startAt: window.startsAt,
                endAt: window.endsAt,
                isAvailable: false,
              })),
            ],
            bookings: existingBookings,
            excludeBookingId: booking.id,
          });

          if (!slotResolution) {
            throw new BookingConflictError('Selected slot is no longer available.');
          }

          bufferBeforeMinutes = slotResolution.matchingSlot.bufferBeforeMinutes;
          bufferAfterMinutes = slotResolution.matchingSlot.bufferAfterMinutes;
        } else {
          const teamEventTypeId = existingTeamAssignments[0]?.teamEventTypeId;
          if (!teamEventTypeId) {
            throw new BookingValidationError('Invalid team assignment state.');
          }

          const [teamEventRow] = await transaction
            .select({
              id: teamEventTypes.id,
              mode: teamEventTypes.mode,
            })
            .from(teamEventTypes)
            .where(eq(teamEventTypes.id, teamEventTypeId))
            .limit(1);

          const teamMode = teamEventRow ? resolveTeamMode(teamEventRow.mode) : null;
          if (!teamEventRow || !teamMode) {
            throw new BookingValidationError('Team scheduling mode is invalid.');
          }

          const assignmentUserIds = Array.from(
            new Set(existingTeamAssignments.map((assignment) => assignment.userId)),
          );
          const memberSchedules = await listTeamMemberSchedules(
            transaction,
            assignmentUserIds,
            rangeStart.toJSDate(),
            rangeEnd.toJSDate(),
          );

          const filteredMemberSchedules = memberSchedules.map((schedule) => ({
            ...schedule,
            bookings: schedule.bookings.filter(
              (existingBooking) =>
                !(
                  existingBooking.startsAt.getTime() === booking.startsAt.getTime() &&
                  existingBooking.endsAt.getTime() === booking.endsAt.getTime()
                ),
            ),
          }));

          const teamSlotResolution = resolveTeamRequestedSlot({
            mode: teamMode,
            memberSchedules: filteredMemberSchedules,
            requestedStartsAtIso,
            durationMinutes: eventTypeRow.durationMinutes,
            rangeStartIso,
            days: 2,
            roundRobinCursor: 0,
          });
          if (!teamSlotResolution) {
            throw new BookingConflictError('Selected slot is no longer available.');
          }

          bufferBeforeMinutes = teamSlotResolution.bufferBeforeMinutes;
          bufferAfterMinutes = teamSlotResolution.bufferAfterMinutes;
          teamAssignmentWrite = {
            teamEventTypeId,
            userIds: teamSlotResolution.assignmentUserIds,
            mode: teamMode,
          };
        }

        const metadata = JSON.stringify({
          answers: existingMetadata.answers,
          timezone,
          bufferBeforeMinutes,
          bufferAfterMinutes,
          ...(existingMetadata.team
            ? {
                team: {
                  ...existingMetadata.team,
                  ...(teamAssignmentWrite
                    ? {
                        assignmentUserIds: teamAssignmentWrite.userIds,
                        mode: teamAssignmentWrite.mode,
                      }
                    : {}),
                },
              }
            : {}),
        });

        let insertedBooking: {
          id: string;
          eventTypeId: string;
          organizerId: string;
          inviteeName: string;
          inviteeEmail: string;
          startsAt: Date;
          endsAt: Date;
        } | null = null;

        try {
          const [inserted] = await transaction
            .insert(bookings)
            .values({
              eventTypeId: booking.eventTypeId,
              organizerId: booking.organizerId,
              inviteeName: booking.inviteeName,
              inviteeEmail: booking.inviteeEmail,
              startsAt: startsAt.toJSDate(),
              endsAt: requestedEndsAt.toJSDate(),
              status: 'confirmed',
              rescheduledFromBookingId: booking.id,
              metadata,
            })
            .returning({
              id: bookings.id,
              eventTypeId: bookings.eventTypeId,
              organizerId: bookings.organizerId,
              inviteeName: bookings.inviteeName,
              inviteeEmail: bookings.inviteeEmail,
              startsAt: bookings.startsAt,
              endsAt: bookings.endsAt,
            });

          insertedBooking = inserted ?? null;
        } catch (error) {
          if (isUniqueViolation(error, 'bookings_unique_slot')) {
            throw new BookingConflictError('Selected slot is no longer available.');
          }
          throw error;
        }

        if (!insertedBooking) {
          throw new Error('Failed to create rescheduled booking.');
        }

        await transaction
          .update(bookings)
          .set({
            status: 'rescheduled',
          })
          .where(eq(bookings.id, booking.id));

        const tokenSet = createBookingActionTokenSet(now);
        await transaction.insert(bookingActionTokens).values(
          tokenSet.tokenWrites.map((tokenWrite) => ({
            bookingId: insertedBooking.id,
            actionType: tokenWrite.actionType,
            tokenHash: tokenWrite.tokenHash,
            expiresAt: tokenWrite.expiresAt,
          })),
        );

        await transaction
          .update(bookingActionTokens)
          .set({
            consumedAt: now,
            consumedBookingId: insertedBooking.id,
          })
          .where(
            and(eq(bookingActionTokens.bookingId, booking.id), isNull(bookingActionTokens.consumedAt)),
          );

        await transaction
          .delete(teamBookingAssignments)
          .where(eq(teamBookingAssignments.bookingId, booking.id));

        if (teamAssignmentWrite) {
          try {
            await transaction.insert(teamBookingAssignments).values(
              teamAssignmentWrite.userIds.map((memberUserId) => ({
                bookingId: insertedBooking.id,
                teamEventTypeId: teamAssignmentWrite.teamEventTypeId,
                userId: memberUserId,
                startsAt: insertedBooking.startsAt,
                endsAt: insertedBooking.endsAt,
              })),
            );
          } catch (error) {
            if (isUniqueViolation(error, 'team_booking_assignments_user_slot_unique')) {
              throw new BookingConflictError('Selected slot is no longer available.');
            }
            throw error;
          }
        }

        return {
          oldBooking: {
            ...booking,
            status: 'rescheduled',
          },
          newBooking: insertedBooking,
          eventType: eventTypeRow,
          organizer: organizerRow,
          actionTokens: tokenSet.publicTokens,
          alreadyProcessed: false,
        };
      });

      const email = result.alreadyProcessed
        ? {
            sent: false,
            provider: 'none' as const,
            error: 'Idempotent replay: reschedule already processed.',
          }
        : await Promise.all([
            sendBookingRescheduledEmail(context.env, {
              recipientEmail: result.newBooking.inviteeEmail,
              recipientName: result.newBooking.inviteeName,
              recipientRole: 'invitee',
              organizerDisplayName: result.organizer.displayName,
              eventName: result.eventType.name,
              oldStartsAt: result.oldBooking.startsAt.toISOString(),
              newStartsAt: result.newBooking.startsAt.toISOString(),
              timezone,
              idempotencyKey: `booking-rescheduled:${result.oldBooking.id}:${result.newBooking.id}:invitee`,
            }),
            sendBookingRescheduledEmail(context.env, {
              recipientEmail: result.organizer.email,
              recipientName: result.organizer.displayName,
              recipientRole: 'organizer',
              organizerDisplayName: result.organizer.displayName,
              eventName: result.eventType.name,
              oldStartsAt: result.oldBooking.startsAt.toISOString(),
              newStartsAt: result.newBooking.startsAt.toISOString(),
              timezone,
              idempotencyKey: `booking-rescheduled:${result.oldBooking.id}:${result.newBooking.id}:organizer`,
            }),
          ]);

      if (!result.alreadyProcessed && Array.isArray(email)) {
        const [inviteeEmailResult, organizerEmailResult] = email;
        if (inviteeEmailResult) {
          await tryRecordEmailDelivery(context.env, db, {
            organizerId: result.newBooking.organizerId,
            bookingId: result.newBooking.id,
            eventTypeId: result.newBooking.eventTypeId,
            recipientEmail: result.newBooking.inviteeEmail,
            emailType: 'booking_rescheduled',
            provider: inviteeEmailResult.provider,
            status: inviteeEmailResult.sent ? 'succeeded' : 'failed',
            ...(inviteeEmailResult.messageId
              ? { providerMessageId: inviteeEmailResult.messageId }
              : {}),
            ...(inviteeEmailResult.error ? { error: inviteeEmailResult.error } : {}),
          });
        }
        if (organizerEmailResult) {
          await tryRecordEmailDelivery(context.env, db, {
            organizerId: result.newBooking.organizerId,
            bookingId: result.newBooking.id,
            eventTypeId: result.newBooking.eventTypeId,
            recipientEmail: result.organizer.email,
            emailType: 'booking_rescheduled',
            provider: organizerEmailResult.provider,
            status: organizerEmailResult.sent ? 'succeeded' : 'failed',
            ...(organizerEmailResult.messageId
              ? { providerMessageId: organizerEmailResult.messageId }
              : {}),
            ...(organizerEmailResult.error ? { error: organizerEmailResult.error } : {}),
          });
        }
      }

      const queuedWebhookDeliveries = result.alreadyProcessed
        ? 0
        : await enqueueWebhookDeliveries(db, {
            organizerId: result.newBooking.organizerId,
            type: 'booking.rescheduled',
            booking: {
              id: result.newBooking.id,
              eventTypeId: result.newBooking.eventTypeId,
              organizerId: result.newBooking.organizerId,
              inviteeEmail: result.newBooking.inviteeEmail,
              inviteeName: result.newBooking.inviteeName,
              startsAtIso: result.newBooking.startsAt.toISOString(),
              endsAtIso: result.newBooking.endsAt.toISOString(),
            },
            metadata: {
              rescheduledFromBookingId: result.oldBooking.id,
              previousStartsAt: result.oldBooking.startsAt.toISOString(),
              previousEndsAt: result.oldBooking.endsAt.toISOString(),
            },
          });

      const writebackQueue = result.alreadyProcessed
        ? { queued: 0, rowIds: [] as string[] }
        : await enqueueCalendarWritebacksForBooking(db, {
            bookingId: result.oldBooking.id,
            organizerId: result.newBooking.organizerId,
            operation: 'reschedule',
            rescheduleTarget: {
              bookingId: result.newBooking.id,
              startsAtIso: result.newBooking.startsAt.toISOString(),
              endsAtIso: result.newBooking.endsAt.toISOString(),
            },
          });
      const writebackResult =
        writebackQueue.queued > 0
          ? await runCalendarWritebackBatch(db, context.env, {
              organizerId: result.newBooking.organizerId,
              rowIds: writebackQueue.rowIds,
              limit: clampCalendarWritebackBatchLimit(writebackQueue.queued),
            })
          : {
              processed: 0,
              succeeded: 0,
              retried: 0,
              failed: 0,
            };

      const actions = result.actionTokens
        ? (() => {
            const tokens = actionTokenMap(result.actionTokens);
            const urls = buildActionUrls(context.req.raw, {
              cancelToken: tokens.cancelToken,
              rescheduleToken: tokens.rescheduleToken,
            });

            return {
              cancel: {
                token: tokens.cancelToken,
                expiresAt: tokens.cancelExpiresAt,
                lookupUrl: urls.lookupCancelUrl,
                url: urls.cancelUrl,
              },
              reschedule: {
                token: tokens.rescheduleToken,
                expiresAt: tokens.rescheduleExpiresAt,
                lookupUrl: urls.lookupRescheduleUrl,
                url: urls.rescheduleUrl,
              },
            };
          })()
        : null;

      const responseBody: Record<string, unknown> = {
        ok: true,
        oldBooking: {
          id: result.oldBooking.id,
          status: result.oldBooking.status,
        },
        newBooking: {
          id: result.newBooking.id,
          status: 'confirmed',
          rescheduledFromBookingId: result.oldBooking.id,
          startsAt: result.newBooking.startsAt.toISOString(),
          endsAt: result.newBooking.endsAt.toISOString(),
        },
        actions,
        email,
        webhooks: {
          queued: queuedWebhookDeliveries,
        },
        calendarWriteback: {
          queued: writebackQueue.queued,
          ...writebackResult,
        },
      };

      await completeIdempotencyRequest(db, {
        scope: 'booking_reschedule',
        keyHash: idempotencyState.keyHash,
        statusCode: 200,
        responseBody,
      });

      return context.json(responseBody);
    } catch (error) {
      if (error instanceof BookingActionNotFoundError) {
        const responseBody: Record<string, unknown> = {
          ok: false,
          error: 'Action link is invalid or expired.',
        };
        await completeIdempotencyRequest(db, {
          scope: 'booking_reschedule',
          keyHash: idempotencyState.keyHash,
          statusCode: 404,
          responseBody,
        });
        return context.json(responseBody, 404);
      }
      if (error instanceof BookingActionGoneError) {
        const responseBody: Record<string, unknown> = {
          ok: false,
          error: 'Action link is invalid or expired.',
        };
        await completeIdempotencyRequest(db, {
          scope: 'booking_reschedule',
          keyHash: idempotencyState.keyHash,
          statusCode: 410,
          responseBody,
        });
        return context.json(responseBody, 410);
      }
      if (error instanceof BookingValidationError) {
        const responseBody: Record<string, unknown> = { ok: false, error: error.message };
        await completeIdempotencyRequest(db, {
          scope: 'booking_reschedule',
          keyHash: idempotencyState.keyHash,
          statusCode: 400,
          responseBody,
        });
        return context.json(responseBody, 400);
      }
      if (error instanceof BookingConflictError) {
        const responseBody: Record<string, unknown> = { ok: false, error: error.message };
        await completeIdempotencyRequest(db, {
          scope: 'booking_reschedule',
          keyHash: idempotencyState.keyHash,
          statusCode: 409,
          responseBody,
        });
        return context.json(responseBody, 409);
      }
      console.error('Unexpected error in booking reschedule:', error);
      const responseBody: Record<string, unknown> = {
        ok: false,
        error: 'Internal server error.',
      };
      await completeIdempotencyRequest(db, {
        scope: 'booking_reschedule',
        keyHash: idempotencyState.keyHash,
        statusCode: 500,
        responseBody,
      });
      return context.json(responseBody, 500);
    }
  });
});

app.onError((error, context) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  return jsonError(context, 500, message);
});

export default app;
