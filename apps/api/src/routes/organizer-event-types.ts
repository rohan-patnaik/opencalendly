import { and, desc, eq } from 'drizzle-orm';

import { eventTypes } from '@opencalendly/db';
import {
  eventTypeCreateSchema,
  eventTypeUpdateSchema,
} from '@opencalendly/shared';

import { resolveAuthenticatedUser } from '../server/auth-session';
import { jsonError } from '../server/core';
import { withDatabase, isUniqueViolation } from '../server/database';
import { consumeDemoFeatureCredits, jsonDemoQuotaError } from '../server/demo-quota';
import { buildDemoFeatureSourceKey } from '../server/idempotency';
import { toEventQuestions } from '../server/public-events';
import type { ApiApp, DemoQuotaDb } from '../server/types';
import { DemoQuotaAdmissionError, DemoQuotaCreditsError } from '../server/types';

const normalizeEventTypeBody = (body: unknown): unknown => {
  return body && typeof body === 'object'
    ? {
        ...body,
        slug: typeof (body as { slug?: unknown }).slug === 'string'
          ? ((body as { slug: string }).slug).toLowerCase().trim()
          : (body as { slug?: unknown }).slug,
      }
    : body;
};

export const registerOrganizerEventTypeRoutes = (app: ApiApp): void => {
  app.get('/v0/event-types', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const rows = await db
        .select({
          id: eventTypes.id,
          slug: eventTypes.slug,
          name: eventTypes.name,
          durationMinutes: eventTypes.durationMinutes,
          dailyBookingLimit: eventTypes.dailyBookingLimit,
          weeklyBookingLimit: eventTypes.weeklyBookingLimit,
          monthlyBookingLimit: eventTypes.monthlyBookingLimit,
          locationType: eventTypes.locationType,
          locationValue: eventTypes.locationValue,
          questions: eventTypes.questions,
          isActive: eventTypes.isActive,
          createdAt: eventTypes.createdAt,
        })
        .from(eventTypes)
        .where(eq(eventTypes.userId, authedUser.id))
        .orderBy(desc(eventTypes.createdAt));

      return context.json({
        ok: true,
        eventTypes: rows.map((row) => ({
          ...row,
          questions: toEventQuestions(row.questions),
          createdAt: row.createdAt.toISOString(),
        })),
      });
    });
  });

  app.post('/v0/event-types', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const parsed = eventTypeCreateSchema.safeParse(normalizeEventTypeBody(await context.req.json().catch(() => null)));
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      try {
        const now = new Date();
        const inserted = await db.transaction(async (transaction) => {
          const [created] = await transaction
            .insert(eventTypes)
            .values({
              userId: authedUser.id,
              name: parsed.data.name,
              slug: parsed.data.slug,
              durationMinutes: parsed.data.durationMinutes,
              dailyBookingLimit: parsed.data.dailyBookingLimit ?? null,
              weeklyBookingLimit: parsed.data.weeklyBookingLimit ?? null,
              monthlyBookingLimit: parsed.data.monthlyBookingLimit ?? null,
              locationType: parsed.data.locationType,
              locationValue: parsed.data.locationValue ?? null,
              questions: parsed.data.questions,
            })
            .returning({
              id: eventTypes.id,
              slug: eventTypes.slug,
              name: eventTypes.name,
              durationMinutes: eventTypes.durationMinutes,
              dailyBookingLimit: eventTypes.dailyBookingLimit,
              weeklyBookingLimit: eventTypes.weeklyBookingLimit,
              monthlyBookingLimit: eventTypes.monthlyBookingLimit,
              locationType: eventTypes.locationType,
              locationValue: eventTypes.locationValue,
              questions: eventTypes.questions,
              isActive: eventTypes.isActive,
            });

          if (!created) {
            throw new Error('Failed to create event type.');
          }

          await consumeDemoFeatureCredits(transaction as DemoQuotaDb, context.env, authedUser, {
            featureKey: 'event_type_create',
            sourceKey: buildDemoFeatureSourceKey('event_type_create', {
              slug: parsed.data.slug,
              name: parsed.data.name,
              durationMinutes: parsed.data.durationMinutes,
            }),
            metadata: { eventTypeId: created.id, slug: created.slug },
            now,
          });

          return created;
        });

        if (!inserted) {
          return jsonError(context, 500, 'Failed to create event type.');
        }

        return context.json({ ok: true, eventType: { ...inserted, questions: toEventQuestions(inserted.questions) } });
      } catch (error) {
        if (isUniqueViolation(error, 'event_types_user_slug_unique')) {
          return jsonError(context, 409, 'An event type with that slug already exists.');
        }
        if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
          return jsonDemoQuotaError(context, db, context.env, authedUser, error);
        }
        throw error;
      }
    });
  });

  app.patch('/v0/event-types/:id', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const parsed = eventTypeUpdateSchema.safeParse(normalizeEventTypeBody(await context.req.json().catch(() => null)));
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      const payload = parsed.data;
      const updateValues: Partial<typeof eventTypes.$inferInsert> = {};
      if (payload.name !== undefined) updateValues.name = payload.name;
      if (payload.slug !== undefined) updateValues.slug = payload.slug;
      if (payload.durationMinutes !== undefined) updateValues.durationMinutes = payload.durationMinutes;
      if (payload.dailyBookingLimit !== undefined) updateValues.dailyBookingLimit = payload.dailyBookingLimit ?? null;
      if (payload.weeklyBookingLimit !== undefined) updateValues.weeklyBookingLimit = payload.weeklyBookingLimit ?? null;
      if (payload.monthlyBookingLimit !== undefined) updateValues.monthlyBookingLimit = payload.monthlyBookingLimit ?? null;
      if (payload.locationType !== undefined) updateValues.locationType = payload.locationType;
      if (payload.locationValue !== undefined) updateValues.locationValue = payload.locationValue ?? null;
      if (payload.questions !== undefined) updateValues.questions = payload.questions;
      if (payload.isActive !== undefined) updateValues.isActive = payload.isActive;

      try {
        const eventTypeId = context.req.param('id');
        const now = new Date();
        const updated = await db.transaction(async (transaction) => {
          const [saved] = await transaction
            .update(eventTypes)
            .set(updateValues)
            .where(and(eq(eventTypes.id, eventTypeId), eq(eventTypes.userId, authedUser.id)))
            .returning({
              id: eventTypes.id,
              slug: eventTypes.slug,
              name: eventTypes.name,
              durationMinutes: eventTypes.durationMinutes,
              dailyBookingLimit: eventTypes.dailyBookingLimit,
              weeklyBookingLimit: eventTypes.weeklyBookingLimit,
              monthlyBookingLimit: eventTypes.monthlyBookingLimit,
              locationType: eventTypes.locationType,
              locationValue: eventTypes.locationValue,
              questions: eventTypes.questions,
              isActive: eventTypes.isActive,
            });

          if (!saved) {
            return null;
          }

          await consumeDemoFeatureCredits(transaction as DemoQuotaDb, context.env, authedUser, {
            featureKey: 'event_type_update',
            sourceKey: buildDemoFeatureSourceKey('event_type_update', { eventTypeId, changes: payload }),
            metadata: { eventTypeId, slug: saved.slug },
            now,
          });

          return saved;
        });

        if (!updated) {
          return jsonError(context, 404, 'Event type not found.');
        }

        return context.json({ ok: true, eventType: { ...updated, questions: toEventQuestions(updated.questions) } });
      } catch (error) {
        if (isUniqueViolation(error, 'event_types_user_slug_unique')) {
          return jsonError(context, 409, 'An event type with that slug already exists.');
        }
        if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
          return jsonDemoQuotaError(context, db, context.env, authedUser, error);
        }
        throw error;
      }
    });
  });
};
