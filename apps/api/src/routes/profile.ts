import { and, eq, ne } from 'drizzle-orm';

import { users } from '@opencalendly/db';
import { onboardingCompleteSchema, profileUpdateSchema } from '@opencalendly/shared';

import { resolveAuthenticatedUser } from '../server/auth-session';
import { emitAuditEvent } from '../server/audit';
import { normalizeTimezone, jsonError } from '../server/core';
import { withDatabase } from '../server/database';
import type { ApiApp } from '../server/types';

const toProfilePayload = (row: {
  id: string;
  email: string;
  username: string;
  displayName: string;
  timezone: string;
  onboardingCompleted: boolean;
}) => ({
  id: row.id,
  email: row.email,
  username: row.username,
  displayName: row.displayName,
  timezone: normalizeTimezone(row.timezone),
  onboardingCompleted: row.onboardingCompleted,
});

export const registerProfileRoutes = (app: ApiApp): void => {
  app.get('/v0/profile', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      return context.json({ ok: true, user: authedUser });
    });
  });

  app.patch('/v0/profile', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const body = await context.req.json().catch(() => null);
      const parsed = profileUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      const nextUsername = parsed.data.username?.trim().toLowerCase() ?? authedUser.username;
      const nextDisplayName = parsed.data.displayName?.trim() ?? authedUser.displayName;
      const nextTimezone = parsed.data.timezone ? normalizeTimezone(parsed.data.timezone) : authedUser.timezone;

      const [conflictingUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.username, nextUsername), ne(users.id, authedUser.id)))
        .limit(1);
      if (conflictingUser) {
        return jsonError(context, 409, 'Username is already taken.');
      }

      const [updated] = await db
        .update(users)
        .set({
          username: nextUsername,
          displayName: nextDisplayName,
          timezone: nextTimezone,
        })
        .where(eq(users.id, authedUser.id))
        .returning({
          id: users.id,
          email: users.email,
          username: users.username,
          displayName: users.displayName,
          timezone: users.timezone,
          onboardingCompleted: users.onboardingCompleted,
        });

      if (!updated) {
        return jsonError(context, 404, 'Profile not found.');
      }

      emitAuditEvent({
        event: 'profile_updated',
        level: 'info',
        actorUserId: authedUser.id,
        route: '/v0/profile',
        statusCode: 200,
      });

      return context.json({ ok: true, user: toProfilePayload(updated) });
    });
  });

  app.post('/v0/onboarding/complete', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const body = await context.req.json().catch(() => ({}));
      const parsed = onboardingCompleteSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(context, 400, 'Invalid request body.');
      }

      const [updated] = await db
        .update(users)
        .set({ onboardingCompleted: true })
        .where(eq(users.id, authedUser.id))
        .returning({
          id: users.id,
          email: users.email,
          username: users.username,
          displayName: users.displayName,
          timezone: users.timezone,
          onboardingCompleted: users.onboardingCompleted,
        });

      if (!updated) {
        return jsonError(context, 404, 'Profile not found.');
      }

      emitAuditEvent({
        event: 'onboarding_completed',
        level: 'info',
        actorUserId: authedUser.id,
        route: '/v0/onboarding/complete',
        statusCode: 200,
      });

      return context.json({ ok: true, user: toProfilePayload(updated) });
    });
  });
};
