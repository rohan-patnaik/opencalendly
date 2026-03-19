import { describe, expect, it } from 'vitest';

import {
  BookingConflictError,
  BookingUniqueConstraintError,
  commitBooking,
  type BookingDataAccess,
  normalizeBookingAnswersForIdempotency,
  type PublicEventType,
} from './booking';

const publicEventType: PublicEventType = {
  id: 'event-1',
  userId: 'user-1',
  slug: 'intro-call',
  name: 'Intro Call',
  durationMinutes: 30,
  dailyBookingLimit: null,
  weeklyBookingLimit: null,
  monthlyBookingLimit: null,
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
  externalBusyWindows?: Array<{ startsAt: Date; endsAt: Date }>;
  overrides?: Array<{ startAt: Date; endAt: Date; isAvailable: boolean }>;
  throwUniqueConflict?: boolean;
  eventTypeWindowBookingCount?: number;
  eventTypeWindowBookings?: Date[];
  eventType?: PublicEventType | null;
}) => {
  let insertCount = 0;
  let actionTokenInsertCount = 0;
  let transactionCount = 0;
  let insertedMetadata: string | null = null;

  const dataAccess: BookingDataAccess = {
    getPublicEventType: async () => options?.eventType ?? publicEventType,
    withEventTypeTransaction: async (_eventTypeId, callback) => {
      transactionCount += 1;
      return callback({
        lockEventType: async () => undefined,
        listRules: async () => weeklyRules,
        listOverrides: async () => options?.overrides ?? [],
        listExternalBusyWindows: async () => options?.externalBusyWindows ?? [],
        listConfirmedBookings: async () => options?.existingBookings ?? [],
        countConfirmedEventTypeBookingsInWindow: async ({ startsAt, endsAt }) => {
          if (options?.eventTypeWindowBookings) {
            return options.eventTypeWindowBookings.filter(
              (bookingStartsAt) => bookingStartsAt >= startsAt && bookingStartsAt < endsAt,
            ).length;
          }
          return options?.eventTypeWindowBookingCount ?? 0;
        },
        insertBooking: async (bookingInput) => {
          if (options?.throwUniqueConflict) {
            throw new BookingUniqueConstraintError('duplicate slot');
          }

          insertCount += 1;
          insertedMetadata = bookingInput.metadata;
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
    getInsertedMetadata: () => insertedMetadata,
  };
};

describe('commitBooking', () => {
  it('canonicalizes booking answers for idempotency hashing without changing validation behavior', () => {
    expect(
      normalizeBookingAnswersForIdempotency({
        company: '  Acme  ',
        notes: '   ',
        agenda: '\n Roadmap review\t',
      }),
    ).toEqual({
      agenda: 'Roadmap review',
      company: 'Acme',
    });
  });

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

  it('rejects booking when external calendar busy windows overlap the slot', async () => {
    const harness = buildDataAccess({
      externalBusyWindows: [
        {
          startsAt: new Date('2026-03-02T09:00:00.000Z'),
          endsAt: new Date('2026-03-02T09:30:00.000Z'),
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

  it('rejects booking when blocking time-off overrides overlap the slot', async () => {
    const harness = buildDataAccess({
      overrides: [
        {
          startAt: new Date('2026-03-02T08:45:00.000Z'),
          endAt: new Date('2026-03-02T09:45:00.000Z'),
          isAvailable: false,
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

  it('rejects booking when event-type daily cap is reached', async () => {
    const harness = buildDataAccess({
      eventTypeWindowBookingCount: 2,
      eventType: {
        ...publicEventType,
        dailyBookingLimit: 2,
      },
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

  it('allows booking when an existing booking is exactly at cap window end boundary', async () => {
    const harness = buildDataAccess({
      eventType: {
        ...publicEventType,
        dailyBookingLimit: 2,
      },
      eventTypeWindowBookings: [
        new Date('2026-03-02T02:00:00.000Z'),
        new Date('2026-03-03T00:00:00.000Z'), // exactly at next-day boundary; should not count
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
    ).resolves.toBeDefined();

    expect(harness.getInsertCount()).toBe(1);
  });

  it('rejects booking when a required configured question is missing', async () => {
    const harness = buildDataAccess({
      eventType: {
        ...publicEventType,
        questions: [{ id: 'company', label: 'Company', required: true }],
      },
    });

    await expect(
      commitBooking(harness.dataAccess, {
        username: 'demo',
        eventSlug: 'intro-call',
        startsAt: '2026-03-02T09:00:00.000Z',
        timezone: 'UTC',
        inviteeName: 'Pat Lee',
        inviteeEmail: 'pat@example.com',
        answers: {},
      }),
    ).rejects.toThrow('Answer required question: "Company".');
  });

  it('rejects booking when an unknown answer key is submitted', async () => {
    const harness = buildDataAccess({
      eventType: {
        ...publicEventType,
        questions: [{ id: 'company', label: 'Company', required: false }],
      },
    });

    await expect(
      commitBooking(harness.dataAccess, {
        username: 'demo',
        eventSlug: 'intro-call',
        startsAt: '2026-03-02T09:00:00.000Z',
        timezone: 'UTC',
        inviteeName: 'Pat Lee',
        inviteeEmail: 'pat@example.com',
        answers: { teamSize: '50' },
      }),
    ).rejects.toThrow('Unknown booking question: "teamSize".');
  });

  it('persists only trimmed answers for configured questions', async () => {
    const harness = buildDataAccess({
      eventType: {
        ...publicEventType,
        questions: [
          { id: 'company', label: 'Company', required: true },
          { id: 'notes', label: 'Notes', required: false },
        ],
      },
    });

    await expect(
      commitBooking(harness.dataAccess, {
        username: 'demo',
        eventSlug: 'intro-call',
        startsAt: '2026-03-02T09:00:00.000Z',
        timezone: 'UTC',
        inviteeName: 'Pat Lee',
        inviteeEmail: 'pat@example.com',
        answers: {
          company: '  Acme  ',
          notes: '   ',
        },
      }),
    ).resolves.toBeDefined();

    expect(JSON.parse(harness.getInsertedMetadata() ?? '{}')).toMatchObject({
      answers: { company: 'Acme' },
    });
  });
});
