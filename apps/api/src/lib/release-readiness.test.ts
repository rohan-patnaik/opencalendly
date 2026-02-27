import { randomUUID } from 'node:crypto';

import { and, eq, gte, lte } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  availabilityOverrides,
  availabilityRules,
  bookingActionTokens,
  bookings,
  calendarBusyWindows,
  calendarConnections,
  createDb,
  eventTypes,
  users,
} from '@opencalendly/db';

import { evaluateBookingActionToken } from './booking-actions';
import {
  BookingConflictError,
  commitBooking,
  BookingUniqueConstraintError,
  type BookingDataAccess,
  type PublicEventType,
} from './booking';
import { computeTeamAvailabilitySlots } from './team-scheduling';
import {
  buildWebhookEvent,
  buildWebhookSignatureHeader,
  computeNextWebhookAttemptAt,
  computeWebhookRetryDelaySeconds,
} from './webhooks';

const publicEventType: PublicEventType = {
  id: 'event-1',
  userId: 'user-1',
  slug: 'intro-call',
  name: 'Intro Call',
  durationMinutes: 30,
  locationType: 'video',
  locationValue: 'https://meet.example.com/demo',
  questions: [],
  isActive: true,
  organizerDisplayName: 'Demo Organizer',
  organizerEmail: 'demo@opencalendly.dev',
  organizerTimezone: 'UTC',
};

const weekdayRule = {
  dayOfWeek: 1,
  startMinute: 540,
  endMinute: 660,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
};

const buildBookingDataAccess = (options?: {
  existingBookings?: Array<{ startsAt: Date; endsAt: Date; status: string }>;
  externalBusyWindows?: Array<{ startsAt: Date; endsAt: Date }>;
}) => {
  const dataAccess: BookingDataAccess = {
    getPublicEventType: async () => publicEventType,
    withEventTypeTransaction: async (_eventTypeId, callback) => {
      return callback({
        lockEventType: async () => undefined,
        listRules: async () => [weekdayRule],
        listOverrides: async () => [],
        listExternalBusyWindows: async () => options?.externalBusyWindows ?? [],
        listConfirmedBookings: async () => options?.existingBookings ?? [],
        insertBooking: async () => ({
          id: 'booking-1',
          eventTypeId: 'event-1',
          organizerId: 'user-1',
          inviteeName: 'Pat Lee',
          inviteeEmail: 'pat@example.com',
          startsAt: new Date('2026-03-02T09:00:00.000Z'),
          endsAt: new Date('2026-03-02T09:30:00.000Z'),
        }),
        insertActionTokens: async () => undefined,
      });
    },
  };

  return dataAccess;
};

type Database = ReturnType<typeof createDb>['db'];

const buildDbBackedBookingDataAccess = (db: Database): BookingDataAccess => {
  return {
    getPublicEventType: async (username, eventSlug) => {
      const [row] = await db
        .select({
          id: eventTypes.id,
          userId: eventTypes.userId,
          slug: eventTypes.slug,
          name: eventTypes.name,
          durationMinutes: eventTypes.durationMinutes,
          locationType: eventTypes.locationType,
          locationValue: eventTypes.locationValue,
          questions: eventTypes.questions,
          isActive: eventTypes.isActive,
          organizerDisplayName: users.displayName,
          organizerEmail: users.email,
          organizerTimezone: users.timezone,
        })
        .from(eventTypes)
        .innerJoin(users, eq(users.id, eventTypes.userId))
        .where(and(eq(users.username, username), eq(eventTypes.slug, eventSlug)))
        .limit(1);

      return row ?? null;
    },
    withEventTypeTransaction: async (eventTypeId, callback) => {
      return db.transaction(async (transaction) => {
        return callback({
          lockEventType: async () => undefined,
          listRules: async (userId) => {
            return transaction.select().from(availabilityRules).where(eq(availabilityRules.userId, userId));
          },
          listOverrides: async (userId, rangeStart, rangeEnd) => {
            return transaction
              .select({
                startAt: availabilityOverrides.startAt,
                endAt: availabilityOverrides.endAt,
                isAvailable: availabilityOverrides.isAvailable,
              })
              .from(availabilityOverrides)
              .where(
                and(
                  eq(availabilityOverrides.userId, userId),
                  lte(availabilityOverrides.startAt, rangeEnd),
                  gte(availabilityOverrides.endAt, rangeStart),
                ),
              );
          },
          listExternalBusyWindows: async (userId, rangeStart, rangeEnd) => {
            return transaction
              .select({
                startsAt: calendarBusyWindows.startsAt,
                endsAt: calendarBusyWindows.endsAt,
              })
              .from(calendarBusyWindows)
              .where(
                and(
                  eq(calendarBusyWindows.userId, userId),
                  lte(calendarBusyWindows.startsAt, rangeEnd),
                  gte(calendarBusyWindows.endsAt, rangeStart),
                ),
              );
          },
          listConfirmedBookings: async (organizerId, rangeStart, rangeEnd) => {
            return transaction
              .select({
                startsAt: bookings.startsAt,
                endsAt: bookings.endsAt,
                status: bookings.status,
                metadata: bookings.metadata,
              })
              .from(bookings)
              .where(
                and(
                  eq(bookings.organizerId, organizerId),
                  lte(bookings.startsAt, rangeEnd),
                  gte(bookings.endsAt, rangeStart),
                ),
              );
          },
          insertBooking: async (input) => {
            try {
              const [created] = await transaction
                .insert(bookings)
                .values({
                  eventTypeId,
                  organizerId: input.organizerId,
                  inviteeName: input.inviteeName,
                  inviteeEmail: input.inviteeEmail,
                  startsAt: input.startsAt,
                  endsAt: input.endsAt,
                  status: 'confirmed',
                  metadata: input.metadata,
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

              if (!created) {
                throw new Error('Failed to create booking record.');
              }

              return created;
            } catch (error) {
              if (
                error &&
                typeof error === 'object' &&
                'code' in error &&
                (error as { code?: string }).code === '23505'
              ) {
                throw new BookingUniqueConstraintError('Slot already booked.');
              }
              throw error;
            }
          },
          insertActionTokens: async (bookingId, tokens) => {
            await transaction.insert(bookingActionTokens).values(
              tokens.map((token) => ({
                bookingId,
                actionType: token.actionType,
                tokenHash: token.tokenHash,
                expiresAt: token.expiresAt,
              })),
            );
          },
        });
      });
    },
  };
};

describe('release readiness', () => {
  it('covers one-on-one booking lifecycle happy path', async () => {
    const booking = await commitBooking(buildBookingDataAccess(), {
      username: 'demo',
      eventSlug: 'intro-call',
      startsAt: '2026-03-02T09:00:00.000Z',
      timezone: 'UTC',
      inviteeName: 'Pat Lee',
      inviteeEmail: 'pat@example.com',
    });

    expect(booking.booking.id).toBe('booking-1');
    expect(booking.actionTokens).toHaveLength(2);
    expect(
      evaluateBookingActionToken({
        actionType: 'cancel',
        bookingStatus: 'confirmed',
        expiresAt: new Date('2026-04-01T00:00:00.000Z'),
        consumedAt: null,
        now: new Date('2026-03-02T09:10:00.000Z'),
      }),
    ).toBe('usable');
    expect(
      evaluateBookingActionToken({
        actionType: 'cancel',
        bookingStatus: 'canceled',
        expiresAt: new Date('2026-04-01T00:00:00.000Z'),
        consumedAt: new Date('2026-03-02T10:00:00.000Z'),
        now: new Date('2026-03-02T10:01:00.000Z'),
      }),
    ).toBe('idempotent-replay');
  });

  it('covers team round-robin happy path assignment lifecycle', () => {
    const slots = computeTeamAvailabilitySlots({
      mode: 'round_robin',
      rangeStartIso: '2026-03-02T00:00:00.000Z',
      days: 1,
      durationMinutes: 30,
      roundRobinCursor: 0,
      members: [
        {
          userId: 'member-a',
          timezone: 'UTC',
          rules: [weekdayRule],
          overrides: [],
          bookings: [],
        },
        {
          userId: 'member-b',
          timezone: 'UTC',
          rules: [weekdayRule],
          overrides: [],
          bookings: [],
        },
      ],
    });

    expect(slots.slots[0]?.assignmentUserIds).toEqual(['member-a']);
    expect(slots.slots[1]?.assignmentUserIds).toEqual(['member-b']);
  });

  it('covers team collective happy path slot lifecycle', () => {
    const slots = computeTeamAvailabilitySlots({
      mode: 'collective',
      rangeStartIso: '2026-03-02T00:00:00.000Z',
      days: 1,
      durationMinutes: 30,
      members: [
        {
          userId: 'member-a',
          timezone: 'UTC',
          rules: [weekdayRule],
          overrides: [],
          bookings: [],
        },
        {
          userId: 'member-b',
          timezone: 'UTC',
          rules: [
            {
              dayOfWeek: 1,
              startMinute: 570,
              endMinute: 660,
              bufferBeforeMinutes: 0,
              bufferAfterMinutes: 0,
            },
          ],
          overrides: [],
          bookings: [],
        },
      ],
    });

    expect(slots.slots.length).toBeGreaterThan(0);
    expect(slots.slots.every((slot) => slot.assignmentUserIds.length === 2)).toBe(true);
  });

  it('covers webhook delivery and retry happy path behavior', () => {
    const event = buildWebhookEvent({
      type: 'booking.created',
      payload: {
        bookingId: '526c8230-6f9e-4332-81cb-2f6d3e3ef105',
        eventTypeId: '6f2799fb-f5ca-4f21-b0df-4b3f43a84d82',
        organizerId: '7f7a3e89-863a-4651-8ffc-8e28d6dc6fd2',
        inviteeEmail: 'pat@example.com',
        inviteeName: 'Pat Lee',
        startsAt: '2026-03-02T09:00:00.000Z',
        endsAt: '2026-03-02T09:30:00.000Z',
      },
    });

    expect(event.type).toBe('booking.created');
    const signature = buildWebhookSignatureHeader('whsec_test_secret', '{"ok":true}', 1_772_094_000);
    expect(signature).toContain('v1=');
    expect(computeWebhookRetryDelaySeconds(1)).toBe(30);
    expect(computeWebhookRetryDelaySeconds(2)).toBe(60);
    expect(computeNextWebhookAttemptAt(2, new Date('2026-03-02T09:00:00.000Z')).toISOString()).toBe(
      '2026-03-02T09:01:00.000Z',
    );
  });

  it('covers calendar sync conflict blocking during booking commit', async () => {
    await expect(
      commitBooking(
        buildBookingDataAccess({
          externalBusyWindows: [
            {
              startsAt: new Date('2026-03-02T09:00:00.000Z'),
              endsAt: new Date('2026-03-02T09:30:00.000Z'),
            },
          ],
        }),
        {
          username: 'demo',
          eventSlug: 'intro-call',
          startsAt: '2026-03-02T09:00:00.000Z',
          timezone: 'UTC',
          inviteeName: 'Pat Lee',
          inviteeEmail: 'pat@example.com',
        },
      ),
    ).rejects.toBeInstanceOf(BookingConflictError);
  });

  const dbIntegration = process.env.DATABASE_URL ? it : it.skip;
  dbIntegration('covers booking lifecycle and conflict blocking against a real database', async () => {
    const suffix = randomUUID();
    const userId = randomUUID();
    const eventTypeId = randomUUID();
    const connectionId = randomUUID();
    const username = `release-${suffix.slice(0, 8)}`;
    const now = new Date();

    const { client, db } = createDb(process.env.DATABASE_URL, { enforceNeon: false });
    await client.connect();
    try {
      await db.insert(users).values({
        id: userId,
        email: `${username}@example.com`,
        username,
        displayName: 'Release Readiness Organizer',
        timezone: 'UTC',
      });

      await db.insert(eventTypes).values({
        id: eventTypeId,
        userId,
        slug: 'integration-intro',
        name: 'Integration Intro',
        durationMinutes: 30,
        locationType: 'video',
        locationValue: 'https://meet.example.com/integration',
        questions: [],
        isActive: true,
      });

      await db.insert(availabilityRules).values({
        userId,
        dayOfWeek: 1,
        startMinute: 540,
        endMinute: 660,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
      });

      await db.insert(calendarConnections).values({
        id: connectionId,
        userId,
        provider: 'google',
        accessTokenEncrypted: 'enc-access-token',
        refreshTokenEncrypted: 'enc-refresh-token',
        accessTokenExpiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      });

      const bookingDataAccess = buildDbBackedBookingDataAccess(db);

      const created = await commitBooking(bookingDataAccess, {
        username,
        eventSlug: 'integration-intro',
        startsAt: '2026-03-02T09:00:00.000Z',
        timezone: 'UTC',
        inviteeName: 'Pat Lee',
        inviteeEmail: 'pat@example.com',
      });
      expect(created.booking.organizerId).toBe(userId);

      await expect(
        commitBooking(bookingDataAccess, {
          username,
          eventSlug: 'integration-intro',
          startsAt: '2026-03-02T09:00:00.000Z',
          timezone: 'UTC',
          inviteeName: 'Pat Lee',
          inviteeEmail: 'pat@example.com',
        }),
      ).rejects.toBeInstanceOf(BookingConflictError);

      await db.insert(calendarBusyWindows).values({
        connectionId,
        userId,
        provider: 'google',
        startsAt: new Date('2026-03-02T09:30:00.000Z'),
        endsAt: new Date('2026-03-02T10:00:00.000Z'),
      });

      await expect(
        commitBooking(bookingDataAccess, {
          username,
          eventSlug: 'integration-intro',
          startsAt: '2026-03-02T09:30:00.000Z',
          timezone: 'UTC',
          inviteeName: 'Pat Lee',
          inviteeEmail: 'pat@example.com',
        }),
      ).rejects.toBeInstanceOf(BookingConflictError);
    } finally {
      await db.delete(users).where(eq(users.id, userId));
      await client.end();
    }
  });
});
