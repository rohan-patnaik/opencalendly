import { and, eq } from 'drizzle-orm';

import { calendarConnections } from '@opencalendly/db';
import {
  calendarConnectCompleteSchema,
  calendarConnectStartSchema,
} from '@opencalendly/shared';

import { createCalendarOAuthState, verifyCalendarOAuthState } from '../lib/calendar-oauth-state';
import { encryptSecret } from '../lib/calendar-crypto';
import {
  buildMicrosoftAuthorizationUrl,
  exchangeMicrosoftOAuthCode,
  fetchMicrosoftUserProfile,
} from '../lib/microsoft-calendar';
import { resolveAuthenticatedUser } from '../server/auth-session';
import { emitAuditEvent, sanitizeErrorForAudit } from '../server/audit';
import { jsonError, logInternalError } from '../server/core';
import { withDatabase } from '../server/database';
import { assertDemoFeatureAvailable, consumeDemoFeatureCredits, jsonDemoQuotaError } from '../server/demo-quota';
import {
  CALENDAR_OAUTH_STATE_TTL_MINUTES,
  MICROSOFT_CALENDAR_PROVIDER,
  resolveCalendarEncryptionSecret,
  resolveMicrosoftOAuthConfig,
  toCalendarConnectionStatus,
} from '../server/env';
import { buildDemoFeatureSourceKey } from '../server/idempotency';
import type { ApiApp, DemoQuotaDb } from '../server/types';
import { DemoQuotaAdmissionError, DemoQuotaCreditsError } from '../server/types';

export const registerMicrosoftCalendarConnectRoutes = (app: ApiApp): void => {
  app.post('/v0/calendar/microsoft/connect/start', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const body = await context.req.json().catch(() => null);
      const parsed = calendarConnectStartSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      const microsoftConfig = resolveMicrosoftOAuthConfig(context.env);
      const encryptionSecret = resolveCalendarEncryptionSecret(context.env);
      if (!microsoftConfig || !encryptionSecret) {
        return jsonError(
          context,
          500,
          'Microsoft OAuth is not configured. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and SESSION_SECRET.',
        );
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + CALENDAR_OAUTH_STATE_TTL_MINUTES * 60_000);
      const state = createCalendarOAuthState({
        userId: authedUser.id,
        provider: MICROSOFT_CALENDAR_PROVIDER,
        redirectUri: parsed.data.redirectUri,
        expiresAt,
        secret: encryptionSecret,
      });

      return context.json({
        ok: true,
        provider: MICROSOFT_CALENDAR_PROVIDER,
        authUrl: buildMicrosoftAuthorizationUrl({
          clientId: microsoftConfig.clientId,
          redirectUri: parsed.data.redirectUri,
          state,
        }),
        state,
        expiresAt: expiresAt.toISOString(),
      });
    });
  });

  app.post('/v0/calendar/microsoft/connect/complete', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const body = await context.req.json().catch(() => null);
      const parsed = calendarConnectCompleteSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      const microsoftConfig = resolveMicrosoftOAuthConfig(context.env);
      const encryptionSecret = resolveCalendarEncryptionSecret(context.env);
      if (!microsoftConfig || !encryptionSecret) {
        return jsonError(
          context,
          500,
          'Microsoft OAuth is not configured. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and SESSION_SECRET.',
        );
      }

      const state = verifyCalendarOAuthState({
        token: parsed.data.state,
        secret: encryptionSecret,
        now: new Date(),
      });
      if (
        !state ||
        state.provider !== MICROSOFT_CALENDAR_PROVIDER ||
        state.userId !== authedUser.id ||
        state.redirectUri !== parsed.data.redirectUri
      ) {
        return jsonError(context, 400, 'OAuth state is invalid or expired.');
      }

      try {
        await assertDemoFeatureAvailable(db, context.env, authedUser, 'calendar_connect');
      } catch (error) {
        if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
          return jsonDemoQuotaError(context, db, context.env, authedUser, error);
        }
        throw error;
      }

      try {
        const tokenPayload = await exchangeMicrosoftOAuthCode({
          clientId: microsoftConfig.clientId,
          clientSecret: microsoftConfig.clientSecret,
          code: parsed.data.code,
          redirectUri: parsed.data.redirectUri,
        });
        const profile = await fetchMicrosoftUserProfile(tokenPayload.access_token);
        const [existingConnection] = await db
          .select({
            id: calendarConnections.id,
            refreshTokenEncrypted: calendarConnections.refreshTokenEncrypted,
          })
          .from(calendarConnections)
          .where(
            and(
              eq(calendarConnections.userId, authedUser.id),
              eq(calendarConnections.provider, MICROSOFT_CALENDAR_PROVIDER),
            ),
          )
          .limit(1);

        const refreshTokenEncrypted =
          tokenPayload.refresh_token && tokenPayload.refresh_token.length > 0
            ? encryptSecret(tokenPayload.refresh_token, encryptionSecret)
            : existingConnection?.refreshTokenEncrypted ?? null;
        if (!refreshTokenEncrypted) {
          return jsonError(
            context,
            400,
            'Microsoft did not return a refresh token. Reconnect and approve offline access.',
          );
        }

        const now = new Date();
        const accessTokenExpiresAt = new Date(now.getTime() + tokenPayload.expires_in * 1000);
        await db.transaction(async (transaction) => {
          await transaction
            .insert(calendarConnections)
            .values({
              userId: authedUser.id,
              provider: MICROSOFT_CALENDAR_PROVIDER,
              externalAccountId: profile.sub,
              externalEmail: profile.email ?? null,
              accessTokenEncrypted: encryptSecret(tokenPayload.access_token, encryptionSecret),
              refreshTokenEncrypted,
              accessTokenExpiresAt,
              scope: tokenPayload.scope ?? null,
              lastError: null,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [calendarConnections.userId, calendarConnections.provider],
              set: {
                externalAccountId: profile.sub,
                externalEmail: profile.email ?? null,
                accessTokenEncrypted: encryptSecret(tokenPayload.access_token, encryptionSecret),
                refreshTokenEncrypted,
                accessTokenExpiresAt,
                scope: tokenPayload.scope ?? null,
                lastError: null,
                updatedAt: now,
              },
            });

          await consumeDemoFeatureCredits(transaction as DemoQuotaDb, context.env, authedUser, {
            featureKey: 'calendar_connect',
            sourceKey: buildDemoFeatureSourceKey('calendar_connect', {
              provider: MICROSOFT_CALENDAR_PROVIDER,
              state: parsed.data.state,
            }),
            metadata: { provider: MICROSOFT_CALENDAR_PROVIDER },
            now,
          });
        });

        const [connection] = await db
          .select({
            externalEmail: calendarConnections.externalEmail,
            lastSyncedAt: calendarConnections.lastSyncedAt,
            nextSyncAt: calendarConnections.nextSyncAt,
            lastError: calendarConnections.lastError,
          })
          .from(calendarConnections)
          .where(
            and(
              eq(calendarConnections.userId, authedUser.id),
              eq(calendarConnections.provider, MICROSOFT_CALENDAR_PROVIDER),
            ),
          )
          .limit(1);

        if (!connection) {
          emitAuditEvent({
            event: 'calendar_connect_failed',
            level: 'error',
            actorUserId: authedUser.id,
            provider: MICROSOFT_CALENDAR_PROVIDER,
            route: '/v0/calendar/microsoft/connect/complete',
            statusCode: 500,
            connected: false,
            error: 'connection_persist_failed',
          });
          return jsonError(context, 500, 'Unable to persist calendar connection.');
        }

        emitAuditEvent({
          event: 'calendar_connect_completed',
          level: 'info',
          actorUserId: authedUser.id,
          provider: MICROSOFT_CALENDAR_PROVIDER,
          route: '/v0/calendar/microsoft/connect/complete',
          statusCode: 200,
          connected: true,
        });

        return context.json({
          ok: true,
          connection: toCalendarConnectionStatus({
            provider: MICROSOFT_CALENDAR_PROVIDER,
            externalEmail: connection.externalEmail,
            lastSyncedAt: connection.lastSyncedAt,
            nextSyncAt: connection.nextSyncAt,
            lastError: connection.lastError,
          }),
        });
      } catch (error) {
        if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
          return jsonDemoQuotaError(context, db, context.env, authedUser, error);
        }
        emitAuditEvent({
          event: 'calendar_connect_failed',
          level: 'error',
          actorUserId: authedUser.id,
          provider: MICROSOFT_CALENDAR_PROVIDER,
          route: '/v0/calendar/microsoft/connect/complete',
          statusCode: 502,
          connected: false,
          error: sanitizeErrorForAudit(error, 'microsoft_connect_failed'),
        });
        logInternalError('microsoft_calendar_connect_failed', error);
        return jsonError(context, 502, 'Microsoft OAuth exchange failed.');
      }
    });
  });
};
