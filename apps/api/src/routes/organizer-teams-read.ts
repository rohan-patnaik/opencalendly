import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import {
  eventTypes,
  teamEventTypeMembers,
  teamEventTypes,
  teamMembers,
  teams,
  users,
} from '@opencalendly/db';

import { resolveAuthenticatedUser } from '../server/auth-session';
import { isUuid, jsonError, normalizeTimezone } from '../server/core';
import { withDatabase } from '../server/database';
import { toEventQuestions } from '../server/public-events';
import type { ApiApp } from '../server/types';

export const registerOrganizerTeamReadRoutes = (app: ApiApp): void => {
  app.get('/v0/teams', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const teamRows = await db
        .select({
          id: teams.id,
          ownerUserId: teams.ownerUserId,
          slug: teams.slug,
          name: teams.name,
          createdAt: teams.createdAt,
        })
        .from(teams)
        .where(eq(teams.ownerUserId, authedUser.id))
        .orderBy(desc(teams.createdAt));

      if (teamRows.length === 0) {
        return context.json({ ok: true, teams: [] });
      }

      const teamIds = teamRows.map((team) => team.id);
      const [memberCounts, teamEventTypeCounts] = await Promise.all([
        db
          .select({ teamId: teamMembers.teamId, count: sql<number>`cast(count(*) as int)` })
          .from(teamMembers)
          .where(inArray(teamMembers.teamId, teamIds))
          .groupBy(teamMembers.teamId),
        db
          .select({ teamId: teamEventTypes.teamId, count: sql<number>`cast(count(*) as int)` })
          .from(teamEventTypes)
          .where(inArray(teamEventTypes.teamId, teamIds))
          .groupBy(teamEventTypes.teamId),
      ]);

      const memberCountByTeamId = new Map(memberCounts.map((row) => [row.teamId, row.count]));
      const teamEventTypeCountByTeamId = new Map(teamEventTypeCounts.map((row) => [row.teamId, row.count]));

      return context.json({
        ok: true,
        teams: teamRows.map((team) => ({
          id: team.id,
          ownerUserId: team.ownerUserId,
          slug: team.slug,
          name: team.name,
          memberCount: memberCountByTeamId.get(team.id) ?? 0,
          teamEventTypeCount: teamEventTypeCountByTeamId.get(team.id) ?? 0,
          createdAt: team.createdAt.toISOString(),
        })),
      });
    });
  });

  app.get('/v0/teams/:teamId/members', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const teamId = context.req.param('teamId');
      if (!isUuid(teamId)) {
        return jsonError(context, 400, 'Invalid teamId.');
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
        return jsonError(context, 403, 'Only the team owner can view members.');
      }

      const rows = await db
        .select({
          id: teamMembers.id,
          teamId: teamMembers.teamId,
          userId: teamMembers.userId,
          role: teamMembers.role,
          createdAt: teamMembers.createdAt,
          email: users.email,
          username: users.username,
          displayName: users.displayName,
          timezone: users.timezone,
        })
        .from(teamMembers)
        .innerJoin(users, eq(users.id, teamMembers.userId))
        .where(eq(teamMembers.teamId, teamId))
        .orderBy(asc(teamMembers.createdAt), asc(users.username));

      return context.json({
        ok: true,
        members: rows.map((row) => ({
          id: row.id,
          teamId: row.teamId,
          userId: row.userId,
          role: row.role,
          createdAt: row.createdAt.toISOString(),
          user: {
            id: row.userId,
            email: row.email,
            username: row.username,
            displayName: row.displayName,
            timezone: normalizeTimezone(row.timezone),
          },
        })),
      });
    });
  });

  app.get('/v0/teams/:teamId/event-types', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const teamId = context.req.param('teamId');
      if (!isUuid(teamId)) {
        return jsonError(context, 400, 'Invalid teamId.');
      }

      const [team] = await db
        .select({ id: teams.id, ownerUserId: teams.ownerUserId, slug: teams.slug, name: teams.name })
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1);
      if (!team) {
        return jsonError(context, 404, 'Team not found.');
      }
      if (team.ownerUserId !== authedUser.id) {
        return jsonError(context, 403, 'Only the team owner can view team event types.');
      }

      const rows = await db
        .select({
          teamEventTypeId: teamEventTypes.id,
          mode: teamEventTypes.mode,
          roundRobinCursor: teamEventTypes.roundRobinCursor,
          createdAt: teamEventTypes.createdAt,
          eventTypeId: eventTypes.id,
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
        })
        .from(teamEventTypes)
        .innerJoin(eventTypes, eq(eventTypes.id, teamEventTypes.eventTypeId))
        .where(eq(teamEventTypes.teamId, team.id))
        .orderBy(desc(teamEventTypes.createdAt));

      if (rows.length === 0) {
        return context.json({ ok: true, team, eventTypes: [] });
      }

      const teamEventTypeIds = rows.map((row) => row.teamEventTypeId);
      const memberRows = await db
        .select({
          teamEventTypeId: teamEventTypeMembers.teamEventTypeId,
          userId: teamEventTypeMembers.userId,
          isRequired: teamEventTypeMembers.isRequired,
          role: teamMembers.role,
          email: users.email,
          username: users.username,
          displayName: users.displayName,
          timezone: users.timezone,
        })
        .from(teamEventTypeMembers)
        .innerJoin(teamMembers, and(eq(teamMembers.userId, teamEventTypeMembers.userId), eq(teamMembers.teamId, team.id)))
        .innerJoin(users, eq(users.id, teamEventTypeMembers.userId))
        .where(inArray(teamEventTypeMembers.teamEventTypeId, teamEventTypeIds))
        .orderBy(asc(teamEventTypeMembers.createdAt), asc(users.username));

      const membersByTeamEventTypeId = new Map<string, Array<Record<string, unknown>>>();
      for (const member of memberRows) {
        const existing = membersByTeamEventTypeId.get(member.teamEventTypeId) ?? [];
        existing.push({
          userId: member.userId,
          isRequired: member.isRequired,
          role: member.role,
          user: {
            id: member.userId,
            email: member.email,
            username: member.username,
            displayName: member.displayName,
            timezone: normalizeTimezone(member.timezone),
          },
        });
        membersByTeamEventTypeId.set(member.teamEventTypeId, existing);
      }

      return context.json({
        ok: true,
        team,
        eventTypes: rows.map((row) => {
          const members = membersByTeamEventTypeId.get(row.teamEventTypeId) ?? [];
          return {
            id: row.teamEventTypeId,
            mode: row.mode,
            roundRobinCursor: row.roundRobinCursor,
            createdAt: row.createdAt.toISOString(),
            requiredMemberUserIds: members
              .filter((member) => Boolean(member.isRequired))
              .map((member) => member.userId),
            members,
            eventType: {
              id: row.eventTypeId,
              slug: row.slug,
              name: row.name,
              durationMinutes: row.durationMinutes,
              dailyBookingLimit: row.dailyBookingLimit,
              weeklyBookingLimit: row.weeklyBookingLimit,
              monthlyBookingLimit: row.monthlyBookingLimit,
              locationType: row.locationType,
              locationValue: row.locationValue,
              questions: toEventQuestions(row.questions),
              isActive: row.isActive,
            },
          };
        }),
      });
    });
  });
};
