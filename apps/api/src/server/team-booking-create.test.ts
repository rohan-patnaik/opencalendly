import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildBookingCapWindowsForSlotMock,
  countConfirmedBookingsForEventTypeWindowMock,
  listTeamMemberSchedulesMock,
  resolveTeamRequestedSlotMock,
} = vi.hoisted(() => ({
  buildBookingCapWindowsForSlotMock: vi.fn(),
  countConfirmedBookingsForEventTypeWindowMock: vi.fn(),
  listTeamMemberSchedulesMock: vi.fn(),
  resolveTeamRequestedSlotMock: vi.fn(),
}));

vi.mock('../lib/booking-caps', () => ({
  buildBookingCapWindowsForSlot: buildBookingCapWindowsForSlotMock,
}));

vi.mock('./team-context', () => ({
  countConfirmedBookingsForEventTypeWindow: countConfirmedBookingsForEventTypeWindowMock,
  resolveTeamMode: (mode: string) => (mode === 'round_robin' || mode === 'collective' ? mode : null),
  toEventTypeBookingCaps: (eventType: {
    dailyBookingLimit?: number | null;
    weeklyBookingLimit?: number | null;
    monthlyBookingLimit?: number | null;
  }) => ({
    dailyBookingLimit: eventType.dailyBookingLimit ?? null,
    weeklyBookingLimit: eventType.weeklyBookingLimit ?? null,
    monthlyBookingLimit: eventType.monthlyBookingLimit ?? null,
  }),
}));

vi.mock('./team-schedules', () => ({
  listTeamMemberSchedules: listTeamMemberSchedulesMock,
  resolveTeamRequestedSlot: resolveTeamRequestedSlotMock,
}));

vi.mock('./notifications', () => ({
  enqueueScheduledNotificationsForBooking: vi.fn(),
}));

vi.mock('./demo-quota', () => ({
  consumeDemoFeatureCredits: vi.fn(),
}));

vi.mock('./database', () => ({
  isUniqueViolation: vi.fn(() => false),
}));

import { createTeamBooking } from './team-booking-create';

const createQueryResult = <T>(result: T) => {
  const query = {
    from: vi.fn(() => query),
    where: vi.fn(() => query),
    limit: vi.fn(async () => result),
    orderBy: vi.fn(async () => result),
  };

  return query;
};

describe('createTeamBooking', () => {
  beforeEach(() => {
    buildBookingCapWindowsForSlotMock.mockReset();
    countConfirmedBookingsForEventTypeWindowMock.mockReset();
    listTeamMemberSchedulesMock.mockReset();
    resolveTeamRequestedSlotMock.mockReset();
  });

  it('uses the organizer timezone when enforcing booking caps', async () => {
    buildBookingCapWindowsForSlotMock.mockReturnValue([
      {
        period: 'daily',
        limit: 1,
        startsAt: new Date('2026-03-01T05:00:00.000Z'),
        endsAt: new Date('2026-03-02T05:00:00.000Z'),
      },
    ]);
    listTeamMemberSchedulesMock.mockResolvedValue([
      {
        userId: 'member-1',
        timezone: 'America/New_York',
        rules: [],
        overrides: [],
        bookings: [],
      },
    ]);
    resolveTeamRequestedSlotMock.mockReturnValue({
      assignmentUserIds: ['member-1'],
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      nextRoundRobinCursor: 1,
      requestedEndsAtIso: '2026-03-02T00:30:00.000Z',
    });
    countConfirmedBookingsForEventTypeWindowMock.mockImplementation(async () => {
      throw new Error('stop-after-cap-check');
    });

    const selectMock = vi
      .fn()
      .mockImplementationOnce(() => createQueryResult([{ id: 'team-1', name: 'Customer Success' }]))
      .mockImplementationOnce(() => createQueryResult([{ userId: 'member-1' }]));

    const transaction = {
      select: selectMock,
      execute: vi.fn(async () => ({
        rows: [
          {
            teamEventTypeId: 'team-event-1',
            mode: 'round_robin',
            roundRobinCursor: 0,
            eventTypeId: 'event-1',
            eventTypeName: 'Team Intro',
            durationMinutes: 30,
            dailyBookingLimit: 1,
            weeklyBookingLimit: null,
            monthlyBookingLimit: null,
            locationType: 'video',
            locationValue: null,
            organizerTimezone: 'America/New_York',
            isActive: true,
            questions: [],
          },
        ],
      })),
    };

    const db = {
      transaction: async <T>(callback: (tx: typeof transaction) => Promise<T>) => callback(transaction),
    };

    await expect(
      createTeamBooking(db as never, {} as never, null, {
        teamSlug: 'customer-success',
        eventSlug: 'team-intro',
        startsAt: '2026-03-02T00:00:00.000Z',
        timezone: 'Asia/Kolkata',
        inviteeName: 'Pat Lee',
        inviteeEmail: 'pat@example.com',
      }),
    ).rejects.toThrow('stop-after-cap-check');

    expect(buildBookingCapWindowsForSlotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAtIso: '2026-03-02T00:00:00.000Z',
        timezone: 'America/New_York',
      }),
    );
  });
});
