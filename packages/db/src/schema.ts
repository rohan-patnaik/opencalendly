import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  type AnyPgColumn,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

type EventQuestionRecord = {
  id: string;
  label: string;
  required: boolean;
  placeholder?: string | undefined;
};

type WebhookEventTypeRecord = 'booking.created' | 'booking.canceled' | 'booking.rescheduled';
type WebhookDeliveryStatusRecord = 'pending' | 'succeeded' | 'failed';
type CalendarProviderRecord = 'google' | 'microsoft';
type CalendarWritebackOperationRecord = 'create' | 'cancel' | 'reschedule';
type CalendarWritebackStatusRecord = 'pending' | 'succeeded' | 'failed';
type AnalyticsFunnelStageRecord = 'page_view' | 'slot_selection' | 'booking_confirmed';
type EmailDeliveryTypeRecord = 'booking_confirmation' | 'booking_cancellation' | 'booking_rescheduled';
type EmailDeliveryStatusRecord = 'succeeded' | 'failed';
type WebhookEventPayloadRecord = {
  id: string;
  type: WebhookEventTypeRecord;
  createdAt: string;
  payload: {
    bookingId: string;
    eventTypeId: string;
    organizerId: string;
    inviteeEmail: string;
    inviteeName: string;
    startsAt: string;
    endsAt: string;
    metadata?: Record<string, unknown> | undefined;
  };
};

export const teamMemberRoleEnum = pgEnum('team_member_role', ['owner', 'member']);
export const teamSchedulingModeEnum = pgEnum('team_scheduling_mode', ['round_robin', 'collective']);
export const calendarProviderEnum = pgEnum('calendar_provider', ['google', 'microsoft']);
export const calendarWritebackOperationEnum = pgEnum('calendar_writeback_operation', [
  'create',
  'cancel',
  'reschedule',
]);
export const calendarWritebackStatusEnum = pgEnum('calendar_writeback_status', [
  'pending',
  'succeeded',
  'failed',
]);
export const analyticsFunnelStageEnum = pgEnum('analytics_funnel_stage', [
  'page_view',
  'slot_selection',
  'booking_confirmed',
]);
export const emailDeliveryTypeEnum = pgEnum('email_delivery_type', [
  'booking_confirmation',
  'booking_cancellation',
  'booking_rescheduled',
]);
export const emailDeliveryStatusEnum = pgEnum('email_delivery_status', ['succeeded', 'failed']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  username: varchar('username', { length: 64 }).notNull().unique(),
  displayName: varchar('display_name', { length: 120 }).notNull(),
  timezone: varchar('timezone', { length: 80 }).notNull().default('UTC'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const eventTypes = pgTable(
  'event_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 80 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    durationMinutes: integer('duration_minutes').notNull(),
    locationType: varchar('location_type', { length: 32 }).notNull().default('video'),
    locationValue: text('location_value'),
    questions: jsonb('questions')
      .$type<EventQuestionRecord[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueSlugPerUser: unique('event_types_user_slug_unique').on(table.userId, table.slug),
  }),
);

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  slug: varchar('slug', { length: 80 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const teamMembers = pgTable(
  'team_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: teamMemberRoleEnum('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueTeamUser: unique('team_members_team_user_unique').on(table.teamId, table.userId),
  }),
);

export const teamEventTypes = pgTable(
  'team_event_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    eventTypeId: uuid('event_type_id')
      .notNull()
      .references(() => eventTypes.id, { onDelete: 'cascade' }),
    mode: teamSchedulingModeEnum('mode').notNull(),
    roundRobinCursor: integer('round_robin_cursor').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueTeamEventType: unique('team_event_types_team_event_type_unique').on(table.teamId, table.eventTypeId),
    uniqueEventType: unique('team_event_types_event_type_unique').on(table.eventTypeId),
  }),
);

export const teamEventTypeMembers = pgTable(
  'team_event_type_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamEventTypeId: uuid('team_event_type_id')
      .notNull()
      .references(() => teamEventTypes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    isRequired: boolean('is_required').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueTeamEventTypeUser: unique('team_event_type_members_event_type_user_unique').on(
      table.teamEventTypeId,
      table.userId,
    ),
  }),
);

export const availabilityRules = pgTable('availability_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(),
  startMinute: integer('start_minute').notNull(),
  endMinute: integer('end_minute').notNull(),
  bufferBeforeMinutes: integer('buffer_before_minutes').notNull().default(0),
  bufferAfterMinutes: integer('buffer_after_minutes').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const availabilityOverrides = pgTable('availability_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }).notNull(),
  isAvailable: boolean('is_available').notNull().default(false),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventTypeId: uuid('event_type_id')
      .notNull()
      .references(() => eventTypes.id, { onDelete: 'cascade' }),
    organizerId: uuid('organizer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    inviteeName: varchar('invitee_name', { length: 120 }).notNull(),
    inviteeEmail: varchar('invitee_email', { length: 320 }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('confirmed'),
    rescheduledFromBookingId: uuid('rescheduled_from_booking_id').references(
      (): AnyPgColumn => bookings.id,
      {
        onDelete: 'set null',
      },
    ),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    canceledBy: varchar('canceled_by', { length: 32 }),
    cancellationReason: text('cancellation_reason'),
    metadata: text('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueSlot: unique('bookings_unique_slot').on(table.organizerId, table.startsAt, table.endsAt),
  }),
);

export const analyticsFunnelEvents = pgTable(
  'analytics_funnel_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizerId: uuid('organizer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventTypeId: uuid('event_type_id')
      .notNull()
      .references(() => eventTypes.id, { onDelete: 'cascade' }),
    teamEventTypeId: uuid('team_event_type_id').references(() => teamEventTypes.id, {
      onDelete: 'set null',
    }),
    stage: analyticsFunnelStageEnum('stage').$type<AnalyticsFunnelStageRecord>().notNull(),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    organizerOccurredAtIndex: index('analytics_funnel_events_organizer_occurred_at_idx').on(
      table.organizerId,
      table.occurredAt,
    ),
    organizerStageOccurredAtIndex: index(
      'analytics_funnel_events_organizer_stage_occurred_at_idx',
    ).on(table.organizerId, table.stage, table.occurredAt),
    eventTypeOccurredAtIndex: index('analytics_funnel_events_event_type_occurred_at_idx').on(
      table.eventTypeId,
      table.occurredAt,
    ),
  }),
);

export const emailDeliveries = pgTable(
  'email_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizerId: uuid('organizer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    eventTypeId: uuid('event_type_id').references(() => eventTypes.id, { onDelete: 'set null' }),
    recipientEmail: varchar('recipient_email', { length: 320 }).notNull(),
    emailType: emailDeliveryTypeEnum('email_type').$type<EmailDeliveryTypeRecord>().notNull(),
    status: emailDeliveryStatusEnum('status').$type<EmailDeliveryStatusRecord>().notNull(),
    provider: varchar('provider', { length: 32 }).notNull().default('none'),
    providerMessageId: varchar('provider_message_id', { length: 255 }),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    organizerCreatedAtIndex: index('email_deliveries_organizer_created_at_idx').on(
      table.organizerId,
      table.createdAt,
    ),
    organizerStatusCreatedAtIndex: index('email_deliveries_organizer_status_created_at_idx').on(
      table.organizerId,
      table.status,
      table.createdAt,
    ),
    bookingCreatedAtIndex: index('email_deliveries_booking_created_at_idx').on(
      table.bookingId,
      table.createdAt,
    ),
  }),
);

export const bookingActionTokens = pgTable(
  'booking_action_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    actionType: varchar('action_type', { length: 20 }).notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    consumedBookingId: uuid('consumed_booking_id').references((): AnyPgColumn => bookings.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueBookingAction: unique('booking_action_tokens_booking_action_unique').on(
      table.bookingId,
      table.actionType,
    ),
  }),
);

export const teamBookingAssignments = pgTable(
  'team_booking_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    teamEventTypeId: uuid('team_event_type_id')
      .notNull()
      .references(() => teamEventTypes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueBookingUser: unique('team_booking_assignments_booking_user_unique').on(
      table.bookingId,
      table.userId,
    ),
    uniqueMemberSlot: unique('team_booking_assignments_user_slot_unique').on(
      table.userId,
      table.startsAt,
      table.endsAt,
    ),
    bookingIdIndex: index('team_booking_assignments_booking_id_idx').on(table.bookingId),
    teamEventTypeIdIndex: index('team_booking_assignments_team_event_type_id_idx').on(
      table.teamEventTypeId,
    ),
    teamMembershipFk: foreignKey({
      columns: [table.teamEventTypeId, table.userId],
      foreignColumns: [teamEventTypeMembers.teamEventTypeId, teamEventTypeMembers.userId],
      name: 'team_booking_assignments_member_fk',
    }),
  }),
);

export const demoCreditsDaily = pgTable('demo_credits_daily', {
  dateKey: varchar('date_key', { length: 10 }).primaryKey(),
  used: integer('used').notNull().default(0),
  dailyLimit: integer('daily_limit').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dateKey: varchar('date_key', { length: 10 }).notNull(),
    email: varchar('email', { length: 320 }).notNull(),
    source: varchar('source', { length: 80 }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueDailyEmail: unique('waitlist_entries_daily_email_unique').on(table.dateKey, table.email),
  }),
);

export const webhookSubscriptions = pgTable(
  'webhook_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    url: varchar('url', { length: 2000 }).notNull(),
    secret: text('secret').notNull(),
    events: jsonb('events').$type<WebhookEventTypeRecord[]>().notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueUserUrl: unique('webhook_subscriptions_user_url_unique').on(table.userId, table.url),
  }),
);

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => webhookSubscriptions.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').notNull(),
    eventType: varchar('event_type', { length: 40 }).notNull(),
    payload: jsonb('payload').$type<WebhookEventPayloadRecord>().notNull(),
    status: varchar('status', { length: 20 })
      .$type<WebhookDeliveryStatusRecord>()
      .notNull()
      .default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(6),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    lastResponseStatus: integer('last_response_status'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueSubscriptionEvent: unique('webhook_deliveries_subscription_event_unique').on(
      table.subscriptionId,
      table.eventId,
    ),
  }),
);

export const calendarConnections = pgTable(
  'calendar_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: calendarProviderEnum('provider').$type<CalendarProviderRecord>().notNull(),
    externalAccountId: varchar('external_account_id', { length: 255 }),
    externalEmail: varchar('external_email', { length: 320 }),
    accessTokenEncrypted: text('access_token_encrypted').notNull(),
    refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }).notNull(),
    scope: text('scope'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    nextSyncAt: timestamp('next_sync_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueUserProvider: unique('calendar_connections_user_provider_unique').on(
      table.userId,
      table.provider,
    ),
    uniqueIdProvider: unique('calendar_connections_id_provider_unique').on(table.id, table.provider),
    userProviderIndex: index('calendar_connections_user_provider_idx').on(table.userId, table.provider),
  }),
);

export const calendarBusyWindows = pgTable(
  'calendar_busy_windows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => calendarConnections.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: calendarProviderEnum('provider').$type<CalendarProviderRecord>().notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    sourceId: varchar('source_id', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueConnectionSlot: unique('calendar_busy_windows_connection_slot_unique').on(
      table.connectionId,
      table.startsAt,
      table.endsAt,
    ),
    userRangeIndex: index('calendar_busy_windows_user_starts_at_idx').on(table.userId, table.startsAt),
    userProviderRangeIndex: index('calendar_busy_windows_user_provider_starts_at_idx').on(
      table.userId,
      table.provider,
      table.startsAt,
    ),
    timeOrderCheck: check(
      'calendar_busy_windows_time_order_check',
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
  }),
);

export const bookingExternalEvents = pgTable(
  'booking_external_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    organizerId: uuid('organizer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id'),
    provider: calendarProviderEnum('provider').$type<CalendarProviderRecord>().notNull(),
    operation: calendarWritebackOperationEnum('operation')
      .$type<CalendarWritebackOperationRecord>()
      .notNull()
      .default('create'),
    status: calendarWritebackStatusEnum('status')
      .$type<CalendarWritebackStatusRecord>()
      .notNull()
      .default('pending'),
    externalEventId: varchar('external_event_id', { length: 255 }),
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueBookingProvider: unique('booking_external_events_booking_provider_unique').on(
      table.bookingId,
      table.provider,
    ),
    organizerStatusNextAttemptIndex: index(
      'booking_external_events_organizer_status_next_attempt_idx',
    ).on(table.organizerId, table.status, table.nextAttemptAt),
    statusNextAttemptIndex: index('booking_external_events_status_next_attempt_idx').on(
      table.status,
      table.nextAttemptAt,
    ),
    connectionIndex: index('booking_external_events_connection_idx').on(table.connectionId),
    connectionProviderFk: foreignKey({
      columns: [table.connectionId, table.provider],
      foreignColumns: [calendarConnections.id, calendarConnections.provider],
      name: 'booking_external_events_connection_provider_fk',
    }).onDelete('no action'),
    attemptCountCheck: check('booking_external_events_attempt_count_check', sql`${table.attemptCount} >= 0`),
    maxAttemptsCheck: check('booking_external_events_max_attempts_check', sql`${table.maxAttempts} >= 1`),
  }),
);
