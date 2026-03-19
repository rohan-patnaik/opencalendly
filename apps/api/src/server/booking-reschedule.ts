import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';

import {
  bookingActionTokens,
  bookings,
  teamBookingAssignments,
  teamEventTypes,
  users,
} from '@opencalendly/db';

import {
  BookingConflictError,
  BookingValidationError,
  createBookingActionTokenSet,
} from '../lib/booking';
import { evaluateBookingActionToken, parseBookingMetadata } from '../lib/booking-actions';
import { hashActionToken, lockActionToken, lockBooking } from './booking-action-links';
import { buildReschedulePlan } from './booking-reschedule-plan';
import { consumeDemoFeatureCredits, isLaunchDemoBookingContext } from './demo-quota';
import { isUniqueViolation } from './database';
import { cancelPendingScheduledNotificationsForBooking, enqueueScheduledNotificationsForBooking } from './notifications';
import { normalizeTimezone } from './core';
import type {
  AuthenticatedUser,
  Bindings,
  Database,
  DatabaseTransaction,
  DemoQuotaDb,
  EventTypeProfile,
  LockedBooking,
  OrganizerProfile,
} from './types';
import {
  BookingActionGoneError,
  BookingActionNotFoundError,
  LaunchDemoAuthError,
} from './types';

type RescheduleInput = {
  token: string;
  startsAt: string;
  timezone: string;
};

type RescheduleResult = {
  oldBooking: LockedBooking;
  newBooking: {
    id: string;
    eventTypeId: string;
    organizerId: string;
    inviteeName: string;
    inviteeEmail: string;
    startsAt: Date;
    endsAt: Date;
    status?: string;
    metadata?: string | null;
  };
  eventType: EventTypeProfile;
  organizer: OrganizerProfile;
  actionTokens: ReturnType<typeof createBookingActionTokenSet>['publicTokens'] | null;
  alreadyProcessed: boolean;
  canceledNotificationsForOldBooking: number;
  queuedNotificationsForNewBooking: number;
};

const selectReplayBooking = async (
  transaction: DatabaseTransaction,
  input: { consumedBookingId: string | null; bookingId: string },
) => {
  const [replayBooking] = input.consumedBookingId
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
        .where(eq(bookings.id, input.consumedBookingId))
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
        .where(eq(bookings.rescheduledFromBookingId, input.bookingId))
        .orderBy(desc(bookings.createdAt))
        .limit(1);

  return replayBooking ?? null;
};

export const rescheduleBooking = async (
  db: Database,
  env: Bindings,
  authedUser: AuthenticatedUser | null,
  input: RescheduleInput,
): Promise<RescheduleResult> => {
  const startsAt = DateTime.fromISO(input.startsAt, { zone: 'utc' });
  if (!startsAt.isValid) {
    throw new BookingValidationError('Invalid startsAt value.');
  }

  const requestedStartsAtIso = startsAt.toUTC().toISO();
  if (!requestedStartsAtIso) {
    throw new BookingValidationError('Unable to normalize startsAt.');
  }

  return db.transaction(async (transaction) => {
    const now = new Date();
    const token = await lockActionToken(transaction, hashActionToken(input.token));
    if (!token || token.actionType !== 'reschedule') {
      throw new BookingActionNotFoundError('Action link is invalid or expired.');
    }

    const booking = await lockBooking(transaction, token.bookingId);
    if (!booking) {
      throw new BookingActionNotFoundError('Booking not found.');
    }

    const eventTypeResult = await transaction.execute<EventTypeProfile>(sql`
      select
        et.id,
        et.user_id as "userId",
        et.slug,
        et.name,
        et.duration_minutes as "durationMinutes",
        et.daily_booking_limit as "dailyBookingLimit",
        et.weekly_booking_limit as "weeklyBookingLimit",
        et.monthly_booking_limit as "monthlyBookingLimit",
        et.location_type as "locationType",
        et.location_value as "locationValue",
        et.is_active as "isActive",
        owner.timezone as "organizerTimezone"
      from event_types et
      inner join users owner on owner.id = et.user_id
      where et.id = ${booking.eventTypeId}
      for update
    `);
    const organizerResult = await transaction.execute<OrganizerProfile>(sql`
      select
        id,
        email,
        username,
        display_name as "displayName",
        timezone,
        onboarding_completed as "onboardingCompleted"
      from users
      where id = ${booking.organizerId}
      for update
    `);

    const eventType = eventTypeResult.rows[0];
    const organizer = organizerResult.rows[0];
    if (!eventType || !organizer || !eventType.isActive) {
      throw new BookingActionNotFoundError('Booking context not found.');
    }

    const existingMetadata = parseBookingMetadata(booking.metadata, normalizeTimezone);
    const launchDemoContext = isLaunchDemoBookingContext({
      organizerUsername: organizer.username,
      teamSlug: existingMetadata.team?.teamSlug ?? null,
    });
    if (launchDemoContext && !authedUser) {
      throw new LaunchDemoAuthError('Sign in to access the launch demo.');
    }

    const tokenState = evaluateBookingActionToken({
      actionType: token.actionType,
      bookingStatus: booking.status,
      expiresAt: token.expiresAt,
      consumedAt: token.consumedAt,
      now,
    });
    if (tokenState === 'idempotent-replay') {
      const replayBooking = await selectReplayBooking(transaction, {
        consumedBookingId: token.consumedBookingId,
        bookingId: booking.id,
      });
      if (!replayBooking) {
        throw new BookingActionGoneError('Action link is invalid or expired.');
      }

      return {
        oldBooking: booking,
        newBooking: replayBooking,
        eventType,
        organizer,
        actionTokens: null,
        alreadyProcessed: true,
        canceledNotificationsForOldBooking: 0,
        queuedNotificationsForNewBooking: 0,
      };
    }

    if (tokenState === 'gone' || booking.status !== 'confirmed') {
      throw new BookingActionGoneError('Booking is not reschedulable.');
    }

    const { metadata, nextOrganizerId, requestedEndsAt, teamAssignmentWrite } = await buildReschedulePlan(
      transaction,
      {
        booking,
        eventType,
        organizer,
        startsAt,
        timezone: input.timezone,
        requestedStartsAtIso,
        existingMetadata,
      },
    );

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
      const [inserted] = await transaction
        .insert(bookings)
        .values({
          eventTypeId: booking.eventTypeId,
          organizerId: nextOrganizerId,
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

    await transaction.update(bookings).set({ status: 'rescheduled' }).where(eq(bookings.id, booking.id));

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
      .set({ consumedAt: now, consumedBookingId: insertedBooking.id })
      .where(and(eq(bookingActionTokens.bookingId, booking.id), isNull(bookingActionTokens.consumedAt)));

    if (teamAssignmentWrite?.mode === 'round_robin') {
      await transaction
        .update(teamEventTypes)
        .set({ roundRobinCursor: teamAssignmentWrite.nextRoundRobinCursor })
        .where(eq(teamEventTypes.id, teamAssignmentWrite.teamEventTypeId));
    }

    await transaction.delete(teamBookingAssignments).where(eq(teamBookingAssignments.bookingId, booking.id));
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

    const canceledNotificationsForOldBooking = await cancelPendingScheduledNotificationsForBooking(transaction, {
      bookingId: booking.id,
    });
    const queuedNotificationsForNewBooking = await enqueueScheduledNotificationsForBooking(transaction, {
      bookingId: insertedBooking.id,
      organizerId: insertedBooking.organizerId,
      eventTypeId: insertedBooking.eventTypeId,
      inviteeEmail: insertedBooking.inviteeEmail,
      inviteeName: insertedBooking.inviteeName,
      startsAt: insertedBooking.startsAt,
      endsAt: insertedBooking.endsAt,
    });

    const [effectiveOrganizer] = await transaction
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
        timezone: users.timezone,
        onboardingCompleted: users.onboardingCompleted,
      })
      .from(users)
      .where(eq(users.id, insertedBooking.organizerId))
      .limit(1);
    if (!effectiveOrganizer) {
      throw new Error('Assigned organizer not found.');
    }

    if (launchDemoContext && authedUser) {
      await consumeDemoFeatureCredits(transaction as DemoQuotaDb, env, authedUser, {
        featureKey: 'booking_reschedule',
        sourceKey: `booking-reschedule:${booking.id}:${insertedBooking.id}`,
        metadata: { oldBookingId: booking.id, newBookingId: insertedBooking.id },
        now,
      });
    }

    return {
      oldBooking: { ...booking, status: 'rescheduled' },
      newBooking: insertedBooking,
      eventType,
      organizer: effectiveOrganizer,
      actionTokens: tokenSet.publicTokens,
      alreadyProcessed: false,
      canceledNotificationsForOldBooking,
      queuedNotificationsForNewBooking,
    };
  });
};
