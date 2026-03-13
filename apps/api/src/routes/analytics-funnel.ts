import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import { analyticsFunnelEvents, bookings, eventTypes } from '@opencalendly/db';
import {
  analyticsRangeQuerySchema,
  analyticsTrackFunnelEventSchema,
} from '@opencalendly/shared';

import { resolveAnalyticsRange, summarizeFunnelAnalytics } from '../lib/analytics';
import { recordAnalyticsFunnelEvent } from '../server/telemetry';
import { findPublicEventType } from '../server/public-events';
import { resolveAuthenticatedUser } from '../server/auth-session';
import { jsonError } from '../server/core';
import { withDatabase } from '../server/database';
import {
  isPublicAnalyticsRateLimited,
  resolveRateLimitClientKey,
} from '../server/rate-limit';
import type { ApiApp } from '../server/types';

export const registerAnalyticsFunnelRoutes = (app: ApiApp): void => {
  app.get('/v0/analytics/funnel', async (context) => {
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

      const funnelWhere = [
        eq(analyticsFunnelEvents.organizerId, authedUser.id),
        gte(analyticsFunnelEvents.occurredAt, range.start),
        lt(analyticsFunnelEvents.occurredAt, range.endExclusive),
      ];
      if (parsed.data.eventTypeId) {
        funnelWhere.push(eq(analyticsFunnelEvents.eventTypeId, parsed.data.eventTypeId));
      }

      const bookingWhere = [
        eq(bookings.organizerId, authedUser.id),
        gte(bookings.createdAt, range.start),
        lt(bookings.createdAt, range.endExclusive),
        inArray(bookings.status, ['confirmed', 'canceled']),
      ];
      if (parsed.data.eventTypeId) {
        bookingWhere.push(eq(bookings.eventTypeId, parsed.data.eventTypeId));
      }

      const funnelDateBucket = sql<string>`to_char(timezone('utc', ${analyticsFunnelEvents.occurredAt}), 'YYYY-MM-DD')`;
      const bookingDateBucket = sql<string>`to_char(timezone('utc', ${bookings.createdAt}), 'YYYY-MM-DD')`;
      const bookingStatusBucket = sql<string>`case
        when ${bookings.rescheduledFromBookingId} is not null then 'rescheduled'
        else ${bookings.status}
      end`;

      const [funnelRows, bookingRows] = await Promise.all([
        db
          .select({
            stage: analyticsFunnelEvents.stage,
            eventTypeId: analyticsFunnelEvents.eventTypeId,
            date: funnelDateBucket.as('date'),
            count: sql<number>`count(*)::int`.as('count'),
          })
          .from(analyticsFunnelEvents)
          .where(and(...funnelWhere))
          .groupBy(analyticsFunnelEvents.stage, analyticsFunnelEvents.eventTypeId, funnelDateBucket),
        db
          .select({
            eventTypeId: bookings.eventTypeId,
            status: bookingStatusBucket.as('status'),
            date: bookingDateBucket.as('date'),
            count: sql<number>`count(*)::int`.as('count'),
          })
          .from(bookings)
          .where(and(...bookingWhere))
          .groupBy(bookings.eventTypeId, bookingStatusBucket, bookingDateBucket),
      ]);

      const eventTypeIds = Array.from(
        new Set([
          ...funnelRows.map((row) => row.eventTypeId),
          ...bookingRows.map((row) => row.eventTypeId),
        ]),
      );
      const eventTypeNameById = new Map<string, string>();
      if (eventTypeIds.length > 0) {
        const eventRows = await db
          .select({ id: eventTypes.id, name: eventTypes.name })
          .from(eventTypes)
          .where(inArray(eventTypes.id, eventTypeIds));
        for (const row of eventRows) {
          eventTypeNameById.set(row.id, row.name);
        }
      }

      const metrics = summarizeFunnelAnalytics({
        funnelRows,
        bookingRows,
        eventTypeNameById,
      });

      return context.json({
        ok: true,
        range: { startDate: range.startDate, endDate: range.endDate },
        summary: metrics.summary,
        byEventType: metrics.byEventType,
        daily: metrics.daily,
      });
    });
  });

  app.post('/v0/analytics/funnel/events', async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = analyticsTrackFunnelEventSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    return withDatabase(context, async (db) => {
      const clientKey = resolveRateLimitClientKey(context.req.raw);
      if (
        await isPublicAnalyticsRateLimited(db, {
          clientKey,
          username: parsed.data.username,
          eventSlug: parsed.data.eventSlug,
        })
      ) {
        return jsonError(context, 429, 'Rate limit exceeded. Try again in a minute.');
      }

      const eventType = await findPublicEventType(db, parsed.data.username, parsed.data.eventSlug);
      if (!eventType) {
        return jsonError(context, 404, 'Event type not found.');
      }

      await recordAnalyticsFunnelEvent(db, {
        organizerId: eventType.userId,
        eventTypeId: eventType.id,
        stage: parsed.data.stage,
        metadata: { source: 'public_booking_page' },
      }).catch((error) => {
        console.warn('analytics_funnel_event_write_failed', {
          eventTypeId: eventType.id,
          stage: parsed.data.stage,
          error: error instanceof Error ? error.message : 'unknown',
        });
      });

      return context.json({ ok: true });
    });
  });
};
