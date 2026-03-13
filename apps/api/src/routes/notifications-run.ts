import { and, asc, eq, inArray, lt, lte, sql } from 'drizzle-orm';

import { scheduledNotifications } from '@opencalendly/db';
import { notificationsRunSchema } from '@opencalendly/shared';

import { resolveAuthenticatedUser } from '../server/auth-session';
import { jsonError } from '../server/core';
import { withDatabase } from '../server/database';
import {
  assertDemoFeatureAvailable,
  consumeDemoFeatureCredits,
  jsonDemoQuotaError,
} from '../server/demo-quota';
import { NOTIFICATION_RUN_MAX_ATTEMPTS, clampNotificationRunBatchLimit } from '../server/env';
import { buildDemoFeatureSourceKey } from '../server/idempotency';
import { runScheduledNotificationBatch } from '../server/notifications';
import type { ApiApp, DemoQuotaDb } from '../server/types';
import { DemoQuotaAdmissionError, DemoQuotaCreditsError } from '../server/types';

export const registerNotificationRunRoutes = (app: ApiApp): void => {
  app.post('/v0/notifications/run', async (context) => {
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

      const parsed = notificationsRunSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      const limit = clampNotificationRunBatchLimit(parsed.data.limit ?? context.req.query('limit'));
      const now = new Date();
      const previewRows = await db
        .select({ id: scheduledNotifications.id })
        .from(scheduledNotifications)
        .where(
          and(
            eq(scheduledNotifications.organizerId, authedUser.id),
            inArray(scheduledNotifications.status, ['pending', 'failed']),
            lt(scheduledNotifications.attemptCount, NOTIFICATION_RUN_MAX_ATTEMPTS),
            lte(scheduledNotifications.sendAt, now),
            sql`(${scheduledNotifications.leasedUntil} is null or ${scheduledNotifications.leasedUntil} <= ${now})`,
          ),
        )
        .orderBy(asc(scheduledNotifications.sendAt))
        .limit(limit);

      if (previewRows.length > 0) {
        try {
          await assertDemoFeatureAvailable(db, context.env, authedUser, 'notification_run', now);
        } catch (error) {
          if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
            return jsonDemoQuotaError(context, db, context.env, authedUser, error);
          }
          throw error;
        }
      }

      const outcome = await runScheduledNotificationBatch(context.env, db, {
        organizerId: authedUser.id,
        limit,
        now,
      });

      if (outcome.processed > 0) {
        try {
          await db.transaction(async (transaction) => {
            await consumeDemoFeatureCredits(transaction as DemoQuotaDb, context.env, authedUser, {
              featureKey: 'notification_run',
              sourceKey: buildDemoFeatureSourceKey('notification_run', {
                rowIds: outcome.rowIds.sort(),
                limit,
              }),
              metadata: { processed: outcome.processed, limit },
              now,
            });
          });
        } catch (error) {
          if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
            return jsonDemoQuotaError(context, db, context.env, authedUser, error);
          }
          throw error;
        }
      }

      return context.json({
        ok: true,
        limit,
        maxAttempts: NOTIFICATION_RUN_MAX_ATTEMPTS,
        processed: outcome.processed,
        succeeded: outcome.succeeded,
        failed: outcome.failed,
        skipped: outcome.skipped,
      });
    });
  });
};
