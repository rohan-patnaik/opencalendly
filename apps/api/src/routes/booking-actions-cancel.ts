import { and, eq, isNull } from 'drizzle-orm';

import {
  bookingActionTokens,
  bookings,
  eventTypes,
  teamBookingAssignments,
  users,
} from '@opencalendly/db';
import { bookingActionTokenSchema, bookingCancelSchema } from '@opencalendly/shared';

import {
  BookingActionGoneError,
  BookingActionNotFoundError,
  LaunchDemoAuthError,
} from '../server/types';
import { DemoQuotaAdmissionError, DemoQuotaCreditsError } from '../server/types';
import { hashActionToken, lockActionToken, lockBooking } from '../server/booking-action-links';
import { emitAuditEvent } from '../server/audit';
import { runBookingCancellationSideEffects } from '../server/booking-side-effects';
import { resolveAuthenticatedUser } from '../server/auth-session';
import { cancelPendingScheduledNotificationsForBooking } from '../server/notifications';
import { jsonDemoQuotaError, consumeDemoFeatureCredits, isLaunchDemoBookingContext } from '../server/demo-quota';
import { jsonError, normalizeTimezone } from '../server/core';
import { withDatabase } from '../server/database';
import type { ApiApp, DemoQuotaDb } from '../server/types';
import { evaluateBookingActionToken, parseBookingMetadata } from '../lib/booking-actions';

export const registerBookingActionCancelRoutes = (app: ApiApp): void => {
  app.post('/v0/bookings/actions/:token/cancel', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      const tokenParam = bookingActionTokenSchema.safeParse(context.req.param('token'));
      if (!tokenParam.success) {
        emitAuditEvent({
          event: 'booking_action_misuse_detected',
          level: 'warn',
          route: '/v0/bookings/actions/:token/cancel',
          statusCode: 404,
          actionType: 'cancel',
          reason: 'invalid_token',
        });
        return jsonError(context, 404, 'Action link is invalid or expired.');
      }

      const parsed = bookingCancelSchema.safeParse(await context.req.json().catch(() => ({})));
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      const now = new Date();
      try {
        const result = await db.transaction(async (transaction) => {
          const token = await lockActionToken(transaction, hashActionToken(tokenParam.data));
          if (!token || token.actionType !== 'cancel') {
            throw new BookingActionNotFoundError('Action link is invalid or expired.');
          }

          const booking = await lockBooking(transaction, token.bookingId);
          if (!booking) {
            throw new BookingActionNotFoundError('Booking not found.');
          }

          const [eventType] = await transaction
            .select({
              id: eventTypes.id,
              userId: eventTypes.userId,
              slug: eventTypes.slug,
              name: eventTypes.name,
              durationMinutes: eventTypes.durationMinutes,
              locationType: eventTypes.locationType,
              locationValue: eventTypes.locationValue,
              isActive: eventTypes.isActive,
            })
            .from(eventTypes)
            .where(eq(eventTypes.id, booking.eventTypeId))
            .limit(1);
          const [organizer] = await transaction
            .select({
              id: users.id,
              email: users.email,
              username: users.username,
              displayName: users.displayName,
              timezone: users.timezone,
            })
            .from(users)
            .where(eq(users.id, booking.organizerId))
            .limit(1);
          if (!eventType || !organizer) {
            throw new BookingActionNotFoundError('Booking context not found.');
          }

          const bookingMetadata = parseBookingMetadata(booking.metadata, normalizeTimezone);
          const launchDemoContext = isLaunchDemoBookingContext({
            organizerUsername: organizer.username,
            teamSlug: bookingMetadata.team?.teamSlug ?? null,
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
          if (tokenState === 'gone') {
            throw new BookingActionGoneError('Action link is invalid or expired.');
          }
          if (tokenState === 'idempotent-replay') {
            await transaction
              .update(bookingActionTokens)
              .set({ consumedAt: now })
              .where(and(eq(bookingActionTokens.bookingId, booking.id), isNull(bookingActionTokens.consumedAt)));
            await transaction.delete(teamBookingAssignments).where(eq(teamBookingAssignments.bookingId, booking.id));
            return { booking, eventType, organizer, alreadyProcessed: true, canceledNotifications: 0 };
          }
          if (tokenState !== 'usable' || booking.status !== 'confirmed') {
            throw new BookingActionGoneError('Booking is not cancelable.');
          }

          const [canceledBooking] = await transaction
            .update(bookings)
            .set({
              status: 'canceled',
              canceledAt: now,
              canceledBy: 'invitee',
              cancellationReason: parsed.data.reason ?? null,
            })
            .where(eq(bookings.id, booking.id))
            .returning({
              id: bookings.id,
              eventTypeId: bookings.eventTypeId,
              organizerId: bookings.organizerId,
              inviteeName: bookings.inviteeName,
              inviteeEmail: bookings.inviteeEmail,
              startsAt: bookings.startsAt,
              endsAt: bookings.endsAt,
              status: bookings.status,
              metadata: bookings.metadata,
            });
          if (!canceledBooking) {
            throw new Error('Failed to cancel booking.');
          }

          await transaction
            .update(bookingActionTokens)
            .set({ consumedAt: now })
            .where(and(eq(bookingActionTokens.bookingId, booking.id), isNull(bookingActionTokens.consumedAt)));
          await transaction.delete(teamBookingAssignments).where(eq(teamBookingAssignments.bookingId, booking.id));

          const canceledNotifications = await cancelPendingScheduledNotificationsForBooking(transaction, {
            bookingId: booking.id,
          });
          if (launchDemoContext && authedUser) {
            await consumeDemoFeatureCredits(transaction as DemoQuotaDb, context.env, authedUser, {
              featureKey: 'booking_cancel',
              sourceKey: `booking-cancel:${booking.id}`,
              metadata: { bookingId: booking.id },
              now,
            });
          }

          return {
            booking: canceledBooking,
            eventType,
            organizer,
            alreadyProcessed: false,
            canceledNotifications,
          };
        });

        const timezone =
          parseBookingMetadata(result.booking.metadata, normalizeTimezone).timezone ??
          normalizeTimezone(result.organizer.timezone);
        const sideEffects = await runBookingCancellationSideEffects(context.env, db, {
          booking: result.booking,
          eventType: { name: result.eventType.name },
          organizer: { email: result.organizer.email, displayName: result.organizer.displayName },
          timezone,
          cancellationReason: parsed.data.reason ?? null,
          alreadyProcessed: result.alreadyProcessed,
        });

        return context.json({
          ok: true,
          booking: { id: result.booking.id, status: result.booking.status },
          email: sideEffects.email,
          notifications: { canceled: result.canceledNotifications },
          webhooks: { queued: sideEffects.queuedWebhookDeliveries },
          calendarWriteback: sideEffects.calendarWriteback,
        });
      } catch (error) {
        if (error instanceof LaunchDemoAuthError) {
          return jsonError(context, 401, error.message);
        }
        if (error instanceof BookingActionNotFoundError) {
          emitAuditEvent({
            event: 'booking_action_misuse_detected',
            level: 'warn',
            route: '/v0/bookings/actions/:token/cancel',
            statusCode: 404,
            actionType: 'cancel',
            reason: 'not_found',
          });
          return jsonError(context, 404, 'Action link is invalid or expired.');
        }
        if (error instanceof BookingActionGoneError) {
          emitAuditEvent({
            event: 'booking_action_misuse_detected',
            level: 'warn',
            route: '/v0/bookings/actions/:token/cancel',
            statusCode: 410,
            actionType: 'cancel',
            reason: 'gone',
          });
          return jsonError(context, 410, 'Action link is invalid or expired.');
        }
        if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
          return jsonDemoQuotaError(context, db, context.env, authedUser, error);
        }
        throw error;
      }
    });
  });
};
