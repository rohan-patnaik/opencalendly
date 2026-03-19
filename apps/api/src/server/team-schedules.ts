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
  const [
    memberUsers,
    rulesRows,
    overrideRows,
    externalBusyRows,
    timeOffRows,
    directBookingRows,
    assignedBookingRows,
  ] = await Promise.all([
    db
      .select({ id: users.id, timezone: users.timezone })
      .from(users)
      .where(inArray(users.id, uniqueMemberIds)),
    db
      .select({
        userId: availabilityRules.userId,
        dayOfWeek: availabilityRules.dayOfWeek,
        startMinute: availabilityRules.startMinute,
        endMinute: availabilityRules.endMinute,
        bufferBeforeMinutes: availabilityRules.bufferBeforeMinutes,
        bufferAfterMinutes: availabilityRules.bufferAfterMinutes,
      })
      .from(availabilityRules)
      .where(inArray(availabilityRules.userId, uniqueMemberIds)),
    db
      .select({
        userId: availabilityOverrides.userId,
        startAt: availabilityOverrides.startAt,
        endAt: availabilityOverrides.endAt,
        isAvailable: availabilityOverrides.isAvailable,
      })
      .from(availabilityOverrides)
      .where(
        and(
          inArray(availabilityOverrides.userId, uniqueMemberIds),
          lt(availabilityOverrides.startAt, rangeEnd),
          gt(availabilityOverrides.endAt, rangeStart),
        ),
      ),
    db
      .select({
        userId: calendarBusyWindows.userId,
        startsAt: calendarBusyWindows.startsAt,
        endsAt: calendarBusyWindows.endsAt,
      })
      .from(calendarBusyWindows)
      .where(
        and(
          inArray(calendarBusyWindows.userId, uniqueMemberIds),
          lt(calendarBusyWindows.startsAt, rangeEnd),
          gt(calendarBusyWindows.endsAt, rangeStart),
        ),
      ),
    db
      .select({
        userId: timeOffBlocks.userId,
        startAt: timeOffBlocks.startAt,
        endAt: timeOffBlocks.endAt,
      })
      .from(timeOffBlocks)
      .where(
        and(
          inArray(timeOffBlocks.userId, uniqueMemberIds),
          lt(timeOffBlocks.startAt, rangeEnd),
          gt(timeOffBlocks.endAt, rangeStart),
        ),
      ),
    db
      .select({
        userId: bookings.organizerId,
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
        status: bookings.status,
        metadata: bookings.metadata,
      })
      .from(bookings)
      .where(
        and(
          inArray(bookings.organizerId, uniqueMemberIds),
          eq(bookings.status, 'confirmed'),
          lt(bookings.startsAt, rangeEnd),
          gt(bookings.endsAt, rangeStart),
        ),
      ),
    db
      .select({
        userId: teamBookingAssignments.userId,
        startsAt: teamBookingAssignments.startsAt,
        endsAt: teamBookingAssignments.endsAt,
        status: bookings.status,
        metadata: bookings.metadata,
      })
      .from(teamBookingAssignments)
      .innerJoin(bookings, eq(bookings.id, teamBookingAssignments.bookingId))
      .where(
        and(
          inArray(teamBookingAssignments.userId, uniqueMemberIds),
          eq(bookings.status, 'confirmed'),
          lt(teamBookingAssignments.startsAt, rangeEnd),
          gt(teamBookingAssignments.endsAt, rangeStart),
        ),
      ),
  ]);

  const timezoneByUserId = new Map(
    memberUsers.map((memberUser) => [memberUser.id, normalizeTimezone(memberUser.timezone)]),
  );

  const rulesByUserId = new Map<
    string,
    TeamMemberScheduleRecord['rules']
  >();
  for (const row of rulesRows) {
    const existing = rulesByUserId.get(row.userId) ?? [];
    existing.push({
      dayOfWeek: row.dayOfWeek,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      bufferBeforeMinutes: row.bufferBeforeMinutes,
      bufferAfterMinutes: row.bufferAfterMinutes,
    });
    rulesByUserId.set(row.userId, existing);
  }

  const overridesByUserId = new Map<
    string,
    TeamMemberScheduleRecord['overrides']
  >();
  const appendOverride = (
    userId: string,
    value: TeamMemberScheduleRecord['overrides'][number],
  ) => {
    const existing = overridesByUserId.get(userId) ?? [];
    existing.push(value);
    overridesByUserId.set(userId, existing);
  };
  for (const row of overrideRows) {
    appendOverride(row.userId, {
      startAt: row.startAt,
      endAt: row.endAt,
      isAvailable: row.isAvailable,
    });
  }
  for (const row of timeOffRows) {
    appendOverride(row.userId, {
      startAt: row.startAt,
      endAt: row.endAt,
      isAvailable: false,
    });
  }
  for (const row of externalBusyRows) {
    appendOverride(row.userId, {
      startAt: row.startsAt,
      endAt: row.endsAt,
      isAvailable: false,
    });
  }

  const bookingsByUserId = new Map<
    string,
    Map<string, TeamMemberScheduleRecord['bookings'][number]>
  >();
  const appendBooking = (
    userId: string,
    booking: TeamMemberScheduleRecord['bookings'][number],
  ) => {
    const existing = bookingsByUserId.get(userId) ?? new Map();
    const key = `${booking.startsAt.toISOString()}|${booking.endsAt.toISOString()}|${booking.metadata ?? ''}`;
    existing.set(key, booking);
    bookingsByUserId.set(userId, existing);
  };
  for (const booking of directBookingRows) {
    appendBooking(booking.userId, booking);
  }
  for (const booking of assignedBookingRows) {
    appendBooking(booking.userId, booking);
  }

  const schedules: TeamMemberScheduleRecord[] = [];
  for (const userId of uniqueMemberIds) {
    const timezone = timezoneByUserId.get(userId);
    if (!timezone) {
      continue;
    }

    schedules.push({
      userId,
      timezone,
      rules: rulesByUserId.get(userId) ?? [],
      overrides: overridesByUserId.get(userId) ?? [],
      bookings: Array.from(bookingsByUserId.get(userId)?.values() ?? []),
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
