import { desc, eq } from 'drizzle-orm';

import {
  bookingActionTokens,
  bookings,
  eventTypes,
  users,
} from '@opencalendly/db';
import { bookingActionTokenSchema } from '@opencalendly/shared';

import { hashActionToken } from '../server/booking-action-links';
import { resolveAuthenticatedUser } from '../server/auth-session';
import { emitAuditEvent } from '../server/audit';
import { isLaunchDemoBookingContext } from '../server/demo-quota';
import { jsonError, normalizeTimezone } from '../server/core';
import { withDatabase } from '../server/database';
import type { ApiApp, BookingActionType } from '../server/types';
import { evaluateBookingActionToken, parseBookingMetadata } from '../lib/booking-actions';

export const registerBookingActionViewRoutes = (app: ApiApp): void => {
  app.get('/v0/bookings/actions/:token', async (context) => {
    return withDatabase(context, async (db) => {
      const tokenParam = bookingActionTokenSchema.safeParse(context.req.param('token'));
      if (!tokenParam.success) {
        emitAuditEvent({
          event: 'booking_action_misuse_detected',
          level: 'warn',
          route: '/v0/bookings/actions/:token',
          statusCode: 404,
          actionType: 'unknown',
          reason: 'invalid_token',
        });
        return jsonError(context, 404, 'Action link is invalid or expired.');
      }

      const [row] = await db
        .select({
          actionType: bookingActionTokens.actionType,
          expiresAt: bookingActionTokens.expiresAt,
          consumedAt: bookingActionTokens.consumedAt,
          consumedBookingId: bookingActionTokens.consumedBookingId,
          bookingId: bookings.id,
          bookingStatus: bookings.status,
          bookingStartsAt: bookings.startsAt,
          bookingEndsAt: bookings.endsAt,
          bookingMetadata: bookings.metadata,
          inviteeName: bookings.inviteeName,
          inviteeEmail: bookings.inviteeEmail,
          eventTypeSlug: eventTypes.slug,
          eventTypeName: eventTypes.name,
          eventTypeDurationMinutes: eventTypes.durationMinutes,
          organizerUsername: users.username,
          organizerDisplayName: users.displayName,
          organizerTimezone: users.timezone,
        })
        .from(bookingActionTokens)
        .innerJoin(bookings, eq(bookings.id, bookingActionTokens.bookingId))
        .innerJoin(eventTypes, eq(eventTypes.id, bookings.eventTypeId))
        .innerJoin(users, eq(users.id, bookings.organizerId))
        .where(eq(bookingActionTokens.tokenHash, hashActionToken(tokenParam.data)))
        .limit(1);

      if (!row) {
        emitAuditEvent({
          event: 'booking_action_misuse_detected',
          level: 'warn',
          route: '/v0/bookings/actions/:token',
          statusCode: 404,
          actionType: 'unknown',
          reason: 'not_found',
        });
        return jsonError(context, 404, 'Action link is invalid or expired.');
      }

      const actionType = row.actionType as BookingActionType;
      const tokenState = evaluateBookingActionToken({
        actionType,
        bookingStatus: row.bookingStatus,
        expiresAt: row.expiresAt,
        consumedAt: row.consumedAt,
        now: new Date(),
      });
      if (tokenState === 'gone') {
        emitAuditEvent({
          event: 'booking_action_misuse_detected',
          level: 'warn',
          route: '/v0/bookings/actions/:token',
          statusCode: 410,
          actionType,
          reason: 'gone',
          bookingId: row.bookingId,
        });
        return jsonError(context, 410, 'Action link is invalid or expired.');
      }

      const metadata = parseBookingMetadata(row.bookingMetadata, normalizeTimezone);
      const timezone = metadata.timezone ?? normalizeTimezone(row.organizerTimezone);
      const teamMetadata = metadata.team
        ? {
            teamId: metadata.team.teamId,
            teamSlug: metadata.team.teamSlug ?? null,
            teamEventTypeId: metadata.team.teamEventTypeId,
            mode: metadata.team.mode,
            assignmentUserIds: metadata.team.assignmentUserIds,
          }
        : null;

      if (
        isLaunchDemoBookingContext({
          organizerUsername: row.organizerUsername,
          teamSlug: teamMetadata?.teamSlug ?? null,
        })
      ) {
        const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
        if (!authedUser) {
          return jsonError(context, 401, 'Sign in to access the launch demo.');
        }
      }

      let rescheduledTo: { id: string; startsAt: string; endsAt: string } | null = null;
      if (row.bookingStatus === 'rescheduled') {
        const [child] = row.consumedBookingId
          ? await db
              .select({ id: bookings.id, startsAt: bookings.startsAt, endsAt: bookings.endsAt })
              .from(bookings)
              .where(eq(bookings.id, row.consumedBookingId))
              .limit(1)
          : await db
              .select({ id: bookings.id, startsAt: bookings.startsAt, endsAt: bookings.endsAt })
              .from(bookings)
              .where(eq(bookings.rescheduledFromBookingId, row.bookingId))
              .orderBy(desc(bookings.createdAt))
              .limit(1);

        if (child) {
          rescheduledTo = {
            id: child.id,
            startsAt: child.startsAt.toISOString(),
            endsAt: child.endsAt.toISOString(),
          };
        }
      }

      return context.json({
        ok: true,
        actionType,
        booking: {
          id: row.bookingId,
          status: row.bookingStatus,
          startsAt: row.bookingStartsAt.toISOString(),
          endsAt: row.bookingEndsAt.toISOString(),
          timezone,
          inviteeName: row.inviteeName,
          inviteeEmail: row.inviteeEmail,
          rescheduledTo,
          team: teamMetadata,
        },
        eventType: {
          slug: row.eventTypeSlug,
          name: row.eventTypeName,
          durationMinutes: row.eventTypeDurationMinutes,
        },
        organizer: {
          username: row.organizerUsername,
          displayName: row.organizerDisplayName,
          timezone: normalizeTimezone(row.organizerTimezone),
        },
        actions: {
          canCancel: actionType === 'cancel' && tokenState === 'usable',
          canReschedule: actionType === 'reschedule' && tokenState === 'usable',
        },
      });
    });
  });
};
