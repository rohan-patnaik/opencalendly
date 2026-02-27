import { describe, expect, it } from 'vitest';

import { evaluateBookingActionToken } from './booking-actions';
import {
  BookingConflictError,
  commitBooking,
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
});
