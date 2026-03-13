import { eq } from 'drizzle-orm';

import { users } from '@opencalendly/db';
import {
  devAuthBootstrapRequestSchema,
} from '@opencalendly/shared';

import { isDevAuthBootstrapEnabled, isLocalBootstrapRequest } from '../lib/dev-auth';
import {
  clearIssuedSessionCookie,
  issueSessionForUser,
  resolveAuthenticatedUser,
  revokeSession,
  withIssuedSessionCookie,
} from '../server/auth-session';
import { jsonError } from '../server/core';
import { withDatabase } from '../server/database';
import type { ApiApp } from '../server/types';

export const registerAuthRoutes = (app: ApiApp): void => {
  app.post('/v0/dev/auth/bootstrap', async (context) => {
    if (!isDevAuthBootstrapEnabled(context.env.ENABLE_DEV_AUTH_BOOTSTRAP?.trim())) {
      return jsonError(context, 404, 'Not found.');
    }

    if (!isLocalBootstrapRequest(context.req.raw)) {
      return jsonError(context, 403, 'Local development access only.');
    }

    return withDatabase(context, async (db) => {
      const body = await context.req.json().catch(() => null);
      if (body === null) {
        return jsonError(context, 400, 'Malformed JSON body.');
      }
      const parsed = devAuthBootstrapRequestSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      const requestedEmail = parsed.data.email?.trim().toLowerCase() ?? 'demo@opencalendly.dev';
      const [userRecord] = await db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          displayName: users.displayName,
          timezone: users.timezone,
        })
        .from(users)
        .where(eq(users.email, requestedEmail))
        .limit(1);

      if (!userRecord) {
        return jsonError(
          context,
          404,
          'Bootstrap user not found. Run npm run db:seed or provide an existing account email.',
        );
      }

      const issuedSession = await issueSessionForUser(db, userRecord);
      if (!issuedSession) {
        return jsonError(context, 500, 'Unable to create session.');
      }

      return withIssuedSessionCookie(
        context.json({
          ok: true,
          issuer: 'dev' as const,
          expiresAt: issuedSession.expiresAt.toISOString(),
          user: issuedSession.user,
        }),
        {
          request: context.req.raw,
          env: context.env,
          sessionToken: issuedSession.sessionToken,
          expiresAt: issuedSession.expiresAt,
        },
      );
    });
  });

  app.get('/v0/auth/me', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      return context.json({ ok: true, user: authedUser });
    });
  });

  app.post('/v0/auth/logout', async (context) => {
    return withDatabase(context, async (db) => {
      await revokeSession(db, context.req.raw);
      return clearIssuedSessionCookie(context.json({ ok: true }), {
        request: context.req.raw,
        env: context.env,
      });
    });
  });
};
