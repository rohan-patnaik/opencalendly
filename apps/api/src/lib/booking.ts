import { DateTime } from 'luxon';

import {
  computeAvailabilitySlots,
  type AvailabilityOverrideWindow,
  type ExistingBooking,
  type WeeklyAvailabilityRule,
} from './availability';
import { createRawToken, hashToken } from './auth';
import { buildBookingCapWindowsForSlot } from './booking-caps';

export class BookingValidationError extends Error {}
export class BookingNotFoundError extends Error {}
export class BookingConflictError extends Error {}
export class BookingUniqueConstraintError extends Error {}

export const BOOKING_ACTION_TOKEN_TTL_DAYS = 30;
export const BOOKING_ACTION_TYPES = ['cancel', 'reschedule'] as const;
export type BookingActionType = (typeof BOOKING_ACTION_TYPES)[number];

export type PublicEventType = {
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
  questions: Array<{ id: string; label: string; required: boolean; placeholder?: string | undefined }>;
  isActive: boolean;
  organizerDisplayName: string;
  organizerEmail: string;
  organizerTimezone: string;
};

export type CommitBookingInput = {
  username: string;
  eventSlug: string;
  startsAt: string;
  timezone: string;
  inviteeName: string;
  inviteeEmail: string;
  answers?: Record<string, string>;
};

export type InsertedBooking = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  eventTypeId: string;
  organizerId: string;
  inviteeEmail: string;
  inviteeName: string;
};

export type BookingActionTokenWrite = {
  actionType: BookingActionType;
  tokenHash: string;
  expiresAt: Date;
};

export type BookingActionTokenPublic = {
  actionType: BookingActionType;
  token: string;
  expiresAt: string;
};

export type BookingTransaction = {
  lockEventType(eventTypeId: string): Promise<void>;
  listRules(userId: string): Promise<WeeklyAvailabilityRule[]>;
  listOverrides(userId: string, rangeStart: Date, rangeEnd: Date): Promise<AvailabilityOverrideWindow[]>;
  listExternalBusyWindows(
    userId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<Array<{ startsAt: Date; endsAt: Date }>>;
  listConfirmedBookings(
    organizerId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<ExistingBooking[]>;
  countConfirmedEventTypeBookingsInWindow(input: {
    eventTypeId: string;
    startsAt: Date;
    endsAt: Date;
  }): Promise<number>;
  insertBooking(input: {
    eventTypeId: string;
    organizerId: string;
    inviteeName: string;
    inviteeEmail: string;
    startsAt: Date;
    endsAt: Date;
    metadata: string | null;
  }): Promise<InsertedBooking>;
  insertActionTokens(bookingId: string, tokens: BookingActionTokenWrite[]): Promise<void>;
  afterInsertBooking?(booking: InsertedBooking): Promise<void>;
};

export type BookingDataAccess = {
  getPublicEventType(username: string, eventSlug: string): Promise<PublicEventType | null>;
  withEventTypeTransaction<T>(
    eventTypeId: string,
    callback: (transaction: BookingTransaction) => Promise<T>,
  ): Promise<T>;
};

export type CommitBookingResult = {
  eventType: PublicEventType;
  booking: InsertedBooking;
  actionTokens: BookingActionTokenPublic[];
  performance: {
    lockMs: number;
    scheduleLoadMs: number;
    availabilityComputeMs: number;
    capCheckMs: number;
    insertMs: number;
  };
};

const slotKey = (startsAt: string, endsAt: string): string => `${startsAt}|${endsAt}`;

export const normalizeBookingAnswersForIdempotency = (
  answers: Record<string, string> | undefined,
): Record<string, string> => {
  if (!answers) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(answers).flatMap(([questionId, rawValue]) => {
      if (typeof rawValue !== 'string') {
        return [];
      }

      const value = rawValue.trim();
      if (!value) {
        return [];
      }

      return [[questionId, value]];
    }),
  );
};

export const validateBookingAnswers = (
  questions: PublicEventType['questions'],
  answers: Record<string, string> | undefined,
): Record<string, string> => {
  const providedAnswers = answers ?? {};
  const questionById = new Map(questions.map((question) => [question.id, question]));

  for (const questionId of Object.keys(providedAnswers)) {
    if (!questionById.has(questionId)) {
      throw new BookingValidationError(`Unknown booking question: "${questionId}".`);
    }
  }

  const normalizedAnswers: Record<string, string> = {};

  for (const question of questions) {
    const rawValue = providedAnswers[question.id];
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';

    if (!value) {
      if (question.required) {
        throw new BookingValidationError(`Answer required question: "${question.label}".`);
      }
      continue;
    }

    normalizedAnswers[question.id] = value;
  }

  return normalizedAnswers;
};

export const createBookingActionTokenSet = (
  now: Date = new Date(),
): {
  tokenWrites: BookingActionTokenWrite[];
  publicTokens: BookingActionTokenPublic[];
} => {
  const expiresAt = new Date(now.getTime() + BOOKING_ACTION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const rawTokens = BOOKING_ACTION_TYPES.map((actionType) => ({
    actionType,
    token: createRawToken(),
  }));

  return {
    tokenWrites: rawTokens.map((token) => ({
      actionType: token.actionType,
      tokenHash: hashToken(token.token),
      expiresAt,
    })),
    publicTokens: rawTokens.map((token) => ({
      actionType: token.actionType,
      token: token.token,
      expiresAt: expiresAt.toISOString(),
    })),
  };
};

export const commitBooking = async (
  dataAccess: BookingDataAccess,
  input: CommitBookingInput,
): Promise<CommitBookingResult> => {
  const eventType = await dataAccess.getPublicEventType(input.username, input.eventSlug);
  if (!eventType || !eventType.isActive) {
    throw new BookingNotFoundError('Event type not found.');
  }
  const normalizedAnswers = validateBookingAnswers(eventType.questions, input.answers);

  const startsAt = DateTime.fromISO(input.startsAt, { zone: 'utc' });
  if (!startsAt.isValid) {
    throw new BookingValidationError('Invalid startsAt value.');
  }

  const endsAt = startsAt.plus({ minutes: eventType.durationMinutes });
  const startsAtIso = startsAt.toUTC().toISO();
  const endsAtIso = endsAt.toUTC().toISO();

  if (!startsAtIso || !endsAtIso) {
    throw new BookingValidationError('Unable to normalize slot timestamps.');
  }

  const rangeStart = startsAt.minus({ days: 1 }).toJSDate();
  const rangeEnd = endsAt.plus({ days: 1 }).toJSDate();
  const rangeStartIso = DateTime.fromJSDate(rangeStart, { zone: 'utc' }).toISO();

  if (!rangeStartIso) {
    throw new BookingValidationError('Unable to build slot validation range.');
  }

  const result = await dataAccess.withEventTypeTransaction(eventType.id, async (transaction) => {
    const lockStartedAt = Date.now();
    await transaction.lockEventType(eventType.id);
    const lockMs = Date.now() - lockStartedAt;

    const scheduleLoadStartedAt = Date.now();
    const [rules, overrides, externalBusyWindows, confirmedBookings] = await Promise.all([
      transaction.listRules(eventType.userId),
      transaction.listOverrides(eventType.userId, rangeStart, rangeEnd),
      transaction.listExternalBusyWindows(eventType.userId, rangeStart, rangeEnd),
      transaction.listConfirmedBookings(eventType.userId, rangeStart, rangeEnd),
    ]);
    const scheduleLoadMs = Date.now() - scheduleLoadStartedAt;

    const blockingBusyOverrides: AvailabilityOverrideWindow[] = externalBusyWindows.map((window) => ({
      startAt: window.startsAt,
      endAt: window.endsAt,
      isAvailable: false,
    }));

    const availabilityComputeStartedAt = Date.now();
    const slots = computeAvailabilitySlots({
      organizerTimezone: eventType.organizerTimezone,
      rangeStartIso,
      days: 2,
      durationMinutes: eventType.durationMinutes,
      rules,
      overrides: [...overrides, ...blockingBusyOverrides],
      bookings: confirmedBookings,
    });
    const availabilityComputeMs = Date.now() - availabilityComputeStartedAt;

    const requestedSlot = slotKey(startsAtIso, endsAtIso);
    const matchingSlot = slots.find((slot) => slotKey(slot.startsAt, slot.endsAt) === requestedSlot);

    if (!matchingSlot) {
      throw new BookingConflictError('Selected slot is no longer available.');
    }

    const capWindows = buildBookingCapWindowsForSlot({
      startsAtIso,
      timezone: eventType.organizerTimezone,
      caps: {
        dailyBookingLimit: eventType.dailyBookingLimit,
        weeklyBookingLimit: eventType.weeklyBookingLimit,
        monthlyBookingLimit: eventType.monthlyBookingLimit,
      },
    });

    const capCheckStartedAt = Date.now();
    for (const window of capWindows) {
      const existingCount = await transaction.countConfirmedEventTypeBookingsInWindow({
        eventTypeId: eventType.id,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
      });

      if (existingCount >= window.limit) {
        throw new BookingConflictError('Booking limit reached for this event window.');
      }
    }
    const capCheckMs = Date.now() - capCheckStartedAt;

    const metadata = JSON.stringify({
      answers: normalizedAnswers,
      timezone: input.timezone,
      bufferBeforeMinutes: matchingSlot.bufferBeforeMinutes,
      bufferAfterMinutes: matchingSlot.bufferAfterMinutes,
    });

    const actionTokenSet = createBookingActionTokenSet();

    try {
      const insertStartedAt = Date.now();
      const booking = await transaction.insertBooking({
        eventTypeId: eventType.id,
        organizerId: eventType.userId,
        inviteeName: input.inviteeName,
        inviteeEmail: input.inviteeEmail,
        startsAt: startsAt.toJSDate(),
        endsAt: endsAt.toJSDate(),
        metadata,
      });

      await transaction.insertActionTokens(booking.id, actionTokenSet.tokenWrites);
      await transaction.afterInsertBooking?.(booking);
      const insertMs = Date.now() - insertStartedAt;

      return {
        booking,
        actionTokens: actionTokenSet.publicTokens,
        performance: {
          lockMs,
          scheduleLoadMs,
          availabilityComputeMs,
          capCheckMs,
          insertMs,
        },
      };
    } catch (error) {
      if (error instanceof BookingUniqueConstraintError) {
        throw new BookingConflictError('Selected slot is no longer available.');
      }
      throw error;
    }
  });

  return {
    eventType,
    booking: result.booking,
    actionTokens: result.actionTokens,
    performance: result.performance,
  };
};
