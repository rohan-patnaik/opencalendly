import { resolveAuthenticatedUser } from '../server/auth-session';
import { emitAuditEvent, sanitizeErrorForAudit } from '../server/audit';
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

      try {
        const outcome = await runWebhookDeliveryBatch(db, {
          organizerId: authedUser.id,
          env: context.env,
          limit,
          now,
        });

        if (outcome.processed > 0) {
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
        }

        emitAuditEvent({
          event: 'webhook_delivery_batch_completed',
          level: outcome.failed > 0 ? 'warn' : 'info',
          actorUserId: authedUser.id,
          route: '/v0/webhooks/deliveries/run',
          statusCode: 200,
          limit,
          processed: outcome.processed,
          succeeded: outcome.succeeded,
          retried: outcome.retried,
          failed: outcome.failed,
        });

        return context.json({
          ok: true,
          processed: outcome.processed,
          succeeded: outcome.succeeded,
          retried: outcome.retried,
          failed: outcome.failed,
        });
      } catch (error) {
        if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
          emitAuditEvent({
            event: 'webhook_delivery_batch_completed',
            level: 'warn',
            actorUserId: authedUser.id,
            route: '/v0/webhooks/deliveries/run',
            statusCode: error instanceof DemoQuotaAdmissionError ? 403 : 429,
            limit,
            processed: 0,
            succeeded: 0,
            retried: 0,
            failed: 0,
            error: sanitizeErrorForAudit(error, 'demo_quota_blocked'),
          });
          return jsonDemoQuotaError(context, db, context.env, authedUser, error);
        }

        emitAuditEvent({
          event: 'webhook_delivery_batch_completed',
          level: 'error',
          actorUserId: authedUser.id,
          route: '/v0/webhooks/deliveries/run',
          statusCode: 500,
          limit,
          processed: 0,
          succeeded: 0,
          retried: 0,
          failed: 0,
          error: sanitizeErrorForAudit(error, 'webhook_delivery_route_failed'),
        });
        throw error;
      }
    });
  });
};
