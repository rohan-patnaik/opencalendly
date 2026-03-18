import { and, asc, eq, lte } from 'drizzle-orm';

import { bookingExternalEvents } from '@opencalendly/db';
import { calendarWritebackRunSchema } from '@opencalendly/shared';

import { resolveAuthenticatedUser } from '../server/auth-session';
import { emitAuditEvent, sanitizeErrorForAudit } from '../server/audit';
import { jsonError } from '../server/core';
import { withDatabase } from '../server/database';
import { assertDemoFeatureAvailable, consumeDemoFeatureCredits, jsonDemoQuotaError } from '../server/demo-quota';
import type { ApiApp, DemoQuotaDb } from '../server/types';
import { DemoQuotaAdmissionError, DemoQuotaCreditsError } from '../server/types';
import { buildDemoFeatureSourceKey } from '../server/idempotency';
import { runCalendarWritebackBatch } from '../server/calendar-writeback-runner';
import { clampCalendarWritebackBatchLimit } from '../server/env';

export const registerCalendarWritebackRoutes = (app: ApiApp): void => {
  app.post('/v0/calendar/writeback/run', async (context) => {
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

      const parsed = calendarWritebackRunSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      const limit = clampCalendarWritebackBatchLimit(parsed.data.limit ?? context.req.query('limit'));
      const now = new Date();
      const dueRows = await db
        .select({ id: bookingExternalEvents.id })
        .from(bookingExternalEvents)
        .where(
          and(
            eq(bookingExternalEvents.organizerId, authedUser.id),
            eq(bookingExternalEvents.status, 'pending'),
            lte(bookingExternalEvents.nextAttemptAt, now),
          ),
        )
        .orderBy(asc(bookingExternalEvents.nextAttemptAt))
        .limit(limit);

      if (dueRows.length > 0) {
        try {
          await assertDemoFeatureAvailable(db, context.env, authedUser, 'writeback_run', now);
        } catch (error) {
          if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
            return jsonDemoQuotaError(context, db, context.env, authedUser, error);
          }
          throw error;
        }
      }

      try {
        const outcome = await runCalendarWritebackBatch(db, context.env, {
          organizerId: authedUser.id,
          limit,
        });

        if (outcome.processed > 0) {
          await db.transaction(async (transaction) => {
            await consumeDemoFeatureCredits(transaction as DemoQuotaDb, context.env, authedUser, {
              featureKey: 'writeback_run',
              sourceKey: buildDemoFeatureSourceKey('writeback_run', {
                rowIds: dueRows.map((row) => row.id).sort(),
                limit,
              }),
              metadata: { processed: outcome.processed, limit },
              now,
            });
          });
        }

        emitAuditEvent({
          event: 'calendar_writeback_batch_completed',
          level: outcome.failed > 0 ? 'warn' : 'info',
          actorUserId: authedUser.id,
          route: '/v0/calendar/writeback/run',
          statusCode: 200,
          limit,
          processed: outcome.processed,
          succeeded: outcome.succeeded,
          retried: outcome.retried,
          failed: outcome.failed,
        });

        return context.json({ ok: true, limit, ...outcome });
      } catch (error) {
        if (error instanceof DemoQuotaAdmissionError || error instanceof DemoQuotaCreditsError) {
          emitAuditEvent({
            event: 'calendar_writeback_batch_completed',
            level: 'warn',
            actorUserId: authedUser.id,
            route: '/v0/calendar/writeback/run',
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
          event: 'calendar_writeback_batch_completed',
          level: 'error',
          actorUserId: authedUser.id,
          route: '/v0/calendar/writeback/run',
          statusCode: 500,
          limit,
          processed: 0,
          succeeded: 0,
          retried: 0,
          failed: 0,
          error: sanitizeErrorForAudit(error, 'calendar_writeback_route_failed'),
        });
        throw error;
      }
    });
  });
};
