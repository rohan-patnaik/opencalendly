import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';

import {
  bookingExternalEvents,
  calendarBusyWindows,
  calendarConnections,
} from '@opencalendly/db';
import { calendarSyncRequestSchema } from '@opencalendly/shared';

import { encryptSecret } from '../lib/calendar-crypto';
import {
  resolveGoogleAccessToken,
  resolveGoogleSyncRange,
  syncGoogleBusyWindows,
} from '../lib/calendar-sync';
import { resolveAuthenticatedUser } from '../server/auth-session';
import { jsonError, logInternalError } from '../server/core';
import { withDatabase } from '../server/database';
import { assertDemoFeatureAvailable, consumeDemoFeatureCredits, jsonDemoQuotaError } from '../server/demo-quota';
import {
  CALENDAR_SYNC_NEXT_MINUTES,
  GOOGLE_CALENDAR_PROVIDER,
  resolveCalendarEncryptionSecret,
  resolveGoogleOAuthConfig,
} from '../server/env';
import { buildDemoFeatureSourceKey } from '../server/idempotency';
import type { ApiApp, DemoQuotaDb } from '../server/types';
import { DemoQuotaAdmissionError, DemoQuotaCreditsError } from '../server/types';

export const registerGoogleCalendarSyncRoutes = (app: ApiApp): void => {
  app.post('/v0/calendar/google/disconnect', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const disconnected = await db.transaction(async (transaction) => {
        const rows = await transaction
          .select({ id: calendarConnections.id })
          .from(calendarConnections)
          .where(
            and(
              eq(calendarConnections.userId, authedUser.id),
              eq(calendarConnections.provider, GOOGLE_CALENDAR_PROVIDER),
            ),
          );
        if (rows.length === 0) {
          return false;
        }

        const connectionIds = rows.map((row) => row.id);
        await transaction.delete(calendarBusyWindows).where(inArray(calendarBusyWindows.connectionId, connectionIds));
        await transaction
          .update(bookingExternalEvents)
          .set({ connectionId: null, updatedAt: new Date() })
          .where(inArray(bookingExternalEvents.connectionId, connectionIds));
        await transaction.delete(calendarConnections).where(inArray(calendarConnections.id, connectionIds));
        return true;
      });

      return context.json({ ok: true, provider: GOOGLE_CALENDAR_PROVIDER, disconnected });
    });
  });

  app.post('/v0/calendar/google/sync', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      let body: unknown = {};
      const rawBody = await context.req.text();
      if (rawBody.trim().length > 0) {
        try {
          body = JSON.parse(rawBody) as unknown;
        } catch {
          return jsonError(context, 400, 'Malformed JSON body.');
        }
      }

      const parsed = calendarSyncRequestSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      const googleConfig = resolveGoogleOAuthConfig(context.env);
      const encryptionSecret = resolveCalendarEncryptionSecret(context.env);
      if (!googleConfig || !encryptionSecret) {
        return jsonError(
          context,
          500,
          'Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and SESSION_SECRET.',
        );
      }

      const [connection] = await db
        .select({
          id: calendarConnections.id,
          accessTokenEncrypted: calendarConnections.accessTokenEncrypted,
          refreshTokenEncrypted: calendarConnections.refreshTokenEncrypted,
          accessTokenExpiresAt: calendarConnections.accessTokenExpiresAt,
        })
        .from(calendarConnections)
        .where(
          and(
            eq(calendarConnections.userId, authedUser.id),
            eq(calendarConnections.provider, GOOGLE_CALENDAR_PROVIDER),
          ),
        )
        .limit(1);
      if (!connection) {
        return jsonError(context, 404, 'Google calendar is not connected.');
      }

      const now = new Date();
      let range: { startIso: string; endIso: string };
      try {
        range = resolveGoogleSyncRange(now, parsed.data.start, parsed.data.end);
      } catch (error) {
        return jsonError(context, 400, error instanceof Error ? error.message : 'Sync range is invalid.');
      }

      try {
        await assertDemoFeatureAvailable(db, context.env, authedUser, 'calendar_sync', now);
      } catch (error) {
        if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
          return jsonDemoQuotaError(context, db, context.env, authedUser, error);
        }
        throw error;
      }

      try {
        const token = await resolveGoogleAccessToken({
          connection,
          encryptionSecret,
          clientId: googleConfig.clientId,
          clientSecret: googleConfig.clientSecret,
          now,
        });

        const busyWindows = await syncGoogleBusyWindows({
          accessToken: token.accessToken,
          startIso: range.startIso,
          endIso: range.endIso,
        });
        const nextSyncAt = new Date(now.getTime() + CALENDAR_SYNC_NEXT_MINUTES * 60_000);
        const dedupedBusyWindows = Array.from(
          busyWindows.reduce((map, window) => {
            map.set(`${window.startsAt.toISOString()}|${window.endsAt.toISOString()}`, window);
            return map;
          }, new Map<string, { startsAt: Date; endsAt: Date }>()).values(),
        );

        await db.transaction(async (transaction) => {
          await transaction.execute(sql`select id from users where id = ${authedUser.id} for update`);
          await transaction
            .delete(calendarBusyWindows)
            .where(
              and(
                eq(calendarBusyWindows.connectionId, connection.id),
                lt(calendarBusyWindows.startsAt, new Date(range.endIso)),
                gt(calendarBusyWindows.endsAt, new Date(range.startIso)),
              ),
            );

          if (dedupedBusyWindows.length > 0) {
            await transaction.insert(calendarBusyWindows).values(
              dedupedBusyWindows.map((window) => ({
                connectionId: connection.id,
                userId: authedUser.id,
                provider: GOOGLE_CALENDAR_PROVIDER,
                startsAt: window.startsAt,
                endsAt: window.endsAt,
              })),
            );
          }

          await transaction
            .update(calendarConnections)
            .set({
              accessTokenEncrypted: encryptSecret(token.accessToken, encryptionSecret),
              refreshTokenEncrypted: encryptSecret(token.refreshToken, encryptionSecret),
              accessTokenExpiresAt: token.accessTokenExpiresAt,
              lastSyncedAt: now,
              nextSyncAt,
              lastError: null,
              updatedAt: now,
            })
            .where(eq(calendarConnections.id, connection.id));

          await consumeDemoFeatureCredits(transaction as DemoQuotaDb, context.env, authedUser, {
            featureKey: 'calendar_sync',
            sourceKey: buildDemoFeatureSourceKey('calendar_sync', {
              provider: GOOGLE_CALENDAR_PROVIDER,
              startIso: range.startIso,
              endIso: range.endIso,
            }),
            metadata: { provider: GOOGLE_CALENDAR_PROVIDER, busyWindowCount: dedupedBusyWindows.length },
            now,
          });
        });

        return context.json({
          ok: true,
          provider: GOOGLE_CALENDAR_PROVIDER,
          syncWindow: range,
          busyWindowCount: dedupedBusyWindows.length,
          refreshedAccessToken: token.refreshed,
          lastSyncedAt: now.toISOString(),
          nextSyncAt: nextSyncAt.toISOString(),
        });
      } catch (error) {
        if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
          return jsonDemoQuotaError(context, db, context.env, authedUser, error);
        }
        logInternalError('google_calendar_sync_failed', error);
        const message = 'Google calendar sync failed.';
        const nextSyncAt = new Date(now.getTime() + CALENDAR_SYNC_NEXT_MINUTES * 60_000);
        await db
          .update(calendarConnections)
          .set({ lastError: message, nextSyncAt, updatedAt: now })
          .where(eq(calendarConnections.id, connection.id));
        return jsonError(context, 502, message);
      }
    });
  });
};
