import { teamBookingCreateSchema } from '@opencalendly/shared';

import { BookingConflictError, BookingNotFoundError, BookingValidationError } from '../lib/booking';
import { resolveAuthenticatedUser } from '../server/auth-session';
import { actionTokenMap, buildActionUrls } from '../server/booking-action-links';
import { runBookingCreatedSideEffects } from '../server/booking-side-effects';
import { jsonError, normalizeTimezone } from '../server/core';
import { withDatabase } from '../server/database';
import {
  jsonDemoQuotaError,
  requiresLaunchDemoAuthForTeamRoute,
} from '../server/demo-quota';
import { PUBLIC_BOOKING_RATE_LIMIT_MAX_BOOKING_REQUESTS_PER_SCOPE, resolveAppBaseUrl } from '../server/env';
import {
  claimIdempotencyRequest,
  completeIdempotencyRequest,
  hashIdempotencyRequestPayload,
  releaseIdempotencyRequest,
} from '../server/idempotency';
import { parseIdempotencyKey, resolveRateLimitClientKey, isPublicBookingRateLimited } from '../server/rate-limit';
import { createTeamBooking } from '../server/team-booking-create';
import type { ApiApp } from '../server/types';
import { DemoQuotaAdmissionError, DemoQuotaCreditsError } from '../server/types';

export const registerTeamBookingCreateRoutes = (app: ApiApp): void => {
  app.post('/v0/team-bookings', async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = teamBookingCreateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const idempotencyKey = parseIdempotencyKey(context.req.raw);
    if ('error' in idempotencyKey) {
      return jsonError(context, 400, idempotencyKey.error);
    }

    const payload = parsed.data;
    const timezone = normalizeTimezone(payload.timezone);
    const clientKey = resolveRateLimitClientKey(context.req.raw);
    const idempotencyRequestHash = hashIdempotencyRequestPayload({
      teamSlug: payload.teamSlug,
      eventSlug: payload.eventSlug,
      startsAt: payload.startsAt,
      timezone,
      inviteeName: payload.inviteeName,
      inviteeEmail: payload.inviteeEmail,
      answers: payload.answers ?? {},
    });

    let appBaseUrl: string;
    try {
      appBaseUrl = resolveAppBaseUrl(context.env, context.req.raw);
    } catch (error) {
      return jsonError(context, 500, error instanceof Error ? error.message : 'APP_BASE_URL must be a valid URL.');
    }

    return withDatabase(context, async (db) => {
      const authedUser = requiresLaunchDemoAuthForTeamRoute(payload.teamSlug)
        ? await resolveAuthenticatedUser(db, context.req.raw)
        : null;
      if (requiresLaunchDemoAuthForTeamRoute(payload.teamSlug) && !authedUser) {
        return jsonError(context, 401, 'Sign in to access the launch demo.');
      }

      const idempotencyState = await claimIdempotencyRequest(db, {
        scope: 'team_booking_create',
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
          scope: `team-booking|${payload.teamSlug}|${payload.eventSlug}`,
          perScopeLimit: PUBLIC_BOOKING_RATE_LIMIT_MAX_BOOKING_REQUESTS_PER_SCOPE,
        })
      ) {
        await releaseIdempotencyRequest(db, {
          scope: 'team_booking_create',
          keyHash: idempotencyState.keyHash,
        });
        return jsonError(context, 429, 'Rate limit exceeded. Try again in a minute.');
      }

      try {
        const result = await createTeamBooking(db, context.env, authedUser, {
          teamSlug: payload.teamSlug,
          eventSlug: payload.eventSlug,
          startsAt: payload.startsAt,
          timezone,
          inviteeName: payload.inviteeName,
          inviteeEmail: payload.inviteeEmail,
          ...(payload.answers ? { answers: payload.answers } : {}),
        });

        const tokens = actionTokenMap(result.actionTokens);
        const actionUrls = buildActionUrls(context.req.raw, appBaseUrl, {
          cancelToken: tokens.cancelToken,
          rescheduleToken: tokens.rescheduleToken,
        });
        const sideEffects = await runBookingCreatedSideEffects(context.env, db, {
          booking: result.booking,
          eventType: result.eventType,
          organizerDisplayName:
            result.team.mode === 'collective' ? `${result.team.name} Team` : result.organizer.displayName,
          timezone,
          actionUrls,
          analytics: { teamEventTypeId: result.team.teamEventTypeId },
          webhookMetadata: {
            timezone,
            teamId: result.team.id,
            teamEventTypeId: result.team.teamEventTypeId,
            teamMode: result.team.mode,
            assignmentUserIds: result.assignmentUserIds,
          },
        });

        const responseBody: Record<string, unknown> = {
          ok: true,
          booking: {
            id: result.booking.id,
            eventTypeId: result.booking.eventTypeId,
            organizerId: result.booking.organizerId,
            inviteeName: result.booking.inviteeName,
            inviteeEmail: result.booking.inviteeEmail,
            startsAt: result.booking.startsAt.toISOString(),
            endsAt: result.booking.endsAt.toISOString(),
            assignmentUserIds: result.assignmentUserIds,
            teamMode: result.team.mode,
          },
          actions: {
            cancel: {
              token: tokens.cancelToken,
              expiresAt: tokens.cancelExpiresAt,
              pageUrl: actionUrls.cancelPageUrl,
              lookupUrl: actionUrls.lookupCancelUrl,
              url: actionUrls.cancelUrl,
            },
            reschedule: {
              token: tokens.rescheduleToken,
              expiresAt: tokens.rescheduleExpiresAt,
              pageUrl: actionUrls.reschedulePageUrl,
              lookupUrl: actionUrls.lookupRescheduleUrl,
              url: actionUrls.rescheduleUrl,
            },
          },
          email: sideEffects.email,
          notifications: { queued: result.queuedNotifications },
          webhooks: { queued: sideEffects.queuedWebhookDeliveries },
          calendarWriteback: sideEffects.calendarWriteback,
        };

        await completeIdempotencyRequest(db, {
          scope: 'team_booking_create',
          keyHash: idempotencyState.keyHash,
          statusCode: 200,
          responseBody,
        });

        return context.json(responseBody);
      } catch (error) {
        if (error instanceof BookingNotFoundError) {
          const responseBody = { ok: false, error: 'Team event type not found.' };
          await completeIdempotencyRequest(db, {
            scope: 'team_booking_create',
            keyHash: idempotencyState.keyHash,
            statusCode: 404,
            responseBody,
          });
          return context.json(responseBody, 404);
        }
        if (error instanceof BookingValidationError) {
          const responseBody = { ok: false, error: error.message };
          await completeIdempotencyRequest(db, {
            scope: 'team_booking_create',
            keyHash: idempotencyState.keyHash,
            statusCode: 400,
            responseBody,
          });
          return context.json(responseBody, 400);
        }
        if (error instanceof BookingConflictError) {
          const responseBody = { ok: false, error: error.message };
          await completeIdempotencyRequest(db, {
            scope: 'team_booking_create',
            keyHash: idempotencyState.keyHash,
            statusCode: 409,
            responseBody,
          });
          return context.json(responseBody, 409);
        }

        if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
          await releaseIdempotencyRequest(db, {
            scope: 'team_booking_create',
            keyHash: idempotencyState.keyHash,
          });
          return jsonDemoQuotaError(context, db, context.env, authedUser, error);
        }

        console.error('Unexpected error in team booking create:', error);
        const responseBody = { ok: false, error: 'Internal server error.' };
        await completeIdempotencyRequest(db, {
          scope: 'team_booking_create',
          keyHash: idempotencyState.keyHash,
          statusCode: 500,
          responseBody,
        });
        return context.json(responseBody, 500);
      }
    });
  });
};
