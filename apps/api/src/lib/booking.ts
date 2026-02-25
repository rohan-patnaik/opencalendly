import { DateTime } from 'luxon';

import {
  computeAvailabilitySlots,
  type AvailabilityOverrideWindow,
  type ExistingBooking,
  type WeeklyAvailabilityRule,
} from './availability';

export class BookingValidationError extends Error {}
export class BookingNotFoundError extends Error {}
export class BookingConflictError extends Error {}
export class BookingUniqueConstraintError extends Error {}

export type PublicEventType = {
  id: string;
  userId: string;
  slug: string;
  name: string;
  durationMinutes: number;
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

export type BookingTransaction = {
  lockEventType(eventTypeId: string): Promise<void>;
  listRules(userId: string): Promise<WeeklyAvailabilityRule[]>;
  listOverrides(userId: string, rangeStart: Date, rangeEnd: Date): Promise<AvailabilityOverrideWindow[]>;
  listConfirmedBookings(
    eventTypeId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<ExistingBooking[]>;
  insertBooking(input: {
    eventTypeId: string;
    organizerId: string;
    inviteeName: string;
    inviteeEmail: string;
    startsAt: Date;
    endsAt: Date;
    metadata: string | null;
  }): Promise<InsertedBooking>;
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
};

const slotKey = (startsAt: string, endsAt: string): string => `${startsAt}|${endsAt}`;

export const commitBooking = async (
  dataAccess: BookingDataAccess,
  input: CommitBookingInput,
): Promise<CommitBookingResult> => {
  const eventType = await dataAccess.getPublicEventType(input.username, input.eventSlug);
  if (!eventType || !eventType.isActive) {
    throw new BookingNotFoundError('Event type not found.');
  }

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

  const booking = await dataAccess.withEventTypeTransaction(eventType.id, async (transaction) => {
    await transaction.lockEventType(eventType.id);

    const [rules, overrides, confirmedBookings] = await Promise.all([
      transaction.listRules(eventType.userId),
      transaction.listOverrides(eventType.userId, rangeStart, rangeEnd),
      transaction.listConfirmedBookings(eventType.id, rangeStart, rangeEnd),
    ]);

    const slots = computeAvailabilitySlots({
      organizerTimezone: eventType.organizerTimezone,
      rangeStartIso,
      days: 2,
      durationMinutes: eventType.durationMinutes,
      rules,
      overrides,
      bookings: confirmedBookings,
    });

    const requestedSlot = slotKey(startsAtIso, endsAtIso);
    const matchingSlot = slots.find((slot) => slotKey(slot.startsAt, slot.endsAt) === requestedSlot);

    if (!matchingSlot) {
      throw new BookingConflictError('Selected slot is no longer available.');
    }

    const metadata = JSON.stringify({
      answers: input.answers ?? {},
      timezone: input.timezone,
      bufferBeforeMinutes: matchingSlot.bufferBeforeMinutes,
      bufferAfterMinutes: matchingSlot.bufferAfterMinutes,
    });

    try {
      return await transaction.insertBooking({
        eventTypeId: eventType.id,
        organizerId: eventType.userId,
        inviteeName: input.inviteeName,
        inviteeEmail: input.inviteeEmail,
        startsAt: startsAt.toJSDate(),
        endsAt: endsAt.toJSDate(),
        metadata,
      });
    } catch (error) {
      if (error instanceof BookingUniqueConstraintError) {
        throw new BookingConflictError('Selected slot is no longer available.');
      }
      throw error;
    }
  });

  return { eventType, booking };
};
