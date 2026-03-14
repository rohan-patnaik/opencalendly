import { and, desc, eq } from 'drizzle-orm';

import { webhookSubscriptions } from '@opencalendly/db';
import {
  webhookSubscriptionCreateSchema,
  webhookSubscriptionUpdateSchema,
} from '@opencalendly/shared';

import {
  normalizeWebhookEvents,
  parseWebhookEventTypes,
} from '../lib/webhooks';
import { resolveAuthenticatedUser } from '../server/auth-session';
import { jsonError } from '../server/core';
import { withDatabase, isUniqueViolation } from '../server/database';
import { consumeDemoFeatureCredits, jsonDemoQuotaError } from '../server/demo-quota';
import { buildDemoFeatureSourceKey } from '../server/idempotency';
import { createWebhookSecretValues } from '../server/webhook-secret-storage';
import type { ApiApp, DemoQuotaDb } from '../server/types';
import { DemoQuotaAdmissionError, DemoQuotaCreditsError } from '../server/types';

export const registerWebhookRoutes = (app: ApiApp): void => {
  app.get('/v0/webhooks', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const rows = await db
        .select({
          id: webhookSubscriptions.id,
          url: webhookSubscriptions.url,
          events: webhookSubscriptions.events,
          isActive: webhookSubscriptions.isActive,
          createdAt: webhookSubscriptions.createdAt,
          updatedAt: webhookSubscriptions.updatedAt,
        })
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.userId, authedUser.id))
        .orderBy(desc(webhookSubscriptions.createdAt));

      return context.json({
        ok: true,
        webhooks: rows.map((row) => ({
          id: row.id,
          url: row.url,
          events: parseWebhookEventTypes(row.events),
          isActive: row.isActive,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        })),
      });
    });
  });

  app.post('/v0/webhooks', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const body = await context.req.json().catch(() => null);
      const parsed = webhookSubscriptionCreateSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      try {
        const now = new Date();
        const inserted = await db.transaction(async (transaction) => {
          const [created] = await transaction
            .insert(webhookSubscriptions)
            .values({
              userId: authedUser.id,
              url: parsed.data.url,
              ...createWebhookSecretValues(parsed.data.secret, context.env),
              events: normalizeWebhookEvents(parsed.data.events),
              isActive: true,
            })
            .returning({
              id: webhookSubscriptions.id,
              url: webhookSubscriptions.url,
              events: webhookSubscriptions.events,
              isActive: webhookSubscriptions.isActive,
              createdAt: webhookSubscriptions.createdAt,
              updatedAt: webhookSubscriptions.updatedAt,
            });

          if (!created) {
            throw new Error('Failed to create webhook subscription.');
          }

          await consumeDemoFeatureCredits(transaction as DemoQuotaDb, context.env, authedUser, {
            featureKey: 'webhook_create',
            sourceKey: buildDemoFeatureSourceKey('webhook_create', {
              url: parsed.data.url,
              events: parsed.data.events,
            }),
            metadata: { webhookId: created.id, url: created.url },
            now,
          });

          return created;
        });

        if (!inserted) {
          return jsonError(context, 500, 'Failed to create webhook subscription.');
        }

        return context.json({
          ok: true,
          webhook: {
            id: inserted.id,
            url: inserted.url,
            events: parseWebhookEventTypes(inserted.events),
            isActive: inserted.isActive,
            createdAt: inserted.createdAt.toISOString(),
            updatedAt: inserted.updatedAt.toISOString(),
          },
        });
      } catch (error) {
        if (isUniqueViolation(error, 'webhook_subscriptions_user_url_unique')) {
          return jsonError(context, 409, 'A webhook subscription with that URL already exists.');
        }
        if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
          return jsonDemoQuotaError(context, db, context.env, authedUser, error);
        }
        throw error;
      }
    });
  });

  app.patch('/v0/webhooks/:id', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const body = await context.req.json().catch(() => null);
      const parsed = webhookSubscriptionUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      const now = new Date();
      const updateValues: Partial<typeof webhookSubscriptions.$inferInsert> = { updatedAt: now };
      if (parsed.data.url !== undefined) {
        updateValues.url = parsed.data.url;
      }
      if (parsed.data.secret !== undefined) {
        Object.assign(updateValues, createWebhookSecretValues(parsed.data.secret, context.env));
      }
      if (parsed.data.events !== undefined) {
        updateValues.events = normalizeWebhookEvents(parsed.data.events);
      }
      if (parsed.data.isActive !== undefined) {
        updateValues.isActive = parsed.data.isActive;
      }

      try {
        const webhookId = context.req.param('id');
        const updated = await db.transaction(async (transaction) => {
          const [saved] = await transaction
            .update(webhookSubscriptions)
            .set(updateValues)
            .where(and(eq(webhookSubscriptions.id, webhookId), eq(webhookSubscriptions.userId, authedUser.id)))
            .returning({
              id: webhookSubscriptions.id,
              url: webhookSubscriptions.url,
              events: webhookSubscriptions.events,
              isActive: webhookSubscriptions.isActive,
              createdAt: webhookSubscriptions.createdAt,
              updatedAt: webhookSubscriptions.updatedAt,
            });

          if (!saved) {
            return null;
          }

          await consumeDemoFeatureCredits(transaction as DemoQuotaDb, context.env, authedUser, {
            featureKey: 'webhook_update',
            sourceKey: buildDemoFeatureSourceKey('webhook_update', {
              webhookId,
              changes: parsed.data,
            }),
            metadata: { webhookId, url: saved.url },
            now,
          });

          return saved;
        });

        if (!updated) {
          return jsonError(context, 404, 'Webhook subscription not found.');
        }

        return context.json({
          ok: true,
          webhook: {
            id: updated.id,
            url: updated.url,
            events: parseWebhookEventTypes(updated.events),
            isActive: updated.isActive,
            createdAt: updated.createdAt.toISOString(),
            updatedAt: updated.updatedAt.toISOString(),
          },
        });
      } catch (error) {
        if (isUniqueViolation(error, 'webhook_subscriptions_user_url_unique')) {
          return jsonError(context, 409, 'A webhook subscription with that URL already exists.');
        }
        if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
          return jsonDemoQuotaError(context, db, context.env, authedUser, error);
        }
        throw error;
      }
    });
  });
};
