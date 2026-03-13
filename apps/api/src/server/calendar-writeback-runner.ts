import { and, asc, eq, inArray } from 'drizzle-orm';

import {
  bookingExternalEvents,
  bookings,
  calendarConnections,
  eventTypes,
  users,
} from '@opencalendly/db';

import { parseBookingMetadata } from '../lib/booking-actions';
import { encryptSecret } from '../lib/calendar-crypto';
import { processCalendarWriteback } from '../lib/calendar-writeback';
import {
  resolveGoogleAccessToken,
  resolveMicrosoftAccessToken,
} from '../lib/calendar-sync';
import {
  cancelGoogleCalendarEvent,
  createGoogleCalendarEvent,
  findGoogleCalendarEventByIdempotencyKey,
  updateGoogleCalendarEvent,
} from '../lib/google-calendar';
import {
  cancelMicrosoftCalendarEvent,
  createMicrosoftCalendarEvent,
  findMicrosoftCalendarEventByIdempotencyKey,
  updateMicrosoftCalendarEvent,
} from '../lib/microsoft-calendar';
import { normalizeTimezone } from './core';
import {
  CALENDAR_WRITEBACK_DEFAULT_MAX_ATTEMPTS,
  GOOGLE_CALENDAR_PROVIDER,
  resolveCalendarEncryptionSecret,
  resolveGoogleOAuthConfig,
  resolveMicrosoftOAuthConfig,
  toCalendarProvider,
} from './env';
import {
  claimDueCalendarWritebackRowIds,
  parseCalendarWritebackPayload,
} from './calendar-writeback-queue';
import type { Bindings, CalendarWritebackOperation, Database } from './types';

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
        provider
      ) {
        const [targetRow] = await db
          .select({ id: bookingExternalEvents.id })
          .from(bookingExternalEvents)
          .where(
            and(
              eq(bookingExternalEvents.bookingId, writebackResult.transferExternalEventToBookingId),
              eq(bookingExternalEvents.provider, provider),
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

    const connectionId = row.connectionId;
    const connectionAccessTokenEncrypted = row.connectionAccessTokenEncrypted;
    const connectionRefreshTokenEncrypted = row.connectionRefreshTokenEncrypted;
    const connectionAccessTokenExpiresAt = row.connectionAccessTokenExpiresAt;

    const getToken = async (): Promise<string> => {
      if (provider === GOOGLE_CALENDAR_PROVIDER) {
        if (!googleConfig) {
          throw new Error('Google OAuth is not configured for calendar writeback.');
        }
        const resolved = await resolveGoogleAccessToken({
          connection: {
            accessTokenEncrypted: connectionAccessTokenEncrypted,
            refreshTokenEncrypted: connectionRefreshTokenEncrypted,
            accessTokenExpiresAt: connectionAccessTokenExpiresAt,
          },
          encryptionSecret,
          clientId: googleConfig.clientId,
          clientSecret: googleConfig.clientSecret,
          now,
        });
        await db
          .update(calendarConnections)
          .set({
            accessTokenEncrypted: encryptSecret(resolved.accessToken, encryptionSecret),
            refreshTokenEncrypted: encryptSecret(resolved.refreshToken, encryptionSecret),
            accessTokenExpiresAt: resolved.accessTokenExpiresAt,
            lastError: null,
            updatedAt: now,
          })
          .where(eq(calendarConnections.id, connectionId));
        return resolved.accessToken;
      }

      if (!microsoftConfig) {
        throw new Error('Microsoft OAuth is not configured for calendar writeback.');
      }
      const resolved = await resolveMicrosoftAccessToken({
        connection: {
          accessTokenEncrypted: connectionAccessTokenEncrypted,
          refreshTokenEncrypted: connectionRefreshTokenEncrypted,
          accessTokenExpiresAt: connectionAccessTokenExpiresAt,
        },
        encryptionSecret,
        clientId: microsoftConfig.clientId,
        clientSecret: microsoftConfig.clientSecret,
        now,
      });
      await db
        .update(calendarConnections)
        .set({
          accessTokenEncrypted: encryptSecret(resolved.accessToken, encryptionSecret),
          refreshTokenEncrypted: encryptSecret(resolved.refreshToken, encryptionSecret),
          accessTokenExpiresAt: resolved.accessTokenExpiresAt,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(calendarConnections.id, connectionId));
      return resolved.accessToken;
    };

    const providerClient = {
      createEvent: async (bookingContext: {
        idempotencyKey: string;
        eventName: string;
        inviteeName: string;
        inviteeEmail: string;
        startsAtIso: string;
        endsAtIso: string;
        timezone: string;
        locationType: string;
        locationValue: string | null;
      }) => {
        const accessToken = await getToken();
        return provider === GOOGLE_CALENDAR_PROVIDER
          ? createGoogleCalendarEvent({ accessToken, ...bookingContext })
          : createMicrosoftCalendarEvent({
              accessToken,
              idempotencyKey: bookingContext.idempotencyKey,
              eventName: bookingContext.eventName,
              inviteeName: bookingContext.inviteeName,
              inviteeEmail: bookingContext.inviteeEmail,
              startsAtIso: bookingContext.startsAtIso,
              endsAtIso: bookingContext.endsAtIso,
              locationValue: bookingContext.locationValue,
            });
      },
      findEventByIdempotencyKey: async ({ idempotencyKey }: { idempotencyKey: string }) => {
        const accessToken = await getToken();
        return provider === GOOGLE_CALENDAR_PROVIDER
          ? findGoogleCalendarEventByIdempotencyKey({ accessToken, idempotencyKey })
          : findMicrosoftCalendarEventByIdempotencyKey({ accessToken, idempotencyKey });
      },
      cancelEvent: async ({ externalEventId }: { externalEventId: string }) => {
        const accessToken = await getToken();
        if (provider === GOOGLE_CALENDAR_PROVIDER) {
          await cancelGoogleCalendarEvent({ accessToken, externalEventId });
          return;
        }
        await cancelMicrosoftCalendarEvent({ accessToken, externalEventId });
      },
      updateEvent: async (updateInput: {
        externalEventId: string;
        startsAtIso: string;
        endsAtIso: string;
      }) => {
        const accessToken = await getToken();
        if (provider === GOOGLE_CALENDAR_PROVIDER) {
          await updateGoogleCalendarEvent({ accessToken, timezone, ...updateInput });
          return;
        }
        await updateMicrosoftCalendarEvent({ accessToken, ...updateInput });
      },
    };

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
