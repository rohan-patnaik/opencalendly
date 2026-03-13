import { and, eq, sql } from 'drizzle-orm';

import { eventTypes, notificationRules } from '@opencalendly/db';
import { setNotificationRulesSchema } from '@opencalendly/shared';

import { resolveAuthenticatedUser } from '../server/auth-session';
import { isUuid, jsonError } from '../server/core';
import { withDatabase } from '../server/database';
import { consumeDemoFeatureCredits, jsonDemoQuotaError } from '../server/demo-quota';
import { buildDemoFeatureSourceKey } from '../server/idempotency';
import { listEventTypeNotificationRules } from '../server/notifications';
import type { ApiApp, DemoQuotaDb } from '../server/types';
import { DemoQuotaAdmissionError, DemoQuotaCreditsError } from '../server/types';

export const registerOrganizerNotificationRuleRoutes = (app: ApiApp): void => {
  app.get('/v0/event-types/:eventTypeId/notification-rules', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const eventTypeId = context.req.param('eventTypeId');
      if (!isUuid(eventTypeId)) {
        return jsonError(context, 400, 'Invalid eventTypeId.');
      }

      const rules = await listEventTypeNotificationRules(db, {
        eventTypeId,
        organizerId: authedUser.id,
      });
      if (!rules) {
        return jsonError(context, 404, 'Event type not found.');
      }

      return context.json({
        ok: true,
        eventTypeId,
        rules: rules.map((rule) => ({
          ...rule,
          createdAt: rule.createdAt.toISOString(),
          updatedAt: rule.updatedAt.toISOString(),
        })),
      });
    });
  });

  app.put('/v0/event-types/:eventTypeId/notification-rules', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const body = await context.req.json().catch(() => null);
      const parsed = setNotificationRulesSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      const eventTypeId = context.req.param('eventTypeId');
      if (!isUuid(eventTypeId)) {
        return jsonError(context, 400, 'Invalid eventTypeId.');
      }

      const [eventType] = await db
        .select({ id: eventTypes.id })
        .from(eventTypes)
        .where(and(eq(eventTypes.id, eventTypeId), eq(eventTypes.userId, authedUser.id)))
        .limit(1);
      if (!eventType) {
        return jsonError(context, 404, 'Event type not found.');
      }

      const now = new Date();
      try {
        await db.transaction(async (transaction) => {
          await transaction
            .update(notificationRules)
            .set({ isEnabled: false, updatedAt: now })
            .where(eq(notificationRules.eventTypeId, eventTypeId));

          if (parsed.data.rules.length > 0) {
            await transaction
              .insert(notificationRules)
              .values(
                parsed.data.rules.map((rule) => ({
                  eventTypeId,
                  notificationType: rule.notificationType,
                  offsetMinutes: rule.offsetMinutes,
                  isEnabled: rule.isEnabled,
                  updatedAt: now,
                })),
              )
              .onConflictDoUpdate({
                target: [
                  notificationRules.eventTypeId,
                  notificationRules.notificationType,
                  notificationRules.offsetMinutes,
                ],
                set: { isEnabled: sql`excluded.is_enabled`, updatedAt: now },
              });
          }

          await consumeDemoFeatureCredits(transaction as DemoQuotaDb, context.env, authedUser, {
            featureKey: 'notification_rules_save',
            sourceKey: buildDemoFeatureSourceKey('notification_rules_save', {
              eventTypeId,
              rules: parsed.data.rules,
            }),
            metadata: { eventTypeId, ruleCount: parsed.data.rules.length },
            now,
          });
        });
      } catch (error) {
        if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
          return jsonDemoQuotaError(context, db, context.env, authedUser, error);
        }
        throw error;
      }

      const rules = await listEventTypeNotificationRules(db, {
        eventTypeId,
        organizerId: authedUser.id,
      });

      return context.json({
        ok: true,
        eventTypeId,
        count: rules?.length ?? 0,
        rules:
          rules?.map((rule) => ({
            ...rule,
            createdAt: rule.createdAt.toISOString(),
            updatedAt: rule.updatedAt.toISOString(),
          })) ?? [],
      });
    });
  });
};
