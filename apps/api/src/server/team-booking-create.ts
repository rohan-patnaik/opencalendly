import { and, asc, eq, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';

import {
  bookingActionTokens,
  bookings,
  teamBookingAssignments,
  teamEventTypeMembers,
  teamEventTypes,
  teams,
  users,
} from '@opencalendly/db';

import {
  createBookingActionTokenSet,
  BookingConflictError,
  BookingNotFoundError,
  BookingValidationError,
} from '../lib/booking';
import { buildBookingCapWindowsForSlot } from '../lib/booking-caps';
import { consumeDemoFeatureCredits } from './demo-quota';
import { isUniqueViolation } from './database';
import { enqueueScheduledNotificationsForBooking } from './notifications';
import {
  countConfirmedBookingsForEventTypeWindow,
  resolveTeamMode,
  toEventTypeBookingCaps,
} from './team-context';
import { listTeamMemberSchedules, resolveTeamRequestedSlot } from './team-schedules';
import type { AuthenticatedUser, Bindings, Database, DemoQuotaDb, TeamSchedulingMode } from './types';

type TeamBookingCreateInput = {
  teamSlug: string;
  eventSlug: string;
  startsAt: string;
  timezone: string;
  inviteeName: string;
  inviteeEmail: string;
  answers?: Record<string, string>;
};

export const createTeamBooking = async (
  db: Database,
  env: Bindings,
  authedUser: AuthenticatedUser | null,
  input: TeamBookingCreateInput,
): Promise<{
  booking: {
    id: string;
    eventTypeId: string;
    organizerId: string;
    inviteeName: string;
    inviteeEmail: string;
    startsAt: Date;
    endsAt: Date;
  };
  eventType: { id: string; name: string; locationType: string; locationValue: string | null };
  team: { id: string; name: string; mode: TeamSchedulingMode; teamEventTypeId: string };
  organizer: { id: string; email: string; displayName: string };
  actionTokens: ReturnType<typeof createBookingActionTokenSet>['publicTokens'];
  assignmentUserIds: string[];
  queuedNotifications: number;
  performance: {
    teamContextLoadMs: number;
    memberScheduleLoadMs: number;
    slotResolutionMs: number;
    capCheckMs: number;
    insertMs: number;
    assignmentInsertMs: number;
    notificationMs: number;
  };
}> => {
  const startsAt = DateTime.fromISO(input.startsAt, { zone: 'utc' });
  if (!startsAt.isValid) {
    throw new BookingValidationError('Invalid startsAt value.');
  }

  const requestedStartsAtIso = startsAt.toUTC().toISO();
  if (!requestedStartsAtIso) {
    throw new BookingValidationError('Unable to normalize startsAt.');
  }

  return db.transaction(async (transaction) => {
    const performance = {
      teamContextLoadMs: 0,
      memberScheduleLoadMs: 0,
      slotResolutionMs: 0,
      capCheckMs: 0,
      insertMs: 0,
      assignmentInsertMs: 0,
      notificationMs: 0,
    };
    let stepStartedAt = Date.now();
    const [team] = await transaction
      .select({
        id: teams.id,
        name: teams.name,
      })
      .from(teams)
      .where(eq(teams.slug, input.teamSlug))
      .limit(1);
    if (!team) {
      throw new BookingNotFoundError('Team event type not found.');
    }

    const lockedTeamEventResult = await transaction.execute<{
      teamEventTypeId: string;
      mode: string;
      roundRobinCursor: number;
      eventTypeId: string;
      eventTypeName: string;
      durationMinutes: number;
      dailyBookingLimit: number | null;
      weeklyBookingLimit: number | null;
      monthlyBookingLimit: number | null;
      locationType: string;
      locationValue: string | null;
      organizerTimezone: string;
      isActive: boolean;
    }>(sql`
      select
        tet.id as "teamEventTypeId",
        tet.mode,
        tet.round_robin_cursor as "roundRobinCursor",
        et.id as "eventTypeId",
        et.name as "eventTypeName",
        et.duration_minutes as "durationMinutes",
        et.daily_booking_limit as "dailyBookingLimit",
        et.weekly_booking_limit as "weeklyBookingLimit",
        et.monthly_booking_limit as "monthlyBookingLimit",
        et.location_type as "locationType",
        et.location_value as "locationValue",
        u.timezone as "organizerTimezone",
        et.is_active as "isActive"
      from team_event_types tet
      inner join event_types et on et.id = tet.event_type_id
      inner join users u on u.id = et.user_id
      where tet.team_id = ${team.id} and et.slug = ${input.eventSlug}
      for update of tet, et
    `);

    const teamEventRow = lockedTeamEventResult.rows[0];
    const mode = teamEventRow ? resolveTeamMode(teamEventRow.mode) : null;
    if (!teamEventRow || !teamEventRow.isActive || !mode) {
      throw new BookingNotFoundError('Team event type not found.');
    }

    const memberRows = await transaction
      .select({ userId: teamEventTypeMembers.userId })
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
    performance.teamContextLoadMs = Date.now() - stepStartedAt;

    const rangeStart = startsAt.minus({ days: 1 });
    const requestedEndsAt = startsAt.plus({ minutes: teamEventRow.durationMinutes });
    const rangeEnd = requestedEndsAt.plus({ days: 1 });
    const rangeStartIso = rangeStart.toUTC().toISO();
    if (!rangeStartIso) {
      throw new BookingValidationError('Unable to build slot validation range.');
    }

    stepStartedAt = Date.now();
    const memberSchedules = await listTeamMemberSchedules(
      transaction,
      memberUserIds,
      rangeStart.toJSDate(),
      rangeEnd.toJSDate(),
    );
    if (memberSchedules.length !== memberUserIds.length) {
      throw new BookingValidationError('Some required team members no longer exist.');
    }
    performance.memberScheduleLoadMs = Date.now() - stepStartedAt;

    stepStartedAt = Date.now();
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
    performance.slotResolutionMs = Date.now() - stepStartedAt;

    stepStartedAt = Date.now();
    const capWindows = buildBookingCapWindowsForSlot({
      startsAtIso: requestedStartsAtIso,
      timezone: input.timezone,
      caps: toEventTypeBookingCaps(teamEventRow),
    });
    for (const window of capWindows) {
      const existingCount = await countConfirmedBookingsForEventTypeWindow(transaction, {
        eventTypeId: teamEventRow.eventTypeId,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
      });
      if (existingCount >= window.limit) {
        throw new BookingConflictError('Booking limit reached for this event window.');
      }
    }
    performance.capCheckMs = Date.now() - stepStartedAt;

    const organizerId = slotResolution.assignmentUserIds[0];
    if (!organizerId) {
      throw new BookingValidationError('Unable to assign team booking.');
    }

    const metadata = JSON.stringify({
      answers: input.answers ?? {},
      timezone: input.timezone,
      bufferBeforeMinutes: slotResolution.bufferBeforeMinutes,
      bufferAfterMinutes: slotResolution.bufferAfterMinutes,
      team: {
        teamId: team.id,
        teamSlug: input.teamSlug,
        teamEventTypeId: teamEventRow.teamEventTypeId,
        mode,
        assignmentUserIds: slotResolution.assignmentUserIds,
      },
    });

    const tokenSet = createBookingActionTokenSet();
    let insertedBooking:
      | {
          id: string;
          eventTypeId: string;
          organizerId: string;
          inviteeName: string;
          inviteeEmail: string;
          startsAt: Date;
          endsAt: Date;
        }
      | null = null;

    try {
      stepStartedAt = Date.now();
      const [bookingInsert] = await transaction
        .insert(bookings)
        .values({
          eventTypeId: teamEventRow.eventTypeId,
          organizerId,
          inviteeName: input.inviteeName,
          inviteeEmail: input.inviteeEmail,
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
      performance.insertMs = Date.now() - stepStartedAt;
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

    const assignmentWriteOrder = [...slotResolution.assignmentUserIds].sort((left, right) =>
      left.localeCompare(right),
    );

    try {
      stepStartedAt = Date.now();
      await transaction.insert(teamBookingAssignments).values(
        assignmentWriteOrder.map((memberUserId) => ({
          bookingId: insertedBooking.id,
          teamEventTypeId: teamEventRow.teamEventTypeId,
          userId: memberUserId,
          startsAt: insertedBooking.startsAt,
          endsAt: insertedBooking.endsAt,
        })),
      );
      performance.assignmentInsertMs = Date.now() - stepStartedAt;
    } catch (error) {
      if (isUniqueViolation(error, 'team_booking_assignments_user_slot_unique')) {
        throw new BookingConflictError('Selected slot is no longer available.');
      }
      throw error;
    }

    if (mode === 'round_robin') {
      await transaction
        .update(teamEventTypes)
        .set({ roundRobinCursor: slotResolution.nextRoundRobinCursor })
        .where(eq(teamEventTypes.id, teamEventRow.teamEventTypeId));
    }

    const [organizer] = await transaction
      .select({ id: users.id, email: users.email, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, organizerId))
      .limit(1);
    if (!organizer) {
      throw new Error('Assigned organizer not found.');
    }

    stepStartedAt = Date.now();
    const queuedNotifications = await enqueueScheduledNotificationsForBooking(transaction, {
      bookingId: insertedBooking.id,
      organizerId: insertedBooking.organizerId,
      eventTypeId: insertedBooking.eventTypeId,
      inviteeEmail: insertedBooking.inviteeEmail,
      inviteeName: insertedBooking.inviteeName,
      startsAt: insertedBooking.startsAt,
      endsAt: insertedBooking.endsAt,
    });
    performance.notificationMs = Date.now() - stepStartedAt;

    if (authedUser) {
      await consumeDemoFeatureCredits(transaction as DemoQuotaDb, env, authedUser, {
        featureKey: 'team_booking',
        sourceKey: `team-booking:${insertedBooking.id}`,
        metadata: {
          teamSlug: input.teamSlug,
          eventSlug: input.eventSlug,
          bookingId: insertedBooking.id,
        },
        now: new Date(),
      });
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
        id: team.id,
        name: team.name,
        mode,
        teamEventTypeId: teamEventRow.teamEventTypeId,
      },
      organizer,
      actionTokens: tokenSet.publicTokens,
      assignmentUserIds: slotResolution.assignmentUserIds,
      queuedNotifications,
      performance,
    };
  });
};
