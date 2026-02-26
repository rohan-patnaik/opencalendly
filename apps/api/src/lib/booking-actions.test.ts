import { describe, expect, it } from 'vitest';

import {
  evaluateBookingActionToken,
  parseBookingMetadata,
  resolveRequestedRescheduleSlot,
} from './booking-actions';

describe('booking action helpers', () => {
  it('marks unconsumed confirmed-action tokens as usable', () => {
    const state = evaluateBookingActionToken({
      actionType: 'cancel',
      bookingStatus: 'confirmed',
      expiresAt: new Date('2026-04-01T00:00:00.000Z'),
      consumedAt: null,
      now: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(state).toBe('usable');
  });

  it('marks consumed canceled tokens as idempotent replay', () => {
    const state = evaluateBookingActionToken({
      actionType: 'cancel',
      bookingStatus: 'canceled',
      expiresAt: new Date('2026-04-01T00:00:00.000Z'),
      consumedAt: new Date('2026-03-01T00:10:00.000Z'),
      now: new Date('2026-03-01T00:11:00.000Z'),
    });

    expect(state).toBe('idempotent-replay');
  });

  it('marks expired action tokens as gone', () => {
    const state = evaluateBookingActionToken({
      actionType: 'reschedule',
      bookingStatus: 'confirmed',
      expiresAt: new Date('2026-03-01T00:00:00.000Z'),
      consumedAt: null,
      now: new Date('2026-03-01T00:00:01.000Z'),
    });

    expect(state).toBe('gone');
  });

  it('extracts booking metadata answers and timezone safely', () => {
    const parsed = parseBookingMetadata(
      JSON.stringify({
        answers: {
          company: 'Acme',
          teamSize: '50',
        },
        timezone: 'Asia/Kolkata',
      }),
      (timezone) => timezone ?? 'UTC',
    );

    expect(parsed.answers.company).toBe('Acme');
    expect(parsed.timezone).toBe('Asia/Kolkata');
  });

  it('finds requested reschedule slot when available', () => {
    const result = resolveRequestedRescheduleSlot({
      requestedStartsAtIso: '2026-03-02T09:00:00.000Z',
      durationMinutes: 30,
      organizerTimezone: 'UTC',
      rules: [
        {
          dayOfWeek: 1,
          startMinute: 540,
          endMinute: 660,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
        },
      ],
      overrides: [],
      bookings: [],
    });

    expect(result?.matchingSlot.startsAt).toBe('2026-03-02T09:00:00.000Z');
    expect(result?.matchingSlot.endsAt).toBe('2026-03-02T09:30:00.000Z');
  });

  it('returns null for conflicting reschedule slot', () => {
    const result = resolveRequestedRescheduleSlot({
      requestedStartsAtIso: '2026-03-02T09:00:00.000Z',
      durationMinutes: 30,
      organizerTimezone: 'UTC',
      rules: [
        {
          dayOfWeek: 1,
          startMinute: 540,
          endMinute: 660,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
        },
      ],
      overrides: [],
      bookings: [
        {
          startsAt: new Date('2026-03-02T09:00:00.000Z'),
          endsAt: new Date('2026-03-02T09:30:00.000Z'),
          status: 'confirmed',
          metadata: null,
        },
      ],
    });

    expect(result).toBeNull();
  });
});
