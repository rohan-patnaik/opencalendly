import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';

import {
  bookings,
  eventTypes,
  teamEventTypeMembers,
  teamEventTypes,
  teamMembers,
  teams,
  users,
} from '@opencalendly/db';

import type { TeamSchedulingMode } from '@opencalendly/shared';

import type { EventTypeBookingCaps } from '../lib/booking-caps';
import {
  type Database,
  type QueryableDb,
  type TeamEventTypeContext,
} from './types';
import { normalizeTimezone } from './core';
import { toEventQuestions } from './public-events';

export const resolveTeamMode = (rawMode: string): TeamSchedulingMode | null => {
  return rawMode === 'round_robin' || rawMode === 'collective' ? rawMode : null;
};

export const toEventTypeBookingCaps = (eventType: {
  dailyBookingLimit?: number | null;
  weeklyBookingLimit?: number | null;
  monthlyBookingLimit?: number | null;
}): EventTypeBookingCaps => {
  return {
    dailyBookingLimit: eventType.dailyBookingLimit ?? null,
    weeklyBookingLimit: eventType.weeklyBookingLimit ?? null,
    monthlyBookingLimit: eventType.monthlyBookingLimit ?? null,
  };
};

export const countConfirmedBookingsForEventTypeWindow = async (
  db: QueryableDb,
  input: { eventTypeId: string; startsAt: Date; endsAt: Date; excludeBookingId?: string },
): Promise<number> => {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(
      and(
        eq(bookings.eventTypeId, input.eventTypeId),
        eq(bookings.status, 'confirmed'),
        gte(bookings.startsAt, input.startsAt),
        lt(bookings.startsAt, input.endsAt),
        ...(input.excludeBookingId ? [sql`${bookings.id} <> ${input.excludeBookingId}`] : []),
      ),
    );

  return row?.count ?? 0;
};

export const listConfirmedBookingStartsForEventType = async (
  db: QueryableDb,
  input: { eventTypeId: string; startsAt: Date; endsAt: Date },
): Promise<Array<{ startsAt: Date }>> => {
  return db
    .select({ startsAt: bookings.startsAt })
    .from(bookings)
    .where(
      and(
        eq(bookings.eventTypeId, input.eventTypeId),
        eq(bookings.status, 'confirmed'),
        gte(bookings.startsAt, input.startsAt),
        lt(bookings.startsAt, input.endsAt),
      ),
    );
};

export const findTeamEventTypeContext = async (
  db: Database,
  teamSlug: string,
  eventSlug: string,
): Promise<TeamEventTypeContext | null> => {
  const [row] = await db
    .select({
      teamId: teams.id,
      teamOwnerUserId: teams.ownerUserId,
      teamSlug: teams.slug,
      teamName: teams.name,
      teamEventTypeId: teamEventTypes.id,
      mode: teamEventTypes.mode,
      roundRobinCursor: teamEventTypes.roundRobinCursor,
      eventTypeId: eventTypes.id,
      eventTypeUserId: eventTypes.userId,
      eventTypeSlug: eventTypes.slug,
      eventTypeName: eventTypes.name,
      durationMinutes: eventTypes.durationMinutes,
      dailyBookingLimit: eventTypes.dailyBookingLimit,
      weeklyBookingLimit: eventTypes.weeklyBookingLimit,
      monthlyBookingLimit: eventTypes.monthlyBookingLimit,
      locationType: eventTypes.locationType,
      locationValue: eventTypes.locationValue,
      questions: eventTypes.questions,
      organizerTimezone: users.timezone,
      isActive: eventTypes.isActive,
    })
    .from(teamEventTypes)
    .innerJoin(teams, eq(teams.id, teamEventTypes.teamId))
    .innerJoin(eventTypes, eq(eventTypes.id, teamEventTypes.eventTypeId))
    .innerJoin(users, eq(users.id, eventTypes.userId))
    .where(and(eq(teams.slug, teamSlug), eq(eventTypes.slug, eventSlug)))
    .limit(1);

  if (!row || !row.isActive) {
    return null;
  }

  const mode = resolveTeamMode(row.mode);
  if (!mode) {
    return null;
  }

  const requiredMembers = await db
    .select({ userId: teamMembers.userId, role: teamMembers.role })
    .from(teamEventTypeMembers)
    .innerJoin(
      teamMembers,
      and(
        eq(teamMembers.teamId, row.teamId),
        eq(teamMembers.userId, teamEventTypeMembers.userId),
      ),
    )
    .where(
      and(
        eq(teamEventTypeMembers.teamEventTypeId, row.teamEventTypeId),
        eq(teamEventTypeMembers.isRequired, true),
      ),
    )
    .orderBy(asc(teamMembers.createdAt), asc(teamMembers.userId));

  if (requiredMembers.length === 0) {
    return null;
  }

  return {
    team: {
      id: row.teamId,
      ownerUserId: row.teamOwnerUserId,
      slug: row.teamSlug,
      name: row.teamName,
    },
    eventType: {
      id: row.eventTypeId,
      userId: row.eventTypeUserId,
      slug: row.eventTypeSlug,
      name: row.eventTypeName,
      durationMinutes: row.durationMinutes,
      dailyBookingLimit: row.dailyBookingLimit,
      weeklyBookingLimit: row.weeklyBookingLimit,
      monthlyBookingLimit: row.monthlyBookingLimit,
      locationType: row.locationType,
      locationValue: row.locationValue,
      questions: toEventQuestions(row.questions),
      organizerTimezone: normalizeTimezone(row.organizerTimezone),
      isActive: row.isActive,
    },
    mode,
    roundRobinCursor: row.roundRobinCursor,
    members: requiredMembers.map((member) => ({ userId: member.userId, role: member.role })),
  };
};
