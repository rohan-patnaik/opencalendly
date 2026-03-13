import { and, eq, gt, lt } from 'drizzle-orm';
import { DateTime } from 'luxon';

import {
  availabilityQuerySchema,
} from '@opencalendly/shared';
import { availabilityOverrides, availabilityRules, bookings } from '@opencalendly/db';

import { computeAvailabilitySlots } from '../lib/availability';
import {
  buildBookingCapUsage,
  filterSlotsByBookingCaps,
  hasBookingCaps,
  resolveBookingCapUsageRange,
} from '../lib/booking-caps';
import { computeTeamAvailabilitySlots } from '../lib/team-scheduling';
import { withDatabase } from '../server/database';
import { jsonError, normalizeTimezone } from '../server/core';
import { resolveAuthenticatedUser } from '../server/auth-session';
import {
  requiresLaunchDemoAuthForTeamRoute,
  requiresLaunchDemoAuthForUserRoute,
} from '../server/demo-quota';
import { findPublicEventType } from '../server/public-events';
import {
  findTeamEventTypeContext,
  listConfirmedBookingStartsForEventType,
  toEventTypeBookingCaps,
} from '../server/team-context';
import {
  listExternalBusyWindowsForUser,
  listTeamMemberSchedules,
  listTimeOffBlocksForUser,
} from '../server/team-schedules';
import { isPublicBookingRateLimited, resolveRateLimitClientKey } from '../server/rate-limit';
import { PUBLIC_BOOKING_RATE_LIMIT_MAX_AVAILABILITY_REQUESTS_PER_SCOPE } from '../server/env';
import type { ApiApp } from '../server/types';

export const registerPublicAvailabilityRoutes = (app: ApiApp): void => {
  app.get('/v0/users/:username/event-types/:slug/availability', async (context) => {
    const username = context.req.param('username');
    const slug = context.req.param('slug');

    return withDatabase(context, async (db) => {
      if (requiresLaunchDemoAuthForUserRoute(username)) {
        const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
        if (!authedUser) {
          return jsonError(context, 401, 'Sign in to access the launch demo.');
        }
      }

      const clientKey = resolveRateLimitClientKey(context.req.raw);
      if (
        await isPublicBookingRateLimited(db, {
          clientKey,
          scope: `availability|${username}|${slug}`,
          perScopeLimit: PUBLIC_BOOKING_RATE_LIMIT_MAX_AVAILABILITY_REQUESTS_PER_SCOPE,
        })
      ) {
        return jsonError(context, 429, 'Rate limit exceeded. Try again in a minute.');
      }

      const eventType = await findPublicEventType(db, username, slug);
      if (!eventType) {
        return jsonError(context, 404, 'Event type not found.');
      }

      const query = availabilityQuerySchema.safeParse({
        timezone: context.req.query('timezone') ?? undefined,
        start: context.req.query('start') ?? undefined,
        days: context.req.query('days') ?? undefined,
      });
      if (!query.success) {
        return jsonError(context, 400, query.error.issues[0]?.message ?? 'Invalid query params.');
      }

      const startIso = query.data.start ?? DateTime.utc().toISO();
      if (!startIso) {
        return jsonError(context, 400, 'Invalid range start.');
      }
      const rangeStart = DateTime.fromISO(startIso, { zone: 'utc' });
      if (!rangeStart.isValid) {
        return jsonError(context, 400, 'Invalid range start.');
      }

      const days = query.data.days ?? 7;
      const rangeEnd = rangeStart.plus({ days });
      const bookingCaps = toEventTypeBookingCaps(eventType);
      const capUsageRange = resolveBookingCapUsageRange({
        rangeStartIso: startIso,
        days,
        timezone: eventType.organizerTimezone,
        caps: bookingCaps,
      });

      const [rules, overrides, userTimeOffBlocks, externalBusyWindows, existingBookings, eventTypeBookingsForCapUsage] =
        await Promise.all([
          db
            .select({
              dayOfWeek: availabilityRules.dayOfWeek,
              startMinute: availabilityRules.startMinute,
              endMinute: availabilityRules.endMinute,
              bufferBeforeMinutes: availabilityRules.bufferBeforeMinutes,
              bufferAfterMinutes: availabilityRules.bufferAfterMinutes,
            })
            .from(availabilityRules)
            .where(eq(availabilityRules.userId, eventType.userId)),
          db
            .select({
              startAt: availabilityOverrides.startAt,
              endAt: availabilityOverrides.endAt,
              isAvailable: availabilityOverrides.isAvailable,
            })
            .from(availabilityOverrides)
            .where(
              and(
                eq(availabilityOverrides.userId, eventType.userId),
                lt(availabilityOverrides.startAt, rangeEnd.toJSDate()),
                gt(availabilityOverrides.endAt, rangeStart.toJSDate()),
              ),
            ),
          listTimeOffBlocksForUser(db, eventType.userId, rangeStart.toJSDate(), rangeEnd.toJSDate()),
          listExternalBusyWindowsForUser(db, eventType.userId, rangeStart.toJSDate(), rangeEnd.toJSDate()),
          db
            .select({
              startsAt: bookings.startsAt,
              endsAt: bookings.endsAt,
              status: bookings.status,
              metadata: bookings.metadata,
            })
            .from(bookings)
            .where(
              and(
                eq(bookings.organizerId, eventType.userId),
                eq(bookings.status, 'confirmed'),
                lt(bookings.startsAt, rangeEnd.toJSDate()),
                gt(bookings.endsAt, rangeStart.toJSDate()),
              ),
            ),
          capUsageRange
            ? listConfirmedBookingStartsForEventType(db, {
                eventTypeId: eventType.id,
                startsAt: capUsageRange.startsAt,
                endsAt: capUsageRange.endsAt,
              })
            : Promise.resolve([]),
        ]);

      const slots = computeAvailabilitySlots({
        organizerTimezone: eventType.organizerTimezone,
        rangeStartIso: startIso,
        days,
        durationMinutes: eventType.durationMinutes,
        rules,
        overrides: [
          ...overrides,
          ...userTimeOffBlocks.map((block) => ({
            startAt: block.startAt,
            endAt: block.endAt,
            isAvailable: false,
          })),
          ...externalBusyWindows.map((window) => ({
            startAt: window.startsAt,
            endAt: window.endsAt,
            isAvailable: false,
          })),
        ],
        bookings: existingBookings,
      });

      const slotsWithBookingCaps = hasBookingCaps(bookingCaps)
        ? filterSlotsByBookingCaps({
            slots,
            timezone: eventType.organizerTimezone,
            caps: bookingCaps,
            usage: buildBookingCapUsage(eventTypeBookingsForCapUsage, eventType.organizerTimezone),
          })
        : slots;

      return context.json({
        ok: true,
        timezone: normalizeTimezone(query.data.timezone),
        slots: slotsWithBookingCaps.map((slot) => ({ startsAt: slot.startsAt, endsAt: slot.endsAt })),
      });
    });
  });

  app.get('/v0/teams/:teamSlug/event-types/:eventSlug/availability', async (context) => {
    const teamSlug = context.req.param('teamSlug');
    const eventSlug = context.req.param('eventSlug');

    return withDatabase(context, async (db) => {
      if (requiresLaunchDemoAuthForTeamRoute(teamSlug)) {
        const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
        if (!authedUser) {
          return jsonError(context, 401, 'Sign in to access the launch demo.');
        }
      }

      const clientKey = resolveRateLimitClientKey(context.req.raw);
      if (
        await isPublicBookingRateLimited(db, {
          clientKey,
          scope: `team-availability|${teamSlug}|${eventSlug}`,
          perScopeLimit: PUBLIC_BOOKING_RATE_LIMIT_MAX_AVAILABILITY_REQUESTS_PER_SCOPE,
        })
      ) {
        return jsonError(context, 429, 'Rate limit exceeded. Try again in a minute.');
      }

      const teamEventContext = await findTeamEventTypeContext(db, teamSlug, eventSlug);
      if (!teamEventContext) {
        return jsonError(context, 404, 'Team event type not found.');
      }

      const query = availabilityQuerySchema.safeParse({
        timezone: context.req.query('timezone') ?? undefined,
        start: context.req.query('start') ?? undefined,
        days: context.req.query('days') ?? undefined,
      });
      if (!query.success) {
        return jsonError(context, 400, query.error.issues[0]?.message ?? 'Invalid query params.');
      }

      const startIso = query.data.start ?? DateTime.utc().toISO();
      if (!startIso) {
        return jsonError(context, 400, 'Invalid range start.');
      }
      const rangeStart = DateTime.fromISO(startIso, { zone: 'utc' });
      if (!rangeStart.isValid) {
        return jsonError(context, 400, 'Invalid range start.');
      }

      const days = query.data.days ?? 7;
      const rangeEnd = rangeStart.plus({ days });
      const organizerTimezone = teamEventContext.eventType.organizerTimezone ?? 'UTC';
      const bookingCaps = toEventTypeBookingCaps(teamEventContext.eventType);
      const capUsageRange = resolveBookingCapUsageRange({
        rangeStartIso: startIso,
        days,
        timezone: organizerTimezone,
        caps: bookingCaps,
      });
      const memberSchedules = await listTeamMemberSchedules(
        db,
        teamEventContext.members.map((member) => member.userId),
        rangeStart.toJSDate(),
        rangeEnd.toJSDate(),
      );

      const availability = computeTeamAvailabilitySlots({
        mode: teamEventContext.mode,
        members: memberSchedules,
        rangeStartIso: startIso,
        days,
        durationMinutes: teamEventContext.eventType.durationMinutes,
        roundRobinCursor: teamEventContext.roundRobinCursor,
      });

      const eventTypeBookingsForCapUsage = capUsageRange
        ? await listConfirmedBookingStartsForEventType(db, {
            eventTypeId: teamEventContext.eventType.id,
            startsAt: capUsageRange.startsAt,
            endsAt: capUsageRange.endsAt,
          })
        : [];
      const slotsWithBookingCaps = hasBookingCaps(bookingCaps)
        ? filterSlotsByBookingCaps({
            slots: availability.slots,
            timezone: organizerTimezone,
            caps: bookingCaps,
            usage: buildBookingCapUsage(eventTypeBookingsForCapUsage, organizerTimezone),
          })
        : availability.slots;

      return context.json({
        ok: true,
        mode: teamEventContext.mode,
        timezone: normalizeTimezone(query.data.timezone),
        slots: slotsWithBookingCaps.map((slot) => ({
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          assignmentUserIds: slot.assignmentUserIds,
        })),
      });
    });
  });
};
