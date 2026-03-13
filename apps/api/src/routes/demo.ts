import { eq } from 'drizzle-orm';

import {
  demoAccountDailyUsage,
  demoAdmissionsDaily,
  demoCreditEvents,
  waitlistEntries,
} from '@opencalendly/db';
import { waitlistJoinSchema } from '@opencalendly/shared';

import { resolveAuthenticatedUser } from '../server/auth-session';
import { jsonError } from '../server/core';
import { withDatabase } from '../server/database';
import {
  loadDemoQuotaStatus,
  resolveDemoDailyAccountLimit,
} from '../server/demo-quota';
import { toUtcDateKey } from '../lib/demo-credits';
import type { ApiApp } from '../server/types';

export const registerDemoRoutes = (app: ApiApp): void => {
  app.get('/v0/demo-credits/status', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      const status = await loadDemoQuotaStatus(db, context.env, authedUser, new Date());
      return context.json({ ok: true, ...status });
    });
  });

  app.post('/v0/waitlist', async (context) => {
    return withDatabase(context, async (db) => {
      const body = await context.req.json().catch(() => null);
      const parsed = waitlistJoinSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      const now = new Date();
      const inserted = await db
        .insert(waitlistEntries)
        .values({
          dateKey: toUtcDateKey(now),
          email: parsed.data.email.trim().toLowerCase(),
          source: parsed.data.source.trim(),
          metadata: parsed.data.metadata ?? {},
        })
        .onConflictDoNothing({ target: [waitlistEntries.dateKey, waitlistEntries.email] })
        .returning({ id: waitlistEntries.id });

      return context.json({ ok: true, joined: inserted.length > 0 });
    });
  });

  app.post('/v0/dev/demo-credits/reset', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const now = new Date();
      const dateKey = toUtcDateKey(now);
      const dailyAccountLimit = resolveDemoDailyAccountLimit(context.env);

      await db.transaction(async (transaction) => {
        await transaction.delete(demoCreditEvents).where(eq(demoCreditEvents.dateKey, dateKey));
        await transaction.delete(demoAccountDailyUsage).where(eq(demoAccountDailyUsage.dateKey, dateKey));
        await transaction
          .insert(demoAdmissionsDaily)
          .values({
            dateKey,
            admittedCount: 0,
            dailyLimit: dailyAccountLimit,
            updatedAt: now,
            createdAt: now,
          })
          .onConflictDoNothing({ target: demoAdmissionsDaily.dateKey });
        await transaction
          .update(demoAdmissionsDaily)
          .set({
            admittedCount: 0,
            dailyLimit: dailyAccountLimit,
            updatedAt: now,
          })
          .where(eq(demoAdmissionsDaily.dateKey, dateKey));
      });

      const status = await loadDemoQuotaStatus(db, context.env, authedUser, now);
      return context.json({ ok: true, resetDate: dateKey, ...status });
    });
  });
};
