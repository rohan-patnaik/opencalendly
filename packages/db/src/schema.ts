import {
  boolean,
  integer,
  jsonb,
  type AnyPgColumn,
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
