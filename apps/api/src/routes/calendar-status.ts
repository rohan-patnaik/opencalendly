import { and, asc, desc, eq } from 'drizzle-orm';

import { bookingExternalEvents, calendarConnections } from '@opencalendly/db';

import { resolveAuthenticatedUser } from '../server/auth-session';
import { jsonError } from '../server/core';
import { withDatabase } from '../server/database';
import {
  GOOGLE_CALENDAR_PROVIDER,
  MICROSOFT_CALENDAR_PROVIDER,
  toCalendarConnectionStatus,
  toCalendarProvider,
} from '../server/env';
import type { ApiApp, CalendarConnectionStatus, CalendarProvider } from '../server/types';

export const registerCalendarStatusRoutes = (app: ApiApp): void => {
  app.get('/v0/calendar/sync/status', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const rows = await db
        .select({
          provider: calendarConnections.provider,
          externalEmail: calendarConnections.externalEmail,
          lastSyncedAt: calendarConnections.lastSyncedAt,
          nextSyncAt: calendarConnections.nextSyncAt,
          lastError: calendarConnections.lastError,
        })
        .from(calendarConnections)
        .where(eq(calendarConnections.userId, authedUser.id))
        .orderBy(asc(calendarConnections.createdAt));

      const statuses = rows
        .map((row) => {
          const provider = toCalendarProvider(row.provider);
          return provider
            ? toCalendarConnectionStatus({
                provider,
                externalEmail: row.externalEmail,
                lastSyncedAt: row.lastSyncedAt,
                nextSyncAt: row.nextSyncAt,
                lastError: row.lastError,
              })
            : null;
        })
        .filter((status): status is CalendarConnectionStatus => status !== null);

      const requiredProviders: CalendarProvider[] = [GOOGLE_CALENDAR_PROVIDER, MICROSOFT_CALENDAR_PROVIDER];
      for (const provider of requiredProviders) {
        if (!statuses.some((status) => status.provider === provider)) {
          statuses.push({
            provider,
            connected: false,
            externalEmail: null,
            lastSyncedAt: null,
            nextSyncAt: null,
            lastError: null,
          });
        }
      }

      return context.json({ ok: true, providers: statuses });
    });
  });

  app.get('/v0/calendar/writeback/status', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const rows = await db
        .select({ status: bookingExternalEvents.status })
        .from(bookingExternalEvents)
        .where(eq(bookingExternalEvents.organizerId, authedUser.id));

      const summary = rows.reduce(
        (acc, row) => {
          if (row.status === 'succeeded') {
            acc.succeeded += 1;
          } else if (row.status === 'failed') {
            acc.failed += 1;
          } else {
            acc.pending += 1;
          }
          return acc;
        },
        { pending: 0, succeeded: 0, failed: 0 },
      );

      const failures = await db
        .select({
          id: bookingExternalEvents.id,
          bookingId: bookingExternalEvents.bookingId,
          provider: bookingExternalEvents.provider,
          operation: bookingExternalEvents.operation,
          attemptCount: bookingExternalEvents.attemptCount,
          maxAttempts: bookingExternalEvents.maxAttempts,
          nextAttemptAt: bookingExternalEvents.nextAttemptAt,
          lastAttemptAt: bookingExternalEvents.lastAttemptAt,
          lastError: bookingExternalEvents.lastError,
          updatedAt: bookingExternalEvents.updatedAt,
        })
        .from(bookingExternalEvents)
        .where(
          and(
            eq(bookingExternalEvents.organizerId, authedUser.id),
            eq(bookingExternalEvents.status, 'failed'),
          ),
        )
        .orderBy(desc(bookingExternalEvents.updatedAt))
        .limit(20);

      return context.json({
        ok: true,
        summary,
        failures: failures.map((failure) => ({
          ...failure,
          nextAttemptAt: failure.nextAttemptAt.toISOString(),
          lastAttemptAt: failure.lastAttemptAt ? failure.lastAttemptAt.toISOString() : null,
          updatedAt: failure.updatedAt.toISOString(),
        })),
      });
    });
  });
};
