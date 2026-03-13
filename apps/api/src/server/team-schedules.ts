import { and, eq, gt, inArray, lt } from 'drizzle-orm';
import { DateTime } from 'luxon';

import {
  availabilityOverrides,
  availabilityRules,
  bookings,
  calendarBusyWindows,
  teamBookingAssignments,
  timeOffBlocks,
  users,
} from '@opencalendly/db';

import { chooseRoundRobinAssignee, computeTeamSlotMatrix } from '../lib/team-scheduling';
import type { QueryableDb, TeamMemberScheduleRecord } from './types';
import { normalizeTimezone } from './core';
import type { TeamSchedulingMode } from '@opencalendly/shared';

export const listExternalBusyWindowsForUser = async (
  db: QueryableDb,
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<Array<{ startsAt: Date; endsAt: Date }>> => {
  return db
    .select({ startsAt: calendarBusyWindows.startsAt, endsAt: calendarBusyWindows.endsAt })
    .from(calendarBusyWindows)
    .where(
      and(
        eq(calendarBusyWindows.userId, userId),
        lt(calendarBusyWindows.startsAt, rangeEnd),
        gt(calendarBusyWindows.endsAt, rangeStart),
      ),
    );
};

export const listTimeOffBlocksForUser = async (
  db: QueryableDb,
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<Array<{ startAt: Date; endAt: Date }>> => {
  return db
    .select({ startAt: timeOffBlocks.startAt, endAt: timeOffBlocks.endAt })
    .from(timeOffBlocks)
    .where(
      and(
        eq(timeOffBlocks.userId, userId),
        lt(timeOffBlocks.startAt, rangeEnd),
        gt(timeOffBlocks.endAt, rangeStart),
      ),
    );
};

export const listTeamMemberSchedules = async (
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
    .select({ id: users.id, timezone: users.timezone })
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

    const [rules, overrides, externalBusyWindows, userTimeOffBlocks, directBookings, assignedBookings] =
      await Promise.all([
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
        listTimeOffBlocksForUser(db, userId, rangeStart, rangeEnd),
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
        ...userTimeOffBlocks.map((block) => ({
          startAt: block.startAt,
          endAt: block.endAt,
          isAvailable: false,
        })),
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

export const resolveTeamRequestedSlot = (input: {
  mode: TeamSchedulingMode;
  memberSchedules: TeamMemberScheduleRecord[];
  requestedStartsAtIso: string;
  durationMinutes: number;
  rangeStartIso: string;
  days: number;
  roundRobinCursor: number;
}) => {
  const startsAt = DateTime.fromISO(input.requestedStartsAtIso, { zone: 'utc' });
  if (!startsAt.isValid) {
    return null;
  }

  const requestedEndsAtIso = startsAt.plus({ minutes: input.durationMinutes }).toUTC().toISO();
  if (!requestedEndsAtIso) {
    return null;
  }

  const requestedSlot = computeTeamSlotMatrix({
    members: input.memberSchedules,
    rangeStartIso: input.rangeStartIso,
    days: input.days,
    durationMinutes: input.durationMinutes,
  }).get(`${input.requestedStartsAtIso}|${requestedEndsAtIso}`);
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
      bufferBeforeMinutes = Math.max(bufferBeforeMinutes, memberSlot.bufferBeforeMinutes);
      bufferAfterMinutes = Math.max(bufferAfterMinutes, memberSlot.bufferAfterMinutes);
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
  const selectedSlot = selection ? requestedSlot.byUserId.get(selection.assigneeUserId) : null;
  if (!selection || !selectedSlot) {
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
