import { and, eq, gt, lt, sql } from 'drizzle-orm';

import {
  availabilityOverrides,
  availabilityRules,
  bookingActionTokens,
  bookings,
} from '@opencalendly/db';

import {
  BookingNotFoundError,
  BookingUniqueConstraintError,
  commitBooking,
  type CommitBookingResult,
} from '../lib/booking';
import { countConfirmedBookingsForEventTypeWindow } from './team-context';
import { listExternalBusyWindowsForUser, listTimeOffBlocksForUser } from './team-schedules';
import { findPublicEventType } from './public-events';
import { enqueueScheduledNotificationsForBooking } from './notifications';
import { consumeDemoFeatureCredits } from './demo-quota';
import { isUniqueViolation } from './database';
import type { AuthenticatedUser, Bindings, Database, DemoQuotaDb } from './types';

type OneOnOneBookingInput = {
  username: string;
  eventSlug: string;
  startsAt: string;
  timezone: string;
  inviteeName: string;
  inviteeEmail: string;
  answers?: Record<string, string>;
};

export const createOneOnOneBooking = async (
  db: Database,
  env: Bindings,
  authedUser: AuthenticatedUser | null,
  input: OneOnOneBookingInput,
): Promise<CommitBookingResult & { queuedNotifications: number }> => {
  let queuedNotifications = 0;

  const result = await commitBooking(
    {
      getPublicEventType: async (username, eventSlug) => findPublicEventType(db, username, eventSlug),
      withEventTypeTransaction: async (eventTypeId, callback) => {
        return db.transaction(async (transaction) => {
          return callback({
            lockEventType: async (lockedEventTypeId) => {
              const locked = await transaction.execute<{ id: string; userId: string }>(
                sql`select id, user_id as "userId" from event_types where id = ${lockedEventTypeId} and is_active = true for update`,
              );
              if (!locked.rows[0] || locked.rows[0].id !== eventTypeId) {
                throw new BookingNotFoundError('Event type not found.');
              }
              await transaction.execute(sql`select id from users where id = ${locked.rows[0].userId} for update`);
            },
            listRules: async (userId) =>
              transaction
                .select({
                  dayOfWeek: availabilityRules.dayOfWeek,
                  startMinute: availabilityRules.startMinute,
                  endMinute: availabilityRules.endMinute,
                  bufferBeforeMinutes: availabilityRules.bufferBeforeMinutes,
                  bufferAfterMinutes: availabilityRules.bufferAfterMinutes,
                })
                .from(availabilityRules)
                .where(eq(availabilityRules.userId, userId)),
            listOverrides: async (userId, rangeStart, rangeEnd) => {
              const [overrides, userTimeOffBlocks] = await Promise.all([
                transaction
                  .select({
                    startAt: availabilityOverrides.startAt,
                    endAt: availabilityOverrides.endAt,
                    isAvailable: availabilityOverrides.isAvailable,
                  })
                  .from(availabilityOverrides)
                  .where(
                    and(
                      eq(availabilityOverrides.userId, userId),
                      lt(availabilityOverrides.startAt, rangeEnd),
                      gt(availabilityOverrides.endAt, rangeStart),
                    ),
                  ),
                listTimeOffBlocksForUser(transaction, userId, rangeStart, rangeEnd),
              ]);

              return [
                ...overrides,
                ...userTimeOffBlocks.map((block) => ({
                  startAt: block.startAt,
                  endAt: block.endAt,
                  isAvailable: false,
                })),
              ];
            },
            listExternalBusyWindows: async (userId, rangeStart, rangeEnd) =>
              listExternalBusyWindowsForUser(transaction, userId, rangeStart, rangeEnd),
            listConfirmedBookings: async (organizerId, rangeStart, rangeEnd) =>
              transaction
                .select({
                  id: bookings.id,
                  startsAt: bookings.startsAt,
                  endsAt: bookings.endsAt,
                  status: bookings.status,
                  metadata: bookings.metadata,
                })
                .from(bookings)
                .where(
                  and(
                    eq(bookings.organizerId, organizerId),
                    eq(bookings.status, 'confirmed'),
                    lt(bookings.startsAt, rangeEnd),
                    gt(bookings.endsAt, rangeStart),
                  ),
                ),
            countConfirmedEventTypeBookingsInWindow: async (countInput) =>
              countConfirmedBookingsForEventTypeWindow(transaction, countInput),
            insertActionTokens: async (bookingId, tokens) => {
              if (tokens.length === 0) {
                return;
              }
              await transaction.insert(bookingActionTokens).values(
                tokens.map((token) => ({
                  bookingId,
                  actionType: token.actionType,
                  tokenHash: token.tokenHash,
                  expiresAt: token.expiresAt,
                })),
              );
            },
            afterInsertBooking: async (booking) => {
              queuedNotifications = await enqueueScheduledNotificationsForBooking(transaction, {
                bookingId: booking.id,
                organizerId: booking.organizerId,
                eventTypeId: booking.eventTypeId,
                inviteeEmail: booking.inviteeEmail,
                inviteeName: booking.inviteeName,
                startsAt: booking.startsAt,
                endsAt: booking.endsAt,
              });

              if (authedUser) {
                await consumeDemoFeatureCredits(transaction as DemoQuotaDb, env, authedUser, {
                  featureKey: 'one_on_one_booking',
                  sourceKey: `booking:${booking.id}`,
                  metadata: {
                    username: input.username,
                    eventSlug: input.eventSlug,
                    bookingId: booking.id,
                  },
                  now: new Date(),
                });
              }
            },
            insertBooking: async (bookingInput) => {
              try {
                const [inserted] = await transaction
                  .insert(bookings)
                  .values({
                    eventTypeId: bookingInput.eventTypeId,
                    organizerId: bookingInput.organizerId,
                    inviteeName: bookingInput.inviteeName,
                    inviteeEmail: bookingInput.inviteeEmail,
                    startsAt: bookingInput.startsAt,
                    endsAt: bookingInput.endsAt,
                    metadata: bookingInput.metadata,
                  })
                  .returning({
                    id: bookings.id,
                    eventTypeId: bookings.eventTypeId,
                    organizerId: bookings.organizerId,
                    inviteeName: bookings.inviteeName,
                    inviteeEmail: bookings.inviteeEmail,
                    startsAt: bookings.startsAt,
                    endsAt: bookings.endsAt,
                  });

                if (!inserted) {
                  throw new Error('Insert failed.');
                }
                return inserted;
              } catch (error) {
                if (isUniqueViolation(error, 'bookings_unique_slot')) {
                  throw new BookingUniqueConstraintError('Slot already booked.');
                }
                throw error;
              }
            },
          });
        });
      },
    },
    input,
  );

  return { ...result, queuedNotifications };
};
