import { and, eq, gte, lt, sql } from 'drizzle-orm';

import {
  bookingExternalEvents,
  calendarConnections,
  emailDeliveries,
  webhookDeliveries,
  webhookSubscriptions,
} from '@opencalendly/db';
import { analyticsRangeQuerySchema } from '@opencalendly/shared';

import { resolveAnalyticsRange, summarizeOperatorHealth } from '../lib/analytics';
import { resolveAuthenticatedUser } from '../server/auth-session';
import { jsonError } from '../server/core';
import { withDatabase } from '../server/database';
import { GOOGLE_CALENDAR_PROVIDER, MICROSOFT_CALENDAR_PROVIDER } from '../server/env';
import type { ApiApp } from '../server/types';

export const registerAnalyticsOperatorRoutes = (app: ApiApp): void => {
  app.get('/v0/analytics/operator/health', async (context) => {
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

      const [webhookRows, emailRows, webhookQueueRows, writebackRows, calendarRows] = await Promise.all([
        db
          .select({
            status: webhookDeliveries.status,
            count: sql<number>`count(*)::int`.as('count'),
          })
          .from(webhookDeliveries)
          .innerJoin(webhookSubscriptions, eq(webhookSubscriptions.id, webhookDeliveries.subscriptionId))
          .where(
            and(
              eq(webhookSubscriptions.userId, authedUser.id),
              gte(webhookDeliveries.createdAt, range.start),
              lt(webhookDeliveries.createdAt, range.endExclusive),
            ),
          )
          .groupBy(webhookDeliveries.status),
        db
          .select({
            status: emailDeliveries.status,
            emailType: emailDeliveries.emailType,
            count: sql<number>`count(*)::int`.as('count'),
          })
          .from(emailDeliveries)
          .where(
            and(
              eq(emailDeliveries.organizerId, authedUser.id),
              gte(emailDeliveries.createdAt, range.start),
              lt(emailDeliveries.createdAt, range.endExclusive),
            ),
          )
          .groupBy(emailDeliveries.status, emailDeliveries.emailType),
        db
          .select({
            status: webhookDeliveries.status,
            count: sql<number>`count(*)::int`.as('count'),
          })
          .from(webhookDeliveries)
          .innerJoin(webhookSubscriptions, eq(webhookSubscriptions.id, webhookDeliveries.subscriptionId))
          .where(eq(webhookSubscriptions.userId, authedUser.id))
          .groupBy(webhookDeliveries.status),
        db
          .select({
            status: bookingExternalEvents.status,
            count: sql<number>`count(*)::int`.as('count'),
          })
          .from(bookingExternalEvents)
          .where(eq(bookingExternalEvents.organizerId, authedUser.id))
          .groupBy(bookingExternalEvents.status),
        db
          .select({
            provider: calendarConnections.provider,
            externalEmail: calendarConnections.externalEmail,
            lastSyncedAt: calendarConnections.lastSyncedAt,
            nextSyncAt: calendarConnections.nextSyncAt,
            lastError: calendarConnections.lastError,
            createdAt: calendarConnections.createdAt,
          })
          .from(calendarConnections)
          .where(eq(calendarConnections.userId, authedUser.id)),
      ]);

      const requiredProviders = new Set([GOOGLE_CALENDAR_PROVIDER, MICROSOFT_CALENDAR_PROVIDER]);
      for (const row of calendarRows) {
        requiredProviders.delete(row.provider as 'google' | 'microsoft');
      }

      const metrics = summarizeOperatorHealth({
        webhookRows,
        emailRows,
        webhookQueueRows,
        writebackRows,
        calendarRows: [
          ...calendarRows,
          ...Array.from(requiredProviders).map((provider) => ({
            provider,
            externalEmail: null,
            lastSyncedAt: null,
            nextSyncAt: null,
            lastError: null,
            createdAt: null,
          })),
        ],
      });

      return context.json({
        ok: true,
        status: metrics.status,
        alerts: metrics.alerts,
        range: { startDate: range.startDate, endDate: range.endDate },
        webhookDeliveries: metrics.webhookDeliveries,
        webhookQueue: metrics.webhookQueue,
        calendarWriteback: metrics.calendarWriteback,
        calendarProviders: metrics.calendarProviders,
        emailDeliveries: metrics.emailDeliveries,
      });
    });
  });
};
