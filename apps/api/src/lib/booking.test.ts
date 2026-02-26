import { describe, expect, it } from 'vitest';

import {
  BookingConflictError,
  BookingUniqueConstraintError,
  commitBooking,
  type BookingDataAccess,
  type PublicEventType,
} from './booking';

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

const weeklyRules = [
  {
    dayOfWeek: 1,
    startMinute: 540,
    endMinute: 660,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
  },
];

const buildDataAccess = (options?: {
  existingBookings?: Array<{ startsAt: Date; endsAt: Date; status: string }>;
  throwUniqueConflict?: boolean;
  eventType?: PublicEventType | null;
}) => {
  let insertCount = 0;
  let actionTokenInsertCount = 0;
  let transactionCount = 0;

  const dataAccess: BookingDataAccess = {
    getPublicEventType: async () => options?.eventType ?? publicEventType,
    withEventTypeTransaction: async (_eventTypeId, callback) => {
      transactionCount += 1;
      return callback({
        lockEventType: async () => undefined,
        listRules: async () => weeklyRules,
        listOverrides: async () => [],
        listConfirmedBookings: async () => options?.existingBookings ?? [],
        insertBooking: async () => {
          if (options?.throwUniqueConflict) {
            throw new BookingUniqueConstraintError('duplicate slot');
          }

          insertCount += 1;
          return {
            id: 'booking-1',
            eventTypeId: 'event-1',
            organizerId: 'user-1',
            inviteeName: 'Pat Lee',
            inviteeEmail: 'pat@example.com',
            startsAt: new Date('2026-03-02T09:00:00.000Z'),
            endsAt: new Date('2026-03-02T09:30:00.000Z'),
          };
        },
        insertActionTokens: async (_bookingId, tokens) => {
          actionTokenInsertCount += tokens.length;
        },
      });
    },
  };

  return {
    dataAccess,
    getInsertCount: () => insertCount,
    getActionTokenInsertCount: () => actionTokenInsertCount,
    getTransactionCount: () => transactionCount,
  };
};

describe('commitBooking', () => {
  it('commits booking when slot stays available inside transaction', async () => {
    const harness = buildDataAccess();

    const result = await commitBooking(harness.dataAccess, {
      username: 'demo',
      eventSlug: 'intro-call',
      startsAt: '2026-03-02T09:00:00.000Z',
      timezone: 'UTC',
      inviteeName: 'Pat Lee',
      inviteeEmail: 'pat@example.com',
    });

    expect(result.booking.id).toBe('booking-1');
    expect(result.actionTokens).toHaveLength(2);
    expect(harness.getTransactionCount()).toBe(1);
    expect(harness.getInsertCount()).toBe(1);
    expect(harness.getActionTokenInsertCount()).toBe(2);
  });

  it('rejects booking if the requested slot is unavailable at commit time', async () => {
    const harness = buildDataAccess({
      existingBookings: [
        {
          startsAt: new Date('2026-03-02T09:00:00.000Z'),
          endsAt: new Date('2026-03-02T09:30:00.000Z'),
          status: 'confirmed',
        },
      ],
    });

    await expect(
      commitBooking(harness.dataAccess, {
        username: 'demo',
        eventSlug: 'intro-call',
        startsAt: '2026-03-02T09:00:00.000Z',
        timezone: 'UTC',
        inviteeName: 'Pat Lee',
        inviteeEmail: 'pat@example.com',
      }),
    ).rejects.toBeInstanceOf(BookingConflictError);

    expect(harness.getInsertCount()).toBe(0);
  });

  it('maps unique constraint collisions to booking conflict errors', async () => {
    const harness = buildDataAccess({ throwUniqueConflict: true });

    await expect(
      commitBooking(harness.dataAccess, {
        username: 'demo',
        eventSlug: 'intro-call',
        startsAt: '2026-03-02T09:00:00.000Z',
        timezone: 'UTC',
        inviteeName: 'Pat Lee',
        inviteeEmail: 'pat@example.com',
      }),
    ).rejects.toBeInstanceOf(BookingConflictError);
  });
});
