import { eq } from 'drizzle-orm';

import { availabilityOverrides, availabilityRules } from '@opencalendly/db';
import {
  setAvailabilityOverridesSchema,
  setAvailabilityRulesSchema,
} from '@opencalendly/shared';

import { resolveAuthenticatedUser } from '../server/auth-session';
import { jsonError } from '../server/core';
import { withDatabase } from '../server/database';
import { consumeDemoFeatureCredits, jsonDemoQuotaError } from '../server/demo-quota';
import { buildDemoFeatureSourceKey } from '../server/idempotency';
import type { ApiApp, DemoQuotaDb } from '../server/types';
import { DemoQuotaAdmissionError, DemoQuotaCreditsError } from '../server/types';

export const registerOrganizerAvailabilityRoutes = (app: ApiApp): void => {
  app.get('/v0/me/availability', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const [rules, overrides] = await Promise.all([
        db
          .select({
            id: availabilityRules.id,
            dayOfWeek: availabilityRules.dayOfWeek,
            startMinute: availabilityRules.startMinute,
            endMinute: availabilityRules.endMinute,
            bufferBeforeMinutes: availabilityRules.bufferBeforeMinutes,
            bufferAfterMinutes: availabilityRules.bufferAfterMinutes,
            createdAt: availabilityRules.createdAt,
          })
          .from(availabilityRules)
          .where(eq(availabilityRules.userId, authedUser.id))
          .orderBy(availabilityRules.dayOfWeek, availabilityRules.startMinute),
        db
          .select({
            id: availabilityOverrides.id,
            startAt: availabilityOverrides.startAt,
            endAt: availabilityOverrides.endAt,
            isAvailable: availabilityOverrides.isAvailable,
            reason: availabilityOverrides.reason,
            createdAt: availabilityOverrides.createdAt,
          })
          .from(availabilityOverrides)
          .where(eq(availabilityOverrides.userId, authedUser.id))
          .orderBy(availabilityOverrides.startAt),
      ]);

      return context.json({
        ok: true,
        rules: rules.map((rule) => ({ ...rule, createdAt: rule.createdAt.toISOString() })),
        overrides: overrides.map((override) => ({
          ...override,
          startAt: override.startAt.toISOString(),
          endAt: override.endAt.toISOString(),
          createdAt: override.createdAt.toISOString(),
        })),
      });
    });
  });

  app.put('/v0/me/availability/rules', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const body = await context.req.json().catch(() => null);
      const parsed = setAvailabilityRulesSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      const now = new Date();
      try {
        await db.transaction(async (transaction) => {
          await transaction.delete(availabilityRules).where(eq(availabilityRules.userId, authedUser.id));
          if (parsed.data.rules.length > 0) {
            await transaction.insert(availabilityRules).values(
              parsed.data.rules.map((rule) => ({ userId: authedUser.id, ...rule })),
            );
          }

          await consumeDemoFeatureCredits(transaction as DemoQuotaDb, context.env, authedUser, {
            featureKey: 'availability_save',
            sourceKey: buildDemoFeatureSourceKey('availability_save', {
              scope: 'rules',
              rules: parsed.data.rules,
            }),
            metadata: { scope: 'rules', count: parsed.data.rules.length },
            now,
          });
        });
      } catch (error) {
        if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
          return jsonDemoQuotaError(context, db, context.env, authedUser, error);
        }
        throw error;
      }

      return context.json({ ok: true, count: parsed.data.rules.length });
    });
  });

  app.put('/v0/me/availability/overrides', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const body = await context.req.json().catch(() => null);
      const parsed = setAvailabilityOverridesSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      const now = new Date();
      try {
        await db.transaction(async (transaction) => {
          await transaction.delete(availabilityOverrides).where(eq(availabilityOverrides.userId, authedUser.id));
          if (parsed.data.overrides.length > 0) {
            await transaction.insert(availabilityOverrides).values(
              parsed.data.overrides.map((override) => ({
                userId: authedUser.id,
                startAt: new Date(override.startAt),
                endAt: new Date(override.endAt),
                isAvailable: override.isAvailable,
                reason: override.reason ?? null,
              })),
            );
          }

          await consumeDemoFeatureCredits(transaction as DemoQuotaDb, context.env, authedUser, {
            featureKey: 'availability_save',
            sourceKey: buildDemoFeatureSourceKey('availability_save', {
              scope: 'overrides',
              overrides: parsed.data.overrides,
            }),
            metadata: { scope: 'overrides', count: parsed.data.overrides.length },
            now,
          });
        });
      } catch (error) {
        if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
          return jsonDemoQuotaError(context, db, context.env, authedUser, error);
        }
        throw error;
      }

      return context.json({ ok: true, count: parsed.data.overrides.length });
    });
  });
};
