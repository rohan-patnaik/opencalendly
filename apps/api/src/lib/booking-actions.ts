import { DateTime } from 'luxon';

import {
  computeAvailabilitySlots,
  type AvailabilityOverrideWindow,
  type AvailabilitySlot,
  type ExistingBooking,
  type WeeklyAvailabilityRule,
} from './availability';

export type BookingActionType = 'cancel' | 'reschedule';
export type BookingActionTokenState = 'usable' | 'idempotent-replay' | 'gone';

export type BookingMetadata = {
  answers: Record<string, string>;
  timezone?: string;
  team?: {
    teamId: string;
    teamSlug?: string;
    teamEventTypeId: string;
    mode: 'round_robin' | 'collective';
    assignmentUserIds: string[];
  };
};

type BookingWithOptionalId = ExistingBooking & {
  id?: string;
};

export const parseBookingMetadata = (
  metadata: string | null,
  normalizeTimezone: (timezone: string | undefined) => string,
): BookingMetadata => {
  if (!metadata) {
    return { answers: {} };
  }

  try {
    const parsed = JSON.parse(metadata) as {
      answers?: unknown;
      timezone?: unknown;
      team?: unknown;
    };

    const answers =
      parsed.answers && typeof parsed.answers === 'object' && !Array.isArray(parsed.answers)
        ? Object.fromEntries(
            Object.entries(parsed.answers).filter((entry) => typeof entry[1] === 'string'),
          )
        : {};

    const timezone =
      typeof parsed.timezone === 'string' && parsed.timezone.trim().length > 0
        ? normalizeTimezone(parsed.timezone)
        : undefined;

    const team =
      parsed.team &&
      typeof parsed.team === 'object' &&
      !Array.isArray(parsed.team) &&
      typeof (parsed.team as Record<string, unknown>).teamId === 'string' &&
      typeof (parsed.team as Record<string, unknown>).teamEventTypeId === 'string' &&
      ((parsed.team as Record<string, unknown>).mode === 'round_robin' ||
        (parsed.team as Record<string, unknown>).mode === 'collective') &&
      Array.isArray((parsed.team as Record<string, unknown>).assignmentUserIds)
        ? {
            teamId: (parsed.team as Record<string, unknown>).teamId as string,
            teamEventTypeId: (parsed.team as Record<string, unknown>).teamEventTypeId as string,
            mode: (parsed.team as Record<string, unknown>).mode as 'round_robin' | 'collective',
            assignmentUserIds: (
              (parsed.team as Record<string, unknown>).assignmentUserIds as unknown[]
            ).filter((value): value is string => typeof value === 'string'),
            ...((parsed.team as Record<string, unknown>).teamSlug &&
            typeof (parsed.team as Record<string, unknown>).teamSlug === 'string'
              ? { teamSlug: (parsed.team as Record<string, unknown>).teamSlug as string }
              : {}),
          }
        : undefined;

    return {
      answers,
      ...(timezone ? { timezone } : {}),
      ...(team ? { team } : {}),
    };
  } catch {
    return { answers: {} };
  }
};

export const evaluateBookingActionToken = (input: {
  actionType: BookingActionType;
  bookingStatus: string;
  expiresAt: Date;
  consumedAt: Date | null;
  now: Date;
}): BookingActionTokenState => {
  const replayable =
    (input.actionType === 'cancel' && input.bookingStatus === 'canceled') ||
    (input.actionType === 'reschedule' && input.bookingStatus === 'rescheduled');

  if (input.consumedAt && replayable) {
    return 'idempotent-replay';
  }

  if (input.expiresAt.getTime() <= input.now.getTime()) {
    return 'gone';
  }

  if (input.consumedAt) {
    return 'gone';
  }

  if (input.bookingStatus === 'confirmed') {
    return 'usable';
  }

  if (replayable) {
    return 'idempotent-replay';
  }

  return 'gone';
};

export const resolveRequestedRescheduleSlot = (input: {
  requestedStartsAtIso: string;
  durationMinutes: number;
  organizerTimezone: string;
  rules: WeeklyAvailabilityRule[];
  overrides: AvailabilityOverrideWindow[];
  bookings: BookingWithOptionalId[];
  excludeBookingId?: string;
}): {
  requestedStartsAt: Date;
  requestedEndsAt: Date;
  requestedStartsAtIso: string;
  requestedEndsAtIso: string;
  rangeStart: Date;
  rangeEnd: Date;
  matchingSlot: AvailabilitySlot;
} | null => {
  const startsAt = DateTime.fromISO(input.requestedStartsAtIso, { zone: 'utc' });
  if (!startsAt.isValid) {
    return null;
  }

  const endsAt = startsAt.plus({ minutes: input.durationMinutes });
  const requestedStartsAtIso = startsAt.toUTC().toISO();
  const requestedEndsAtIso = endsAt.toUTC().toISO();
  if (!requestedStartsAtIso || !requestedEndsAtIso) {
    return null;
  }

  const rangeStart = startsAt.minus({ days: 1 });
  const rangeEnd = endsAt.plus({ days: 1 });
  const rangeStartIso = rangeStart.toUTC().toISO();
  if (!rangeStartIso) {
    return null;
  }

  const candidateSlots = computeAvailabilitySlots({
    organizerTimezone: input.organizerTimezone,
    rangeStartIso,
    days: 2,
    durationMinutes: input.durationMinutes,
    rules: input.rules,
    overrides: input.overrides,
    bookings: input.excludeBookingId
      ? input.bookings.filter((booking) => booking.id !== input.excludeBookingId)
      : input.bookings,
  });

  const slotKey = `${requestedStartsAtIso}|${requestedEndsAtIso}`;
  const matchingSlot = candidateSlots.find((slot) => `${slot.startsAt}|${slot.endsAt}` === slotKey);

  if (!matchingSlot) {
    return null;
  }

  return {
    requestedStartsAt: startsAt.toJSDate(),
    requestedEndsAt: endsAt.toJSDate(),
    requestedStartsAtIso,
    requestedEndsAtIso,
    rangeStart: rangeStart.toJSDate(),
    rangeEnd: rangeEnd.toJSDate(),
    matchingSlot,
  };
};
