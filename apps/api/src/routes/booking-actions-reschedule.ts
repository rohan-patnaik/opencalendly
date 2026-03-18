import { bookingActionTokenSchema, bookingRescheduleSchema } from '@opencalendly/shared';

import { BookingConflictError, BookingValidationError } from '../lib/booking';
import { resolveAuthenticatedUser } from '../server/auth-session';
import { emitAuditEvent } from '../server/audit';
import { actionTokenMap, buildActionUrls, hashActionToken } from '../server/booking-action-links';
import { runBookingRescheduleSideEffects } from '../server/booking-side-effects';
import { jsonError, normalizeTimezone } from '../server/core';
import { withDatabase } from '../server/database';
import { jsonDemoQuotaError } from '../server/demo-quota';
import { PUBLIC_BOOKING_RATE_LIMIT_MAX_BOOKING_REQUESTS_PER_SCOPE, resolveAppBaseUrl } from '../server/env';
import {
  claimIdempotencyRequest,
  completeIdempotencyRequest,
  hashIdempotencyRequestPayload,
  releaseIdempotencyRequest,
} from '../server/idempotency';
import { rescheduleBooking } from '../server/booking-reschedule';
import { isPublicBookingRateLimited, parseIdempotencyKey, resolveRateLimitClientKey } from '../server/rate-limit';
import type { ApiApp } from '../server/types';
import {
  BookingActionGoneError,
  BookingActionNotFoundError,
  DemoQuotaAdmissionError,
  DemoQuotaCreditsError,
  LaunchDemoAuthError,
} from '../server/types';

export const registerBookingActionRescheduleRoutes = (app: ApiApp): void => {
  app.post('/v0/bookings/actions/:token/reschedule', async (context) => {
    const startedAt = Date.now();
    const tokenParam = bookingActionTokenSchema.safeParse(context.req.param('token'));
    if (!tokenParam.success) {
      emitAuditEvent({
        event: 'booking_action_misuse_detected',
        level: 'warn',
        route: '/v0/bookings/actions/:token/reschedule',
        statusCode: 404,
        actionType: 'reschedule',
        reason: 'invalid_token',
      });
      return jsonError(context, 404, 'Action link is invalid or expired.');
    }

    const body = await context.req.json().catch(() => null);
    const parsed = bookingRescheduleSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const idempotencyKey = parseIdempotencyKey(context.req.raw);
    if ('error' in idempotencyKey) {
      return jsonError(context, 400, idempotencyKey.error);
    }

    const timezone = normalizeTimezone(parsed.data.timezone);
    const clientKey = resolveRateLimitClientKey(context.req.raw);
    const idempotencyRequestHash = hashIdempotencyRequestPayload({
      token: tokenParam.data,
      startsAt: parsed.data.startsAt,
      timezone,
    });

    let appBaseUrl: string;
    try {
      appBaseUrl = resolveAppBaseUrl(context.env, context.req.raw);
    } catch (error) {
      return jsonError(context, 500, error instanceof Error ? error.message : 'APP_BASE_URL must be a valid URL.');
    }

    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      const idempotencyState = await claimIdempotencyRequest(db, {
        scope: 'booking_reschedule',
        rawKey: idempotencyKey.key,
        requestHash: idempotencyRequestHash,
      });
      if (idempotencyState.state === 'replay') {
        return context.json(idempotencyState.responseBody, idempotencyState.statusCode);
      }
      if (idempotencyState.state === 'mismatch') {
        return jsonError(context, 409, 'Idempotency key reuse with different request payload is not allowed.');
      }
      if (idempotencyState.state === 'in_progress') {
        return jsonError(context, 409, 'A request with this idempotency key is already in progress.');
      }
      if (
        await isPublicBookingRateLimited(db, {
          clientKey,
          scope: `reschedule|${hashActionToken(tokenParam.data)}`,
          perScopeLimit: PUBLIC_BOOKING_RATE_LIMIT_MAX_BOOKING_REQUESTS_PER_SCOPE,
        })
      ) {
        await releaseIdempotencyRequest(db, {
          scope: 'booking_reschedule',
          keyHash: idempotencyState.keyHash,
        });
        return jsonError(context, 429, 'Rate limit exceeded. Try again in a minute.');
      }

      try {
        const result = await rescheduleBooking(db, context.env, authedUser, {
          token: tokenParam.data,
          startsAt: parsed.data.startsAt,
          timezone,
        });
        const sideEffects = await runBookingRescheduleSideEffects(context.env, db, {
          oldBooking: result.oldBooking,
          newBooking: result.newBooking,
          eventType: { name: result.eventType.name },
          organizer: { email: result.organizer.email, displayName: result.organizer.displayName },
          timezone,
          alreadyProcessed: result.alreadyProcessed,
        });

        const actions = result.actionTokens
          ? (() => {
              const tokens = actionTokenMap(result.actionTokens);
              const urls = buildActionUrls(context.req.raw, appBaseUrl, {
                cancelToken: tokens.cancelToken,
                rescheduleToken: tokens.rescheduleToken,
              });

              return {
                cancel: {
                  token: tokens.cancelToken,
                  expiresAt: tokens.cancelExpiresAt,
                  pageUrl: urls.cancelPageUrl,
                  lookupUrl: urls.lookupCancelUrl,
                  url: urls.cancelUrl,
                },
                reschedule: {
                  token: tokens.rescheduleToken,
                  expiresAt: tokens.rescheduleExpiresAt,
                  pageUrl: urls.reschedulePageUrl,
                  lookupUrl: urls.lookupRescheduleUrl,
                  url: urls.rescheduleUrl,
                },
              };
            })()
          : null;

        const responseBody: Record<string, unknown> = {
          ok: true,
          oldBooking: { id: result.oldBooking.id, status: result.oldBooking.status },
          newBooking: {
            id: result.newBooking.id,
            status: 'confirmed',
            rescheduledFromBookingId: result.oldBooking.id,
            startsAt: result.newBooking.startsAt.toISOString(),
            endsAt: result.newBooking.endsAt.toISOString(),
          },
          actions,
          email: sideEffects.email,
          notifications: {
            canceledForOldBooking: result.canceledNotificationsForOldBooking,
            queuedForNewBooking: result.queuedNotificationsForNewBooking,
          },
          webhooks: { queued: sideEffects.queuedWebhookDeliveries },
          calendarWriteback: sideEffects.calendarWriteback,
        };

        await completeIdempotencyRequest(db, {
          scope: 'booking_reschedule',
          keyHash: idempotencyState.keyHash,
          statusCode: 200,
          responseBody,
        });
        emitAuditEvent({
          event: 'booking_commit_completed',
          level: 'info',
          route: '/v0/bookings/actions/:token/reschedule',
          statusCode: 200,
          durationMs: Date.now() - startedAt,
          actionType: 'reschedule',
          bookingId: result.newBooking.id,
        });
        return context.json(responseBody);
      } catch (error) {
        if (error instanceof LaunchDemoAuthError) {
          await releaseIdempotencyRequest(db, { scope: 'booking_reschedule', keyHash: idempotencyState.keyHash });
          return jsonError(context, 401, error.message);
        }
        if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
          await releaseIdempotencyRequest(db, { scope: 'booking_reschedule', keyHash: idempotencyState.keyHash });
          return jsonDemoQuotaError(context, db, context.env, authedUser, error);
        }
        if (error instanceof BookingActionNotFoundError) {
          const responseBody = { ok: false, error: 'Action link is invalid or expired.' };
          await completeIdempotencyRequest(db, {
            scope: 'booking_reschedule',
            keyHash: idempotencyState.keyHash,
            statusCode: 404,
            responseBody,
          });
          emitAuditEvent({
            event: 'booking_action_misuse_detected',
            level: 'warn',
            route: '/v0/bookings/actions/:token/reschedule',
            statusCode: 404,
            actionType: 'reschedule',
            reason: 'not_found',
          });
          return context.json(responseBody, 404);
        }
        if (error instanceof BookingActionGoneError) {
          const responseBody = { ok: false, error: 'Action link is invalid or expired.' };
          await completeIdempotencyRequest(db, {
            scope: 'booking_reschedule',
            keyHash: idempotencyState.keyHash,
            statusCode: 410,
            responseBody,
          });
          emitAuditEvent({
            event: 'booking_action_misuse_detected',
            level: 'warn',
            route: '/v0/bookings/actions/:token/reschedule',
            statusCode: 410,
            actionType: 'reschedule',
            reason: 'gone',
          });
          return context.json(responseBody, 410);
        }
        if (error instanceof BookingValidationError) {
          const responseBody = { ok: false, error: error.message };
          await completeIdempotencyRequest(db, {
            scope: 'booking_reschedule',
            keyHash: idempotencyState.keyHash,
            statusCode: 400,
            responseBody,
          });
          return context.json(responseBody, 400);
        }
        if (error instanceof BookingConflictError) {
          const responseBody = { ok: false, error: error.message };
          await completeIdempotencyRequest(db, {
            scope: 'booking_reschedule',
            keyHash: idempotencyState.keyHash,
            statusCode: 409,
            responseBody,
          });
          emitAuditEvent({
            event: 'booking_action_misuse_detected',
            level: 'warn',
            route: '/v0/bookings/actions/:token/reschedule',
            statusCode: 409,
            actionType: 'reschedule',
            reason: 'conflict',
            error: error.message,
          });
          return context.json(responseBody, 409);
        }

        console.error('Unexpected error in booking reschedule:', error);
        const responseBody = { ok: false, error: 'Internal server error.' };
        await completeIdempotencyRequest(db, {
          scope: 'booking_reschedule',
          keyHash: idempotencyState.keyHash,
          statusCode: 500,
          responseBody,
        });
        emitAuditEvent({
          event: 'booking_commit_completed',
          level: 'error',
          route: '/v0/bookings/actions/:token/reschedule',
          statusCode: 500,
          durationMs: Date.now() - startedAt,
          actionType: 'reschedule',
          error: error instanceof Error ? error.message : 'unknown',
        });
        return context.json(responseBody, 500);
      }
    });
  });
};
