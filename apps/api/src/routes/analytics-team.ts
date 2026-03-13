import { and, eq, gte, inArray, lt } from 'drizzle-orm';

import {
  bookings,
  teamBookingAssignments,
  teamEventTypes,
  teams,
  users,
  eventTypes,
} from '@opencalendly/db';
import { analyticsRangeQuerySchema } from '@opencalendly/shared';

import { parseBookingMetadata } from '../lib/booking-actions';
import { resolveAnalyticsRange, summarizeTeamAnalytics } from '../lib/analytics';
import { resolveAuthenticatedUser } from '../server/auth-session';
import { jsonError, normalizeTimezone } from '../server/core';
import { withDatabase } from '../server/database';
import type { ApiApp } from '../server/types';

export const registerAnalyticsTeamRoutes = (app: ApiApp): void => {
  app.get('/v0/analytics/team', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const query = Object.fromEntries(new URL(context.req.url).searchParams.entries());
      const parsed = analyticsRangeQuerySchema.safeParse(query);
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid query params.');
      }

      let range: { start: Date; endExclusive: Date; startDate: string; endDate: string };
      try {
        range = resolveAnalyticsRange({
          startDate: parsed.data.startDate,
          endDate: parsed.data.endDate,
        });
      } catch (error) {
        return jsonError(context, 400, error instanceof Error ? error.message : 'Invalid range.');
      }

      const teamEventTypeWhere = [eq(teams.ownerUserId, authedUser.id)];
      if (parsed.data.teamId) {
        teamEventTypeWhere.push(eq(teamEventTypes.teamId, parsed.data.teamId));
      }
      if (parsed.data.eventTypeId) {
        teamEventTypeWhere.push(eq(teamEventTypes.eventTypeId, parsed.data.eventTypeId));
      }

      const teamEventTypeRows = await db
        .select({
          teamEventTypeId: teamEventTypes.id,
          teamId: teams.id,
          teamName: teams.name,
          mode: teamEventTypes.mode,
          eventTypeId: eventTypes.id,
          eventTypeName: eventTypes.name,
        })
        .from(teamEventTypes)
        .innerJoin(teams, eq(teams.id, teamEventTypes.teamId))
        .innerJoin(eventTypes, eq(eventTypes.id, teamEventTypes.eventTypeId))
        .where(and(...teamEventTypeWhere));

      if (teamEventTypeRows.length === 0) {
        return context.json({
          ok: true,
          range: { startDate: range.startDate, endDate: range.endDate },
          roundRobinAssignments: [],
          collectiveBookings: [],
        });
      }

      const teamEventTypeById = new Map(teamEventTypeRows.map((row) => [row.teamEventTypeId, row] as const));
      const teamEventTypeIdsByEventTypeId = new Map<string, string[]>();
      for (const row of teamEventTypeRows) {
        const existing = teamEventTypeIdsByEventTypeId.get(row.eventTypeId);
        if (existing) {
          existing.push(row.teamEventTypeId);
        } else {
          teamEventTypeIdsByEventTypeId.set(row.eventTypeId, [row.teamEventTypeId]);
        }
      }

      const bookingEventTypeIds = Array.from(teamEventTypeIdsByEventTypeId.keys());
      const teamBookingRows =
        bookingEventTypeIds.length === 0
          ? []
          : await db
              .select({
                bookingId: bookings.id,
                eventTypeId: bookings.eventTypeId,
                metadata: bookings.metadata,
              })
              .from(bookings)
              .where(
                and(
                  inArray(bookings.eventTypeId, bookingEventTypeIds),
                  gte(bookings.createdAt, range.start),
                  lt(bookings.createdAt, range.endExclusive),
                ),
              );

      const bookingIds = teamBookingRows.map((row) => row.bookingId);
      const assignmentRows =
        bookingIds.length === 0
          ? []
          : await db
              .select({
                bookingId: teamBookingAssignments.bookingId,
                teamEventTypeId: teamBookingAssignments.teamEventTypeId,
                memberUserId: teamBookingAssignments.userId,
                memberDisplayName: users.displayName,
              })
              .from(teamBookingAssignments)
              .innerJoin(users, eq(users.id, teamBookingAssignments.userId))
              .where(inArray(teamBookingAssignments.bookingId, bookingIds));

      const assignmentRowsByBookingId = new Map<string, typeof assignmentRows>();
      for (const row of assignmentRows) {
        const existing = assignmentRowsByBookingId.get(row.bookingId);
        if (existing) {
          existing.push(row);
        } else {
          assignmentRowsByBookingId.set(row.bookingId, [row]);
        }
      }

      const metadataByBookingId = new Map<string, ReturnType<typeof parseBookingMetadata>['team'] | undefined>();
      const metadataMemberUserIds = new Set<string>();
      for (const row of teamBookingRows) {
        const parsedTeamMetadata = parseBookingMetadata(row.metadata, normalizeTimezone).team;
        metadataByBookingId.set(row.bookingId, parsedTeamMetadata);
        for (const memberUserId of parsedTeamMetadata?.assignmentUserIds ?? []) {
          metadataMemberUserIds.add(memberUserId);
        }
      }

      const memberDisplayNameByUserId = new Map(assignmentRows.map((row) => [row.memberUserId, row.memberDisplayName]));
      const missingMemberUserIds = Array.from(metadataMemberUserIds).filter((memberUserId) => !memberDisplayNameByUserId.has(memberUserId));
      if (missingMemberUserIds.length > 0) {
        const missingMemberRows = await db
          .select({ id: users.id, displayName: users.displayName })
          .from(users)
          .where(inArray(users.id, missingMemberUserIds));
        for (const row of missingMemberRows) {
          memberDisplayNameByUserId.set(row.id, row.displayName);
        }
      }

      const roundRobinRows: Array<{ teamEventTypeId: string; memberUserId: string; memberDisplayName: string }> = [];
      const collectiveRows: Array<{ bookingId: string; teamEventTypeId: string }> = [];

      for (const row of teamBookingRows) {
        const bookingAssignmentRows = assignmentRowsByBookingId.get(row.bookingId) ?? [];
        const parsedTeamMetadata = metadataByBookingId.get(row.bookingId);

        let teamEventTypeId: string | null = null;
        if (parsedTeamMetadata?.teamEventTypeId && teamEventTypeById.has(parsedTeamMetadata.teamEventTypeId)) {
          teamEventTypeId = parsedTeamMetadata.teamEventTypeId;
        } else if (bookingAssignmentRows.length > 0) {
          teamEventTypeId = bookingAssignmentRows[0]?.teamEventTypeId ?? null;
        } else {
          const fallbackTeamEventTypeIds = teamEventTypeIdsByEventTypeId.get(row.eventTypeId) ?? [];
          if (fallbackTeamEventTypeIds.length === 1) {
            teamEventTypeId = fallbackTeamEventTypeIds[0] ?? null;
          }
        }

        if (!teamEventTypeId) {
          continue;
        }

        const teamEventTypeMeta = teamEventTypeById.get(teamEventTypeId);
        if (!teamEventTypeMeta) {
          continue;
        }

        if ((parsedTeamMetadata?.mode ?? teamEventTypeMeta.mode) === 'collective') {
          collectiveRows.push({ bookingId: row.bookingId, teamEventTypeId });
          continue;
        }

        const assignmentSource =
          bookingAssignmentRows.length > 0
            ? bookingAssignmentRows
                .filter((assignment) => assignment.teamEventTypeId === teamEventTypeId)
                .map((assignment) => ({
                  memberUserId: assignment.memberUserId,
                  memberDisplayName: assignment.memberDisplayName,
                }))
            : (parsedTeamMetadata?.assignmentUserIds ?? []).map((memberUserId) => ({
                memberUserId,
                memberDisplayName: memberDisplayNameByUserId.get(memberUserId) ?? 'Unknown Member',
              }));

        for (const assignment of assignmentSource) {
          roundRobinRows.push({
            teamEventTypeId,
            memberUserId: assignment.memberUserId,
            memberDisplayName: assignment.memberDisplayName,
          });
        }
      }

      const metrics = summarizeTeamAnalytics({
        teamEventTypeRows,
        roundRobinRows,
        collectiveRows,
      });

      return context.json({
        ok: true,
        range: { startDate: range.startDate, endDate: range.endDate },
        roundRobinAssignments: metrics.roundRobinAssignments,
        collectiveBookings: metrics.collectiveBookings,
      });
    });
  });
};
