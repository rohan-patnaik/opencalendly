import { eq } from 'drizzle-orm';

import {
  eventTypes,
  teamEventTypeMembers,
  teamEventTypes,
  teamMembers,
  teams,
  users,
} from '@opencalendly/db';
import {
  teamAddMemberSchema,
  teamCreateSchema,
  teamEventTypeCreateSchema,
} from '@opencalendly/shared';

import { resolveAuthenticatedUser } from '../server/auth-session';
import { isUuid, jsonError } from '../server/core';
import { withDatabase, isUniqueViolation } from '../server/database';
import { consumeDemoFeatureCredits, jsonDemoQuotaError } from '../server/demo-quota';
import { buildDemoFeatureSourceKey } from '../server/idempotency';
import { toEventQuestions } from '../server/public-events';
import type { ApiApp, DemoQuotaDb } from '../server/types';
import { DemoQuotaAdmissionError, DemoQuotaCreditsError } from '../server/types';

const normalizeSlugBody = (body: unknown): unknown => {
  return body && typeof body === 'object'
    ? {
        ...body,
        slug: typeof (body as { slug?: unknown }).slug === 'string'
          ? ((body as { slug: string }).slug).toLowerCase().trim()
          : (body as { slug?: unknown }).slug,
      }
    : body;
};

export const registerOrganizerTeamWriteRoutes = (app: ApiApp): void => {
  app.post('/v0/teams', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const parsed = teamCreateSchema.safeParse(normalizeSlugBody(await context.req.json().catch(() => null)));
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      try {
        const now = new Date();
        const team = await db.transaction(async (transaction) => {
          const [created] = await transaction
            .insert(teams)
            .values({
              ownerUserId: authedUser.id,
              name: parsed.data.name,
              slug: parsed.data.slug,
            })
            .returning({
              id: teams.id,
              ownerUserId: teams.ownerUserId,
              name: teams.name,
              slug: teams.slug,
            });

          if (!created) {
            throw new Error('Failed to create team.');
          }

          await transaction.insert(teamMembers).values({ teamId: created.id, userId: authedUser.id, role: 'owner' });
          await consumeDemoFeatureCredits(transaction as DemoQuotaDb, context.env, authedUser, {
            featureKey: 'team_create',
            sourceKey: buildDemoFeatureSourceKey('team_create', {
              slug: parsed.data.slug,
              name: parsed.data.name,
            }),
            metadata: { teamId: created.id, slug: created.slug },
            now,
          });

          return created;
        });

        return context.json({ ok: true, team });
      } catch (error) {
        if (isUniqueViolation(error, 'teams_slug_unique')) {
          return jsonError(context, 409, 'A team with that slug already exists.');
        }
        if (isUniqueViolation(error, 'team_members_team_user_unique')) {
          return jsonError(context, 409, 'User is already a team member.');
        }
        if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
          return jsonDemoQuotaError(context, db, context.env, authedUser, error);
        }
        throw error;
      }
    });
  });

  app.post('/v0/teams/:teamId/members', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const teamId = context.req.param('teamId');
      if (!isUuid(teamId)) {
        return jsonError(context, 400, 'Invalid teamId.');
      }

      const body = await context.req.json().catch(() => null);
      const parsed = teamAddMemberSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      const [team] = await db
        .select({ id: teams.id, ownerUserId: teams.ownerUserId })
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1);
      if (!team) {
        return jsonError(context, 404, 'Team not found.');
      }
      if (team.ownerUserId !== authedUser.id) {
        return jsonError(context, 403, 'Only the team owner can add members.');
      }

      const [memberUser] = await db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          displayName: users.displayName,
        })
        .from(users)
        .where(eq(users.id, parsed.data.userId))
        .limit(1);
      if (!memberUser) {
        return jsonError(context, 404, 'User not found.');
      }

      try {
        const now = new Date();
        const inserted = await db.transaction(async (transaction) => {
          const [created] = await transaction
            .insert(teamMembers)
            .values({
              teamId: team.id,
              userId: parsed.data.userId,
              role: parsed.data.role,
            })
            .returning({
              teamId: teamMembers.teamId,
              userId: teamMembers.userId,
              role: teamMembers.role,
            });

          if (!created) {
            throw new Error('Failed to add team member.');
          }

          await consumeDemoFeatureCredits(transaction as DemoQuotaDb, context.env, authedUser, {
            featureKey: 'team_member_add',
            sourceKey: buildDemoFeatureSourceKey('team_member_add', {
              teamId: team.id,
              userId: parsed.data.userId,
              role: parsed.data.role,
            }),
            metadata: { teamId: team.id, userId: parsed.data.userId },
            now,
          });

          return created;
        });

        if (!inserted) {
          return jsonError(context, 500, 'Failed to add team member.');
        }

        return context.json({ ok: true, member: { ...inserted, user: memberUser } });
      } catch (error) {
        if (isUniqueViolation(error, 'team_members_team_user_unique')) {
          return jsonError(context, 409, 'User is already a team member.');
        }
        if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
          return jsonDemoQuotaError(context, db, context.env, authedUser, error);
        }
        throw error;
      }
    });
  });

  app.post('/v0/team-event-types', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const parsed = teamEventTypeCreateSchema.safeParse(normalizeSlugBody(await context.req.json().catch(() => null)));
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      const [team] = await db
        .select({ id: teams.id, ownerUserId: teams.ownerUserId })
        .from(teams)
        .where(eq(teams.id, parsed.data.teamId))
        .limit(1);
      if (!team) {
        return jsonError(context, 404, 'Team not found.');
      }
      if (team.ownerUserId !== authedUser.id) {
        return jsonError(context, 403, 'Only the team owner can create team event types.');
      }

      const teamMemberRows = await db
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, team.id));
      const teamMemberSet = new Set(teamMemberRows.map((member) => member.userId));
      const requiredMemberUserIds = parsed.data.requiredMemberUserIds
        ? Array.from(new Set(parsed.data.requiredMemberUserIds))
        : Array.from(teamMemberSet);

      if (requiredMemberUserIds.length === 0) {
        return jsonError(context, 400, 'Team event type must include at least one required member.');
      }
      if (requiredMemberUserIds.some((memberId) => !teamMemberSet.has(memberId))) {
        return jsonError(context, 400, 'All required members must belong to the team.');
      }

      try {
        const result = await db.transaction(async (transaction) => {
          const [eventType] = await transaction
            .insert(eventTypes)
            .values({
              userId: authedUser.id,
              name: parsed.data.name,
              slug: parsed.data.slug,
              durationMinutes: parsed.data.durationMinutes,
              dailyBookingLimit: parsed.data.dailyBookingLimit ?? null,
              weeklyBookingLimit: parsed.data.weeklyBookingLimit ?? null,
              monthlyBookingLimit: parsed.data.monthlyBookingLimit ?? null,
              locationType: parsed.data.locationType,
              locationValue: parsed.data.locationValue ?? null,
              questions: parsed.data.questions,
            })
            .returning({
              id: eventTypes.id,
              userId: eventTypes.userId,
              slug: eventTypes.slug,
              name: eventTypes.name,
              durationMinutes: eventTypes.durationMinutes,
              dailyBookingLimit: eventTypes.dailyBookingLimit,
              weeklyBookingLimit: eventTypes.weeklyBookingLimit,
              monthlyBookingLimit: eventTypes.monthlyBookingLimit,
              locationType: eventTypes.locationType,
              locationValue: eventTypes.locationValue,
              questions: eventTypes.questions,
              isActive: eventTypes.isActive,
            });
          if (!eventType) {
            throw new Error('Failed to create base event type.');
          }

          const [teamEventType] = await transaction
            .insert(teamEventTypes)
            .values({ teamId: team.id, eventTypeId: eventType.id, mode: parsed.data.mode })
            .returning({
              id: teamEventTypes.id,
              mode: teamEventTypes.mode,
              roundRobinCursor: teamEventTypes.roundRobinCursor,
            });
          if (!teamEventType) {
            throw new Error('Failed to create team event type.');
          }

          await transaction.insert(teamEventTypeMembers).values(
            requiredMemberUserIds.map((memberUserId) => ({
              teamEventTypeId: teamEventType.id,
              userId: memberUserId,
              isRequired: true,
            })),
          );

          await consumeDemoFeatureCredits(transaction as DemoQuotaDb, context.env, authedUser, {
            featureKey: 'team_event_type_create',
            sourceKey: buildDemoFeatureSourceKey('team_event_type_create', {
              teamId: team.id,
              slug: parsed.data.slug,
              mode: parsed.data.mode,
              requiredMemberUserIds,
            }),
            metadata: {
              teamId: team.id,
              teamEventTypeId: teamEventType.id,
              eventTypeId: eventType.id,
            },
            now: new Date(),
          });

          return { teamEventType, eventType };
        });

        return context.json({
          ok: true,
          teamEventType: {
            id: result.teamEventType.id,
            teamId: team.id,
            mode: result.teamEventType.mode,
            roundRobinCursor: result.teamEventType.roundRobinCursor,
            requiredMemberUserIds,
            eventType: { ...result.eventType, questions: toEventQuestions(result.eventType.questions) },
          },
        });
      } catch (error) {
        if (isUniqueViolation(error, 'event_types_user_slug_unique')) {
          return jsonError(context, 409, 'An event type with that slug already exists.');
        }
        if (isUniqueViolation(error, 'team_event_type_members_event_type_user_unique')) {
          return jsonError(context, 409, 'Duplicate team event member assignment.');
        }
        if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
          return jsonDemoQuotaError(context, db, context.env, authedUser, error);
        }
        throw error;
      }
    });
  });
};
