import { and, eq, gt, lt, sql } from 'drizzle-orm';

import { bookingExternalEvents, calendarBusyWindows, calendarConnections } from '@opencalendly/db';
import {
  calendarConnectionPreferencesUpdateSchema,
  calendarSyncRequestSchema,
} from '@opencalendly/shared';

import { encryptSecret } from '../lib/calendar-crypto';
import {
  resolveGoogleAccessToken,
  resolveGoogleSyncRange,
  resolveMicrosoftAccessToken,
  resolveMicrosoftSyncRange,
  syncGoogleBusyWindows,
  syncMicrosoftBusyWindows,
} from '../lib/calendar-sync';
import { resolveAuthenticatedUser } from '../server/auth-session';
import { emitAuditEvent } from '../server/audit';
import { jsonError, logInternalError } from '../server/core';
import { withDatabase } from '../server/database';
import {
  CALENDAR_SYNC_NEXT_MINUTES,
  GOOGLE_CALENDAR_PROVIDER,
  MICROSOFT_CALENDAR_PROVIDER,
  resolveCalendarEncryptionSecret,
  resolveGoogleOAuthConfig,
  resolveMicrosoftOAuthConfig,
  toCalendarConnectionStatus,
  toCalendarProvider,
} from '../server/env';
import type { ApiApp } from '../server/types';

const dedupeBusyWindows = (busyWindows: Array<{ startsAt: Date; endsAt: Date }>) => {
  return Array.from(
    busyWindows.reduce((map, window) => {
      map.set(`${window.startsAt.toISOString()}|${window.endsAt.toISOString()}`, window);
      return map;
    }, new Map<string, { startsAt: Date; endsAt: Date }>()).values(),
  );
};

export const registerCalendarConnectionRoutes = (app: ApiApp): void => {
  app.post('/v0/calendar/connections/:connectionId/disconnect', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const connectionId = context.req.param('connectionId');
      const [connection] = await db
        .select({
          id: calendarConnections.id,
          provider: calendarConnections.provider,
          userId: calendarConnections.userId,
          useForWriteback: calendarConnections.useForWriteback,
        })
        .from(calendarConnections)
        .where(
          and(
            eq(calendarConnections.id, connectionId),
            eq(calendarConnections.userId, authedUser.id),
          ),
        )
        .limit(1);

      if (!connection) {
        return jsonError(context, 404, 'Calendar connection not found.');
      }

      await db.transaction(async (transaction) => {
        await transaction.delete(calendarBusyWindows).where(eq(calendarBusyWindows.connectionId, connection.id));
        await transaction
          .update(bookingExternalEvents)
          .set({ connectionId: null, updatedAt: new Date() })
          .where(eq(bookingExternalEvents.connectionId, connection.id));
        await transaction.delete(calendarConnections).where(eq(calendarConnections.id, connection.id));

        if (connection.useForWriteback) {
          const [fallbackWriteback] = await transaction
            .select({ id: calendarConnections.id })
            .from(calendarConnections)
            .where(eq(calendarConnections.userId, authedUser.id))
            .limit(1);

          if (fallbackWriteback) {
            await transaction
              .update(calendarConnections)
              .set({ useForWriteback: true })
              .where(eq(calendarConnections.id, fallbackWriteback.id));
          }
        }
      });

      const auditProvider = toCalendarProvider(connection.provider);
      emitAuditEvent({
        event: 'calendar_disconnect_completed',
        level: 'info',
        actorUserId: authedUser.id,
        ...(auditProvider ? { provider: auditProvider } : {}),
        connectionId: connection.id,
        route: '/v0/calendar/connections/:connectionId/disconnect',
        statusCode: 200,
        disconnected: true,
      });

      return context.json({ ok: true, disconnected: true, connectionId });
    });
  });

  app.patch('/v0/calendar/connections/:connectionId/preferences', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const connectionId = context.req.param('connectionId');
      const body = await context.req.json().catch(() => null);
      const parsed = calendarConnectionPreferencesUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      const [existingConnection] = await db
        .select({
          id: calendarConnections.id,
          provider: calendarConnections.provider,
          userId: calendarConnections.userId,
          externalEmail: calendarConnections.externalEmail,
          useForConflictChecks: calendarConnections.useForConflictChecks,
          useForWriteback: calendarConnections.useForWriteback,
          lastSyncedAt: calendarConnections.lastSyncedAt,
          nextSyncAt: calendarConnections.nextSyncAt,
          lastError: calendarConnections.lastError,
        })
        .from(calendarConnections)
        .where(
          and(
            eq(calendarConnections.id, connectionId),
            eq(calendarConnections.userId, authedUser.id),
          ),
        )
        .limit(1);
      if (!existingConnection) {
        return jsonError(context, 404, 'Calendar connection not found.');
      }

      await db.transaction(async (transaction) => {
        if (parsed.data.useForWriteback === true) {
          await transaction
            .update(calendarConnections)
            .set({ useForWriteback: false })
            .where(eq(calendarConnections.userId, authedUser.id));
        }

        await transaction
          .update(calendarConnections)
          .set({
            ...(parsed.data.useForConflictChecks !== undefined
              ? { useForConflictChecks: parsed.data.useForConflictChecks }
              : {}),
            ...(parsed.data.useForWriteback !== undefined
              ? { useForWriteback: parsed.data.useForWriteback }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(calendarConnections.id, connectionId));
      });

      const [updatedConnection] = await db
        .select({
          id: calendarConnections.id,
          provider: calendarConnections.provider,
          externalEmail: calendarConnections.externalEmail,
          useForConflictChecks: calendarConnections.useForConflictChecks,
          useForWriteback: calendarConnections.useForWriteback,
          lastSyncedAt: calendarConnections.lastSyncedAt,
          nextSyncAt: calendarConnections.nextSyncAt,
          lastError: calendarConnections.lastError,
        })
        .from(calendarConnections)
        .where(eq(calendarConnections.id, connectionId))
        .limit(1);

      if (!updatedConnection) {
        return jsonError(context, 404, 'Calendar connection not found.');
      }

      return context.json({
        ok: true,
        connection: toCalendarConnectionStatus({
          id: updatedConnection.id,
          provider: toCalendarProvider(updatedConnection.provider) ?? GOOGLE_CALENDAR_PROVIDER,
          externalEmail: updatedConnection.externalEmail,
          useForConflictChecks: updatedConnection.useForConflictChecks,
          useForWriteback: updatedConnection.useForWriteback,
          lastSyncedAt: updatedConnection.lastSyncedAt,
          nextSyncAt: updatedConnection.nextSyncAt,
          lastError: updatedConnection.lastError,
        }),
      });
    });
  });

  app.post('/v0/calendar/connections/:connectionId/sync', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const body = await context.req.json().catch(() => ({}));
      const parsed = calendarSyncRequestSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      const connectionId = context.req.param('connectionId');
      const [connection] = await db
        .select({
          id: calendarConnections.id,
          provider: calendarConnections.provider,
          externalEmail: calendarConnections.externalEmail,
          accessTokenEncrypted: calendarConnections.accessTokenEncrypted,
          refreshTokenEncrypted: calendarConnections.refreshTokenEncrypted,
          accessTokenExpiresAt: calendarConnections.accessTokenExpiresAt,
          useForConflictChecks: calendarConnections.useForConflictChecks,
          useForWriteback: calendarConnections.useForWriteback,
        })
        .from(calendarConnections)
        .where(
          and(
            eq(calendarConnections.id, connectionId),
            eq(calendarConnections.userId, authedUser.id),
          ),
        )
        .limit(1);
      if (!connection) {
        return jsonError(context, 404, 'Calendar connection not found.');
      }

      const provider = toCalendarProvider(connection.provider);
      if (!provider) {
        return jsonError(context, 400, 'Unsupported calendar provider.');
      }

      const encryptionSecret = resolveCalendarEncryptionSecret(context.env);
      if (!encryptionSecret) {
        return jsonError(context, 500, 'Calendar encryption is not configured.');
      }
      const googleConfig = resolveGoogleOAuthConfig(context.env);
      const microsoftConfig = resolveMicrosoftOAuthConfig(context.env);
      if (provider === GOOGLE_CALENDAR_PROVIDER && !googleConfig) {
        return jsonError(context, 500, 'Google OAuth is not configured.');
      }
      if (provider === MICROSOFT_CALENDAR_PROVIDER && !microsoftConfig) {
        return jsonError(context, 500, 'Microsoft OAuth is not configured.');
      }

      const now = new Date();
      try {
        const range =
          provider === GOOGLE_CALENDAR_PROVIDER
            ? resolveGoogleSyncRange(now, parsed.data.start, parsed.data.end)
            : resolveMicrosoftSyncRange(now, parsed.data.start, parsed.data.end);
        const nextSyncAt = new Date(now.getTime() + CALENDAR_SYNC_NEXT_MINUTES * 60_000);

        const token =
          provider === GOOGLE_CALENDAR_PROVIDER
            ? await resolveGoogleAccessToken({
                connection,
                encryptionSecret,
                clientId: googleConfig!.clientId,
                clientSecret: googleConfig!.clientSecret,
                now,
              })
            : await resolveMicrosoftAccessToken({
                connection,
                encryptionSecret,
                clientId: microsoftConfig!.clientId,
                clientSecret: microsoftConfig!.clientSecret,
                now,
              });

        const busyWindows =
          provider === GOOGLE_CALENDAR_PROVIDER
            ? await syncGoogleBusyWindows({
                accessToken: token.accessToken,
                startIso: range.startIso,
                endIso: range.endIso,
              })
            : await syncMicrosoftBusyWindows({
                accessToken: token.accessToken,
                scheduleSmtp: connection.externalEmail ?? authedUser.email,
                startIso: range.startIso,
                endIso: range.endIso,
              });
        const dedupedBusyWindows = dedupeBusyWindows(busyWindows);

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
                provider,
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
        });

        const [updatedConnection] = await db
          .select({
            id: calendarConnections.id,
            provider: calendarConnections.provider,
            externalEmail: calendarConnections.externalEmail,
            useForConflictChecks: calendarConnections.useForConflictChecks,
            useForWriteback: calendarConnections.useForWriteback,
            lastSyncedAt: calendarConnections.lastSyncedAt,
            nextSyncAt: calendarConnections.nextSyncAt,
            lastError: calendarConnections.lastError,
          })
          .from(calendarConnections)
          .where(eq(calendarConnections.id, connection.id))
          .limit(1);

        return context.json({
          ok: true,
          provider,
          busyWindowCount: dedupedBusyWindows.length,
          connection: updatedConnection
            ? toCalendarConnectionStatus({
                id: updatedConnection.id,
                provider,
                externalEmail: updatedConnection.externalEmail,
                useForConflictChecks: updatedConnection.useForConflictChecks,
                useForWriteback: updatedConnection.useForWriteback,
                lastSyncedAt: updatedConnection.lastSyncedAt,
                nextSyncAt: updatedConnection.nextSyncAt,
                lastError: updatedConnection.lastError,
              })
            : null,
        });
      } catch (error) {
        logInternalError('calendar_connection_sync_failed', error);
        await db
          .update(calendarConnections)
          .set({
            lastError: `${provider === GOOGLE_CALENDAR_PROVIDER ? 'Google' : 'Microsoft'} calendar sync failed.`,
            nextSyncAt: new Date(now.getTime() + CALENDAR_SYNC_NEXT_MINUTES * 60_000),
            updatedAt: now,
          })
          .where(eq(calendarConnections.id, connection.id));
        return jsonError(context, 502, `${provider === GOOGLE_CALENDAR_PROVIDER ? 'Google' : 'Microsoft'} calendar sync failed.`);
      }
    });
  });
};
