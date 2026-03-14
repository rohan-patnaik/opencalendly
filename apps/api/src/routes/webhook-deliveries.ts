import { resolveAuthenticatedUser } from '../server/auth-session';
import { jsonError } from '../server/core';
import { withDatabase } from '../server/database';
import { assertDemoFeatureAvailable, consumeDemoFeatureCredits, jsonDemoQuotaError } from '../server/demo-quota';
import { clampWebhookDeliveryBatchLimit } from '../server/env';
import { buildDemoFeatureSourceKey } from '../server/idempotency';
import type { ApiApp, DemoQuotaDb } from '../server/types';
import { DemoQuotaAdmissionError, DemoQuotaCreditsError } from '../server/types';
import { runWebhookDeliveryBatch } from '../server/webhook-deliveries';

export const registerWebhookDeliveryRoutes = (app: ApiApp): void => {
  app.post('/v0/webhooks/deliveries/run', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const limit = clampWebhookDeliveryBatchLimit(context.req.query('limit'));
      const now = new Date();

      try {
        await assertDemoFeatureAvailable(db, context.env, authedUser, 'webhook_run', now);
      } catch (error) {
        if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
          return jsonDemoQuotaError(context, db, context.env, authedUser, error);
        }
        throw error;
      }

      const outcome = await runWebhookDeliveryBatch(db, {
        organizerId: authedUser.id,
        env: context.env,
        limit,
        now,
      });

      if (outcome.processed > 0) {
        try {
          await db.transaction(async (transaction) => {
            await consumeDemoFeatureCredits(transaction as DemoQuotaDb, context.env, authedUser, {
              featureKey: 'webhook_run',
              sourceKey: buildDemoFeatureSourceKey('webhook_run', {
                deliveryIds: outcome.rowIds.sort(),
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
        processed: outcome.processed,
        succeeded: outcome.succeeded,
        retried: outcome.retried,
        failed: outcome.failed,
      });
    });
  });
};
