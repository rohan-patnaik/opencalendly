import { and, eq, inArray, sql } from 'drizzle-orm';

import { bookingExternalEvents, calendarConnections } from '@opencalendly/db';

import {
  CALENDAR_WRITEBACK_DEFAULT_MAX_ATTEMPTS,
  GOOGLE_CALENDAR_PROVIDER,
  MICROSOFT_CALENDAR_PROVIDER,
  toCalendarProvider,
} from './env';
import type { CalendarWritebackOperation, Database } from './types';

export type CalendarWritebackQueueResult = {
  queued: number;
  rowIds: string[];
};

export const claimDueCalendarWritebackRowIds = async (
  db: Database,
  input: { now: Date; organizerId?: string; rowIds?: string[]; limit: number },
): Promise<string[]> => {
  const leaseUntil = new Date(input.now.getTime() + 3 * 60_000);
  return db.transaction(async (transaction) => {
    const organizerFilter = input.organizerId ? sql`and organizer_id = ${input.organizerId}` : sql``;
    const rowIdsFilter =
      input.rowIds && input.rowIds.length > 0
        ? sql`and id in (${sql.join(input.rowIds.map((id) => sql`${id}`), sql`, `)})`
        : sql``;

    const claimed = await transaction.execute<{ id: string }>(sql`
      with due_rows as (
        select id
        from booking_external_events
        where status = 'pending'
          and next_attempt_at <= ${input.now}
          ${organizerFilter}
          ${rowIdsFilter}
        order by next_attempt_at asc
        limit ${input.limit}
        for update skip locked
      )
      update booking_external_events as target
      set next_attempt_at = ${leaseUntil},
          updated_at = ${input.now}
      from due_rows
      where target.id = due_rows.id
      returning target.id
    `);

    return claimed.rows.map((row) => row.id);
  });
};

export const parseCalendarWritebackPayload = (
  value: unknown,
): {
  rescheduleTarget?: { bookingId: string; startsAtIso: string; endsAtIso: string };
} => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const payload = value as Record<string, unknown>;
  const target = payload.rescheduleTarget;
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    return {};
  }

  const parsedTarget = target as Record<string, unknown>;
  if (
    typeof parsedTarget.bookingId !== 'string' ||
    typeof parsedTarget.startsAtIso !== 'string' ||
    typeof parsedTarget.endsAtIso !== 'string'
  ) {
    return {};
  }

  return {
    rescheduleTarget: {
      bookingId: parsedTarget.bookingId,
      startsAtIso: parsedTarget.startsAtIso,
      endsAtIso: parsedTarget.endsAtIso,
    },
  };
};

export const enqueueCalendarWritebacksForBooking = async (
  db: Database,
  input: {
    bookingId: string;
    organizerId: string;
    operation: CalendarWritebackOperation;
    rescheduleTarget?: { bookingId: string; startsAtIso: string; endsAtIso: string };
  },
): Promise<CalendarWritebackQueueResult> => {
  const connections = await db
    .select({ id: calendarConnections.id, provider: calendarConnections.provider })
    .from(calendarConnections)
    .where(
      and(
        eq(calendarConnections.userId, input.organizerId),
        eq(calendarConnections.useForWriteback, true),
        inArray(calendarConnections.provider, [GOOGLE_CALENDAR_PROVIDER, MICROSOFT_CALENDAR_PROVIDER]),
      ),
    );

  if (connections.length === 0) {
    return { queued: 0, rowIds: [] };
  }

  const existingRows = await db
    .select({
      id: bookingExternalEvents.id,
      connectionId: bookingExternalEvents.connectionId,
      maxAttempts: bookingExternalEvents.maxAttempts,
    })
    .from(bookingExternalEvents)
    .where(eq(bookingExternalEvents.bookingId, input.bookingId));

  const existingByConnectionId = new Map(
    existingRows
      .filter((row) => row.connectionId)
      .map((row) => [row.connectionId as string, row]),
  );
  const payload =
    input.operation === 'reschedule' && input.rescheduleTarget
      ? { rescheduleTarget: input.rescheduleTarget }
      : {};
  const now = new Date();
  const rowIds: string[] = [];

  for (const connection of connections) {
    const provider = toCalendarProvider(connection.provider);
    if (!provider) {
      continue;
    }

    const existing = existingByConnectionId.get(connection.id);
    if (existing) {
      await db
        .update(bookingExternalEvents)
        .set({
          organizerId: input.organizerId,
          connectionId: connection.id,
          operation: input.operation,
          status: 'pending',
          payload,
          attemptCount: 0,
          maxAttempts:
            existing.maxAttempts > 0
              ? existing.maxAttempts
              : CALENDAR_WRITEBACK_DEFAULT_MAX_ATTEMPTS,
          nextAttemptAt: now,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(bookingExternalEvents.id, existing.id));

      rowIds.push(existing.id);
      continue;
    }

    const [inserted] = await db
      .insert(bookingExternalEvents)
      .values({
        bookingId: input.bookingId,
        organizerId: input.organizerId,
        connectionId: connection.id,
        provider,
        operation: input.operation,
        status: 'pending',
        payload,
        attemptCount: 0,
        maxAttempts: CALENDAR_WRITEBACK_DEFAULT_MAX_ATTEMPTS,
        nextAttemptAt: now,
      })
      .returning({ id: bookingExternalEvents.id });

    if (inserted) {
      rowIds.push(inserted.id);
    }
  }

  return { queued: rowIds.length, rowIds };
};
