import { and, asc, eq, inArray } from 'drizzle-orm';

import {
  bookingExternalEvents,
  bookings,
  calendarConnections,
  eventTypes,
  users,
} from '@opencalendly/db';

import { parseBookingMetadata } from '../lib/booking-actions';
import { processCalendarWriteback } from '../lib/calendar-writeback';
import { normalizeTimezone } from './core';
import {
  CALENDAR_WRITEBACK_DEFAULT_MAX_ATTEMPTS,
  resolveCalendarEncryptionSecret,
  resolveGoogleOAuthConfig,
  resolveMicrosoftOAuthConfig,
  toCalendarProvider,
} from './env';
import {
  claimDueCalendarWritebackRowIds,
  parseCalendarWritebackPayload,
} from './calendar-writeback-queue';
import { emitAuditEvent, sanitizeErrorForAudit } from './audit';
import { captureApiException } from './sentry';
import type { Bindings, CalendarWritebackOperation, Database } from './types';
import { buildCalendarWritebackProviderClient } from './calendar-writeback-provider';

export type CalendarWritebackRunResult = {
  processed: number;
  succeeded: number;
  retried: number;
  failed: number;
};

export const runCalendarWritebackBatch = async (
  db: Database,
  env: Bindings,
  input: { organizerId?: string; rowIds?: string[]; limit: number },
): Promise<CalendarWritebackRunResult> => {
  const now = new Date();
  const claimedRowIds = await claimDueCalendarWritebackRowIds(db, {
    now,
    limit: input.limit,
    ...(input.organizerId ? { organizerId: input.organizerId } : {}),
    ...(input.rowIds && input.rowIds.length > 0 ? { rowIds: input.rowIds } : {}),
  });

  if (claimedRowIds.length === 0) {
    return { processed: 0, succeeded: 0, retried: 0, failed: 0 };
  }

  const rows = await db
    .select({
      id: bookingExternalEvents.id,
      bookingId: bookingExternalEvents.bookingId,
      organizerId: bookingExternalEvents.organizerId,
      connectionId: bookingExternalEvents.connectionId,
      provider: bookingExternalEvents.provider,
      operation: bookingExternalEvents.operation,
      externalEventId: bookingExternalEvents.externalEventId,
      payload: bookingExternalEvents.payload,
      attemptCount: bookingExternalEvents.attemptCount,
      maxAttempts: bookingExternalEvents.maxAttempts,
      bookingStartsAt: bookings.startsAt,
      bookingEndsAt: bookings.endsAt,
      bookingInviteeName: bookings.inviteeName,
      bookingInviteeEmail: bookings.inviteeEmail,
      bookingMetadata: bookings.metadata,
      eventTypeName: eventTypes.name,
      eventTypeLocationType: eventTypes.locationType,
      eventTypeLocationValue: eventTypes.locationValue,
      organizerTimezone: users.timezone,
      connectionAccessTokenEncrypted: calendarConnections.accessTokenEncrypted,
      connectionRefreshTokenEncrypted: calendarConnections.refreshTokenEncrypted,
      connectionAccessTokenExpiresAt: calendarConnections.accessTokenExpiresAt,
    })
    .from(bookingExternalEvents)
    .innerJoin(bookings, eq(bookings.id, bookingExternalEvents.bookingId))
    .innerJoin(eventTypes, eq(eventTypes.id, bookings.eventTypeId))
    .innerJoin(users, eq(users.id, bookingExternalEvents.organizerId))
    .leftJoin(calendarConnections, eq(calendarConnections.id, bookingExternalEvents.connectionId))
    .where(inArray(bookingExternalEvents.id, claimedRowIds))
    .orderBy(asc(bookingExternalEvents.updatedAt));

  const encryptionSecret = resolveCalendarEncryptionSecret(env);
  const googleConfig = resolveGoogleOAuthConfig(env);
  const microsoftConfig = resolveMicrosoftOAuthConfig(env);
  const result: CalendarWritebackRunResult = { processed: 0, succeeded: 0, retried: 0, failed: 0 };

  for (const row of rows) {
    result.processed += 1;
    const provider = toCalendarProvider(row.provider);
    const operation = row.operation as CalendarWritebackOperation;
    const payload = parseCalendarWritebackPayload(row.payload);
    const timezone =
      parseBookingMetadata(row.bookingMetadata, normalizeTimezone).timezone ??
      normalizeTimezone(row.organizerTimezone);

    const applyResult = async (
      writebackResult: Awaited<ReturnType<typeof processCalendarWriteback>>,
    ): Promise<void> => {
      await db
        .update(bookingExternalEvents)
        .set({
          status: writebackResult.status,
          attemptCount: writebackResult.attemptCount,
          nextAttemptAt: writebackResult.nextAttemptAt,
          lastAttemptAt: writebackResult.lastAttemptAt,
          lastError: writebackResult.lastError,
          externalEventId: writebackResult.externalEventId,
          updatedAt: now,
        })
        .where(eq(bookingExternalEvents.id, row.id));

      if (
        writebackResult.status === 'succeeded' &&
        writebackResult.transferExternalEventToBookingId &&
        writebackResult.externalEventId &&
        provider &&
        row.connectionId
      ) {
        const [targetRow] = await db
          .select({ id: bookingExternalEvents.id })
          .from(bookingExternalEvents)
          .where(
            and(
              eq(bookingExternalEvents.bookingId, writebackResult.transferExternalEventToBookingId),
              eq(bookingExternalEvents.connectionId, row.connectionId),
            ),
          )
          .limit(1);

        if (targetRow) {
          await db
            .update(bookingExternalEvents)
            .set({
              organizerId: row.organizerId,
              connectionId: row.connectionId,
              operation: 'create',
              status: 'succeeded',
              externalEventId: writebackResult.externalEventId,
              payload: {},
              attemptCount: 0,
              nextAttemptAt: now,
              lastAttemptAt: now,
              lastError: null,
              updatedAt: now,
            })
            .where(eq(bookingExternalEvents.id, targetRow.id));
        } else {
          await db.insert(bookingExternalEvents).values({
            bookingId: writebackResult.transferExternalEventToBookingId,
            organizerId: row.organizerId,
            connectionId: row.connectionId,
            provider,
            operation: 'create',
            status: 'succeeded',
            externalEventId: writebackResult.externalEventId,
            payload: {},
            attemptCount: 0,
            maxAttempts: row.maxAttempts > 0 ? row.maxAttempts : CALENDAR_WRITEBACK_DEFAULT_MAX_ATTEMPTS,
            nextAttemptAt: now,
            lastAttemptAt: now,
          });
        }
      }

      if (writebackResult.status === 'succeeded') {
        result.succeeded += 1;
      } else if (writebackResult.status === 'pending') {
        result.retried += 1;
      } else {
        result.failed += 1;
        void captureApiException(env, writebackResult.lastError ?? 'calendar_writeback_failed', {
          route: 'calendar_writeback_runner',
          statusCode: 500,
          tags: {
            provider: provider ?? 'unknown',
            operation,
          },
          extra: {
            bookingId: row.bookingId,
            writebackId: row.id,
            attempts: writebackResult.attemptCount,
          },
        });
        emitAuditEvent({
          event: 'calendar_writeback_failed_permanently',
          level: 'warn',
          actorUserId: row.organizerId,
          ...(provider ? { provider } : {}),
          route: 'calendar_writeback_runner',
          statusCode: 500,
          bookingId: row.bookingId,
          writebackId: row.id,
          operation,
          attempts: writebackResult.attemptCount,
          error: sanitizeErrorForAudit(writebackResult.lastError, 'calendar_writeback_failed'),
        });
      }
    };

    if (
      !provider ||
      !row.connectionId ||
      !row.connectionAccessTokenEncrypted ||
      !row.connectionRefreshTokenEncrypted ||
      !row.connectionAccessTokenExpiresAt ||
      !encryptionSecret
    ) {
      await applyResult(
        await processCalendarWriteback({
          record: {
            operation,
            attemptCount: row.attemptCount,
            maxAttempts: row.maxAttempts > 0 ? row.maxAttempts : CALENDAR_WRITEBACK_DEFAULT_MAX_ATTEMPTS,
            externalEventId: row.externalEventId,
            idempotencyKey: `${row.provider}:${row.bookingId}`,
          },
          booking: {
            eventName: row.eventTypeName,
            inviteeName: row.bookingInviteeName,
            inviteeEmail: row.bookingInviteeEmail,
            startsAtIso: row.bookingStartsAt.toISOString(),
            endsAtIso: row.bookingEndsAt.toISOString(),
            timezone,
            locationType: row.eventTypeLocationType,
            locationValue: row.eventTypeLocationValue,
          },
          ...(payload.rescheduleTarget ? { rescheduleTarget: payload.rescheduleTarget } : {}),
          providerClient: {
            createEvent: async () => {
              throw new Error('Calendar writeback is not configured.');
            },
            cancelEvent: async () => {
              throw new Error('Calendar writeback is not configured.');
            },
            updateEvent: async () => {
              throw new Error('Calendar writeback is not configured.');
            },
          },
          now,
        }),
      );
      continue;
    }

    const providerClient = buildCalendarWritebackProviderClient({
      db,
      now,
      provider,
      timezone,
      connectionId: row.connectionId,
      connectionAccessTokenEncrypted: row.connectionAccessTokenEncrypted,
      connectionRefreshTokenEncrypted: row.connectionRefreshTokenEncrypted,
      connectionAccessTokenExpiresAt: row.connectionAccessTokenExpiresAt,
      encryptionSecret,
      googleConfig,
      microsoftConfig,
    });

    await applyResult(
      await processCalendarWriteback({
        record: {
          operation,
          attemptCount: row.attemptCount,
          maxAttempts: row.maxAttempts > 0 ? row.maxAttempts : CALENDAR_WRITEBACK_DEFAULT_MAX_ATTEMPTS,
          externalEventId: row.externalEventId,
          idempotencyKey: `${row.provider}:${row.bookingId}`,
        },
        booking: {
          eventName: row.eventTypeName,
          inviteeName: row.bookingInviteeName,
          inviteeEmail: row.bookingInviteeEmail,
          startsAtIso: row.bookingStartsAt.toISOString(),
          endsAtIso: row.bookingEndsAt.toISOString(),
          timezone,
          locationType: row.eventTypeLocationType,
          locationValue: row.eventTypeLocationValue,
        },
        ...(payload.rescheduleTarget ? { rescheduleTarget: payload.rescheduleTarget } : {}),
        providerClient,
        now,
      }),
    );
  }

  return result;
};
