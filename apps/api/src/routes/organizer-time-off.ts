import { and, asc, eq } from 'drizzle-orm';

import { timeOffBlocks } from '@opencalendly/db';
import {
  timeOffCreateSchema,
  timeOffHolidayImportSchema,
} from '@opencalendly/shared';

import { buildHolidayTimeOffWindows } from '../lib/holidays';
import { resolveAuthenticatedUser } from '../server/auth-session';
import { isUuid, jsonError } from '../server/core';
import { withDatabase } from '../server/database';
import type { ApiApp } from '../server/types';

export const registerOrganizerTimeOffRoutes = (app: ApiApp): void => {
  app.get('/v0/me/time-off', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const blocks = await db
        .select({
          id: timeOffBlocks.id,
          startAt: timeOffBlocks.startAt,
          endAt: timeOffBlocks.endAt,
          reason: timeOffBlocks.reason,
          source: timeOffBlocks.source,
          sourceKey: timeOffBlocks.sourceKey,
          createdAt: timeOffBlocks.createdAt,
        })
        .from(timeOffBlocks)
        .where(eq(timeOffBlocks.userId, authedUser.id))
        .orderBy(asc(timeOffBlocks.startAt));

      return context.json({
        ok: true,
        timeOffBlocks: blocks.map((block) => ({
          ...block,
          startAt: block.startAt.toISOString(),
          endAt: block.endAt.toISOString(),
          createdAt: block.createdAt.toISOString(),
        })),
      });
    });
  });

  app.post('/v0/me/time-off', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const body = await context.req.json().catch(() => null);
      const parsed = timeOffCreateSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      const [inserted] = await db
        .insert(timeOffBlocks)
        .values({
          userId: authedUser.id,
          startAt: new Date(parsed.data.startAt),
          endAt: new Date(parsed.data.endAt),
          reason: parsed.data.reason ?? null,
          source: 'manual',
        })
        .returning({
          id: timeOffBlocks.id,
          startAt: timeOffBlocks.startAt,
          endAt: timeOffBlocks.endAt,
          reason: timeOffBlocks.reason,
          source: timeOffBlocks.source,
          sourceKey: timeOffBlocks.sourceKey,
          createdAt: timeOffBlocks.createdAt,
        });

      if (!inserted) {
        return jsonError(context, 500, 'Unable to create time-off block.');
      }

      return context.json({
        ok: true,
        timeOffBlock: {
          ...inserted,
          startAt: inserted.startAt.toISOString(),
          endAt: inserted.endAt.toISOString(),
          createdAt: inserted.createdAt.toISOString(),
        },
      });
    });
  });

  app.delete('/v0/me/time-off/:id', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const id = context.req.param('id');
      if (!isUuid(id)) {
        return jsonError(context, 400, 'Invalid time-off block id.');
      }

      const [deleted] = await db
        .delete(timeOffBlocks)
        .where(and(eq(timeOffBlocks.id, id), eq(timeOffBlocks.userId, authedUser.id)))
        .returning({ id: timeOffBlocks.id });

      if (!deleted) {
        return jsonError(context, 404, 'Time-off block not found.');
      }

      return context.json({ ok: true, deletedId: deleted.id });
    });
  });

  app.post('/v0/me/time-off/import-holidays', async (context) => {
    return withDatabase(context, async (db) => {
      const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
      if (!authedUser) {
        return jsonError(context, 401, 'Unauthorized.');
      }

      const body = await context.req.json().catch(() => null);
      const parsed = timeOffHolidayImportSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      const windows = buildHolidayTimeOffWindows({
        locale: parsed.data.locale,
        year: parsed.data.year,
        timezone: authedUser.timezone,
      });
      if (windows.length === 0) {
        return context.json({ ok: true, imported: 0, skipped: 0 });
      }

      const inserted = await db
        .insert(timeOffBlocks)
        .values(
          windows.map((window) => ({
            userId: authedUser.id,
            startAt: window.startAt,
            endAt: window.endAt,
            reason: window.reason,
            source: 'holiday_import',
            sourceKey: window.sourceKey,
          })),
        )
        .onConflictDoNothing({ target: [timeOffBlocks.userId, timeOffBlocks.source, timeOffBlocks.sourceKey] })
        .returning({ id: timeOffBlocks.id });

      return context.json({ ok: true, imported: inserted.length, skipped: windows.length - inserted.length });
    });
  });
};
