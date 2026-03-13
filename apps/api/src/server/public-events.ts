import { and, eq } from 'drizzle-orm';

import { eventTypes, users } from '@opencalendly/db';
import { eventQuestionsSchema, type EventQuestion } from '@opencalendly/shared';

import type { Database, PublicEventView } from './types';
import { normalizeTimezone } from './core';
import type { PublicEventType } from '../lib/booking';

export const toEventQuestions = (value: unknown): EventQuestion[] => {
  const parsed = eventQuestionsSchema.safeParse(value ?? []);
  return parsed.success ? parsed.data : [];
};

export const findPublicEventType = async (
  db: Database,
  username: string,
  slug: string,
): Promise<PublicEventType | null> => {
  const [row] = await db
    .select({
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
      isActive: eventTypes.isActive,
      organizerEmail: users.email,
      organizerDisplayName: users.displayName,
      organizerTimezone: users.timezone,
    })
    .from(eventTypes)
    .innerJoin(users, eq(users.id, eventTypes.userId))
    .where(and(eq(users.username, username), eq(eventTypes.slug, slug)))
    .limit(1);

  if (!row || !row.isActive) {
    return null;
  }

  return {
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
    isActive: row.isActive,
    organizerDisplayName: row.organizerDisplayName,
    organizerEmail: row.organizerEmail,
    organizerTimezone: normalizeTimezone(row.organizerTimezone),
  };
};

export const findPublicEventView = async (
  db: Database,
  username: string,
  slug: string,
): Promise<PublicEventView | null> => {
  const eventType = await findPublicEventType(db, username, slug);
  if (!eventType) {
    return null;
  }

  const [organizer] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      timezone: users.timezone,
    })
    .from(users)
    .where(eq(users.id, eventType.userId))
    .limit(1);

  if (!organizer) {
    return null;
  }

  return {
    eventType: {
      id: eventType.id,
      slug: eventType.slug,
      name: eventType.name,
      durationMinutes: eventType.durationMinutes,
      dailyBookingLimit: eventType.dailyBookingLimit,
      weeklyBookingLimit: eventType.weeklyBookingLimit,
      monthlyBookingLimit: eventType.monthlyBookingLimit,
      locationType: eventType.locationType,
      locationValue: eventType.locationValue,
      questions: eventType.questions,
    },
    organizer: {
      id: organizer.id,
      email: organizer.email,
      username: organizer.username,
      displayName: organizer.displayName,
      timezone: normalizeTimezone(organizer.timezone),
    },
  };
};
