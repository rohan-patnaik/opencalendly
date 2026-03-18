import { inArray } from 'drizzle-orm';

import { users } from '@opencalendly/db';

import { resolveAuthenticatedUser } from '../server/auth-session';
import { emitAuditEvent } from '../server/audit';
import { jsonError, normalizeTimezone } from '../server/core';
import { withDatabase } from '../server/database';
import { requiresLaunchDemoAuthForTeamRoute, requiresLaunchDemoAuthForUserRoute } from '../server/demo-quota';
import { findPublicEventView } from '../server/public-events';
import { findTeamEventTypeContext } from '../server/team-context';
import { resolveRateLimitClientKey, isPublicBookingRateLimited } from '../server/rate-limit';
import { PUBLIC_BOOKING_RATE_LIMIT_MAX_AVAILABILITY_REQUESTS_PER_SCOPE } from '../server/env';
import type { ApiApp } from '../server/types';

export const registerPublicEventRoutes = (app: ApiApp): void => {
  app.get('/v0/users/:username/event-types/:slug', async (context) => {
    return withDatabase(context, async (db) => {
      const startedAt = Date.now();
      const username = context.req.param('username');
      const slug = context.req.param('slug');
      if (requiresLaunchDemoAuthForUserRoute(username)) {
        const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
        if (!authedUser) {
          emitAuditEvent({
            event: 'availability_read_completed',
            level: 'warn',
            route: '/v0/users/:username/event-types/:slug',
            statusCode: 401,
            durationMs: Date.now() - startedAt,
            username,
            eventSlug: slug,
          });
          return jsonError(context, 401, 'Sign in to access the launch demo.');
        }
      }

      const result = await findPublicEventView(db, username, slug);
      if (!result) {
        emitAuditEvent({
          event: 'availability_read_completed',
          level: 'warn',
          route: '/v0/users/:username/event-types/:slug',
          statusCode: 404,
          durationMs: Date.now() - startedAt,
          username,
          eventSlug: slug,
        });
        return jsonError(context, 404, 'Event type not found.');
      }

      emitAuditEvent({
        event: 'availability_read_completed',
        level: 'info',
        route: '/v0/users/:username/event-types/:slug',
        statusCode: 200,
        durationMs: Date.now() - startedAt,
        username,
        eventSlug: slug,
      });

      return context.json({
        ok: true,
        eventType: result.eventType,
        organizer: {
          username: result.organizer.username,
          displayName: result.organizer.displayName,
          timezone: result.organizer.timezone,
        },
      });
    });
  });

  app.get('/v0/teams/:teamSlug/event-types/:eventSlug', async (context) => {
    return withDatabase(context, async (db) => {
      const startedAt = Date.now();
      const teamSlug = context.req.param('teamSlug');
      const eventSlug = context.req.param('eventSlug');
      if (requiresLaunchDemoAuthForTeamRoute(teamSlug)) {
        const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
        if (!authedUser) {
          emitAuditEvent({
            event: 'availability_read_completed',
            level: 'warn',
            route: '/v0/teams/:teamSlug/event-types/:eventSlug',
            statusCode: 401,
            durationMs: Date.now() - startedAt,
            teamSlug,
            eventSlug,
          });
          return jsonError(context, 401, 'Sign in to access the launch demo.');
        }
      }

      const clientKey = resolveRateLimitClientKey(context.req.raw);
      if (
        await isPublicBookingRateLimited(db, {
          clientKey,
          scope: `team-event|${teamSlug}|${eventSlug}`,
          perScopeLimit: PUBLIC_BOOKING_RATE_LIMIT_MAX_AVAILABILITY_REQUESTS_PER_SCOPE,
        })
      ) {
        emitAuditEvent({
          event: 'availability_read_completed',
          level: 'warn',
          route: '/v0/teams/:teamSlug/event-types/:eventSlug',
          statusCode: 429,
          durationMs: Date.now() - startedAt,
          teamSlug,
          eventSlug,
        });
        return jsonError(context, 429, 'Rate limit exceeded. Try again in a minute.');
      }

      const teamEventContext = await findTeamEventTypeContext(db, teamSlug, eventSlug);
      if (!teamEventContext) {
        emitAuditEvent({
          event: 'availability_read_completed',
          level: 'warn',
          route: '/v0/teams/:teamSlug/event-types/:eventSlug',
          statusCode: 404,
          durationMs: Date.now() - startedAt,
          teamSlug,
          eventSlug,
        });
        return jsonError(context, 404, 'Team event type not found.');
      }

      const memberIds = teamEventContext.members.map((member) => member.userId);
      const memberRows =
        memberIds.length > 0
          ? await db
              .select({
                id: users.id,
                username: users.username,
                displayName: users.displayName,
                timezone: users.timezone,
              })
              .from(users)
              .where(inArray(users.id, memberIds))
          : [];
      const memberById = new Map(memberRows.map((member) => [member.id, member]));

      emitAuditEvent({
        event: 'availability_read_completed',
        level: 'info',
        route: '/v0/teams/:teamSlug/event-types/:eventSlug',
        statusCode: 200,
        durationMs: Date.now() - startedAt,
        teamSlug,
        eventSlug,
      });

      return context.json({
        ok: true,
        team: {
          id: teamEventContext.team.id,
          slug: teamEventContext.team.slug,
          name: teamEventContext.team.name,
        },
        eventType: {
          id: teamEventContext.eventType.id,
          slug: teamEventContext.eventType.slug,
          name: teamEventContext.eventType.name,
          durationMinutes: teamEventContext.eventType.durationMinutes,
          dailyBookingLimit: teamEventContext.eventType.dailyBookingLimit,
          weeklyBookingLimit: teamEventContext.eventType.weeklyBookingLimit,
          monthlyBookingLimit: teamEventContext.eventType.monthlyBookingLimit,
          locationType: teamEventContext.eventType.locationType,
          locationValue: teamEventContext.eventType.locationValue,
          questions: teamEventContext.eventType.questions ?? [],
        },
        mode: teamEventContext.mode,
        members: teamEventContext.members.map((member) => ({
          userId: member.userId,
          role: member.role,
          user: (() => {
            const profile = memberById.get(member.userId);
            return profile
              ? {
                  id: profile.id,
                  username: profile.username,
                  displayName: profile.displayName,
                  timezone: normalizeTimezone(profile.timezone),
                }
              : null;
          })(),
        })),
      });
    });
  });
};
