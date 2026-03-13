import { and, asc, eq, gt, lt } from 'drizzle-orm';
import type { DateTime } from 'luxon';

import {
  availabilityOverrides,
  availabilityRules,
  bookings,
  teamBookingAssignments,
  teamEventTypeMembers,
  teamEventTypes,
} from '@opencalendly/db';

import type { BookingMetadata } from '../lib/booking-actions';
import { resolveRequestedRescheduleSlot } from '../lib/booking-actions';
import { buildBookingCapWindowsForSlot } from '../lib/booking-caps';
import { BookingConflictError, BookingValidationError } from '../lib/booking';
import { normalizeTimezone } from './core';
import {
  countConfirmedBookingsForEventTypeWindow,
  resolveTeamMode,
  toEventTypeBookingCaps,
} from './team-context';
import { listExternalBusyWindowsForUser, listTeamMemberSchedules, listTimeOffBlocksForUser, resolveTeamRequestedSlot } from './team-schedules';
import type {
  DatabaseTransaction,
  EventTypeProfile,
  LockedBooking,
  OrganizerProfile,
  TeamSchedulingMode,
} from './types';

export type TeamAssignmentWrite = {
  teamEventTypeId: string;
  userIds: string[];
  mode: TeamSchedulingMode;
  nextRoundRobinCursor: number;
  organizerId: string;
};

export type ReschedulePlan = {
  metadata: string;
  nextOrganizerId: string;
  requestedEndsAt: DateTime;
  teamAssignmentWrite: TeamAssignmentWrite | null;
};

export const buildReschedulePlan = async (
  transaction: DatabaseTransaction,
  input: {
    booking: LockedBooking;
    eventType: EventTypeProfile;
    organizer: OrganizerProfile;
    startsAt: DateTime;
    timezone: string;
    requestedStartsAtIso: string;
    existingMetadata: BookingMetadata;
  },
): Promise<ReschedulePlan> => {
  const requestedEndsAt = input.startsAt.plus({ minutes: input.eventType.durationMinutes });
  const requestedEndsAtIso = requestedEndsAt.toUTC().toISO();
  if (!requestedEndsAtIso) {
    throw new BookingValidationError('Unable to normalize end time.');
  }

  const rangeStart = input.startsAt.minus({ days: 1 });
  const rangeEnd = requestedEndsAt.plus({ days: 1 });
  const rangeStartIso = rangeStart.toUTC().toISO();
  if (!rangeStartIso) {
    throw new BookingValidationError('Unable to build slot validation range.');
  }

  const existingTeamAssignments = await transaction
    .select({
      teamEventTypeId: teamBookingAssignments.teamEventTypeId,
      userId: teamBookingAssignments.userId,
    })
    .from(teamBookingAssignments)
    .where(eq(teamBookingAssignments.bookingId, input.booking.id))
    .orderBy(asc(teamBookingAssignments.userId));

  let bufferBeforeMinutes = 0;
  let bufferAfterMinutes = 0;
  let teamAssignmentWrite: TeamAssignmentWrite | null = null;

  if (existingTeamAssignments.length === 0) {
    const [rules, overrides, userTimeOffBlocks, externalBusyWindows, existingBookings] = await Promise.all([
      transaction
        .select({
          dayOfWeek: availabilityRules.dayOfWeek,
          startMinute: availabilityRules.startMinute,
          endMinute: availabilityRules.endMinute,
          bufferBeforeMinutes: availabilityRules.bufferBeforeMinutes,
          bufferAfterMinutes: availabilityRules.bufferAfterMinutes,
        })
        .from(availabilityRules)
        .where(eq(availabilityRules.userId, input.organizer.id)),
      transaction
        .select({
          startAt: availabilityOverrides.startAt,
          endAt: availabilityOverrides.endAt,
          isAvailable: availabilityOverrides.isAvailable,
        })
        .from(availabilityOverrides)
        .where(
          and(
            eq(availabilityOverrides.userId, input.organizer.id),
            lt(availabilityOverrides.startAt, rangeEnd.toJSDate()),
            gt(availabilityOverrides.endAt, rangeStart.toJSDate()),
          ),
        ),
      listTimeOffBlocksForUser(transaction, input.organizer.id, rangeStart.toJSDate(), rangeEnd.toJSDate()),
      listExternalBusyWindowsForUser(transaction, input.organizer.id, rangeStart.toJSDate(), rangeEnd.toJSDate()),
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
            eq(bookings.organizerId, input.organizer.id),
            eq(bookings.status, 'confirmed'),
            lt(bookings.startsAt, rangeEnd.toJSDate()),
            gt(bookings.endsAt, rangeStart.toJSDate()),
          ),
        ),
    ]);

    const slotResolution = resolveRequestedRescheduleSlot({
      requestedStartsAtIso: input.requestedStartsAtIso,
      durationMinutes: input.eventType.durationMinutes,
      organizerTimezone: normalizeTimezone(input.organizer.timezone),
      rules,
      overrides: [
        ...overrides,
        ...userTimeOffBlocks.map((block) => ({ startAt: block.startAt, endAt: block.endAt, isAvailable: false })),
        ...externalBusyWindows.map((window) => ({
          startAt: window.startsAt,
          endAt: window.endsAt,
          isAvailable: false,
        })),
      ],
      bookings: existingBookings,
      excludeBookingId: input.booking.id,
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
        roundRobinCursor: teamEventTypes.roundRobinCursor,
      })
      .from(teamEventTypes)
      .where(eq(teamEventTypes.id, teamEventTypeId))
      .limit(1);

    const teamMode = teamEventRow ? resolveTeamMode(teamEventRow.mode) : null;
    if (!teamEventRow || !teamMode) {
      throw new BookingValidationError('Team scheduling mode is invalid.');
    }

    const requiredMemberRows = await transaction
      .select({ userId: teamEventTypeMembers.userId })
      .from(teamEventTypeMembers)
      .where(
        and(
          eq(teamEventTypeMembers.teamEventTypeId, teamEventTypeId),
          eq(teamEventTypeMembers.isRequired, true),
        ),
      )
      .orderBy(asc(teamEventTypeMembers.userId));

    const requiredMemberUserIds = requiredMemberRows.map((member) => member.userId);
    if (requiredMemberUserIds.length === 0) {
      throw new BookingValidationError('Team event has no required members.');
    }

    const memberSchedules = await listTeamMemberSchedules(
      transaction,
      requiredMemberUserIds,
      rangeStart.toJSDate(),
      rangeEnd.toJSDate(),
    );
    if (memberSchedules.length !== requiredMemberUserIds.length) {
      throw new BookingValidationError('Some required team members no longer exist.');
    }

    const filteredMemberSchedules = memberSchedules.map((schedule) => ({
      ...schedule,
      bookings: schedule.bookings.filter(
        (existingBooking) =>
          !(
            existingBooking.startsAt.getTime() === input.booking.startsAt.getTime() &&
            existingBooking.endsAt.getTime() === input.booking.endsAt.getTime()
          ),
      ),
    }));

    const slotResolution = resolveTeamRequestedSlot({
      mode: teamMode,
      memberSchedules: filteredMemberSchedules,
      requestedStartsAtIso: input.requestedStartsAtIso,
      durationMinutes: input.eventType.durationMinutes,
      rangeStartIso,
      days: 2,
      roundRobinCursor: teamEventRow.roundRobinCursor,
    });
    if (!slotResolution) {
      throw new BookingConflictError('Selected slot is no longer available.');
    }

    const nextOrganizerId = slotResolution.assignmentUserIds[0];
    if (!nextOrganizerId) {
      throw new BookingValidationError('Unable to assign team booking.');
    }

    bufferBeforeMinutes = slotResolution.bufferBeforeMinutes;
    bufferAfterMinutes = slotResolution.bufferAfterMinutes;
    teamAssignmentWrite = {
      teamEventTypeId,
      userIds: slotResolution.assignmentUserIds,
      mode: teamMode,
      nextRoundRobinCursor: slotResolution.nextRoundRobinCursor,
      organizerId: nextOrganizerId,
    };
  }

  for (const window of buildBookingCapWindowsForSlot({
    startsAtIso: input.requestedStartsAtIso,
    timezone: normalizeTimezone(input.eventType.organizerTimezone ?? input.organizer.timezone),
    caps: toEventTypeBookingCaps(input.eventType),
  })) {
    const existingCount = await countConfirmedBookingsForEventTypeWindow(transaction, {
      eventTypeId: input.booking.eventTypeId,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      excludeBookingId: input.booking.id,
    });
    if (existingCount >= window.limit) {
      throw new BookingConflictError('Booking limit reached for this event window.');
    }
  }

  return {
    metadata: JSON.stringify({
      answers: input.existingMetadata.answers,
      timezone: input.timezone,
      bufferBeforeMinutes,
      bufferAfterMinutes,
      ...(input.existingMetadata.team
        ? {
            team: {
              ...input.existingMetadata.team,
              ...(teamAssignmentWrite
                ? {
                    assignmentUserIds: teamAssignmentWrite.userIds,
                    mode: teamAssignmentWrite.mode,
                  }
                : {}),
            },
          }
        : {}),
    }),
    nextOrganizerId: teamAssignmentWrite?.organizerId ?? input.booking.organizerId,
    requestedEndsAt,
    teamAssignmentWrite,
  };
};
