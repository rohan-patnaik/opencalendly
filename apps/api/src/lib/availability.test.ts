import { describe, expect, it } from 'vitest';

import { computeAvailabilitySlots } from './availability';

describe('computeAvailabilitySlots', () => {
  it('filters slots that overlap existing bookings plus buffers', () => {
    const slots = computeAvailabilitySlots({
      organizerTimezone: 'UTC',
      rangeStartIso: '2026-03-02T00:00:00.000Z',
      days: 1,
      durationMinutes: 30,
      rules: [
        {
          dayOfWeek: 1,
          startMinute: 540,
          endMinute: 660,
          bufferBeforeMinutes: 15,
          bufferAfterMinutes: 15,
        },
      ],
      overrides: [],
      bookings: [
        {
          startsAt: new Date('2026-03-02T09:30:00.000Z'),
          endsAt: new Date('2026-03-02T10:00:00.000Z'),
          status: 'confirmed',
        },
      ],
    });

    const startsAtList = slots.map((slot) => slot.startsAt);
    expect(startsAtList).not.toContain('2026-03-02T09:15:00.000Z');
    expect(startsAtList).not.toContain('2026-03-02T09:30:00.000Z');
    expect(startsAtList).toContain('2026-03-02T10:15:00.000Z');
  });

  it('adds slots from available date overrides even when weekly schedule is empty', () => {
    const slots = computeAvailabilitySlots({
      organizerTimezone: 'UTC',
      rangeStartIso: '2026-03-02T00:00:00.000Z',
      days: 1,
      durationMinutes: 30,
      rules: [],
      overrides: [
        {
          startAt: new Date('2026-03-02T14:00:00.000Z'),
          endAt: new Date('2026-03-02T15:00:00.000Z'),
          isAvailable: true,
        },
      ],
      bookings: [],
    });

    expect(slots.map((slot) => slot.startsAt)).toEqual([
      '2026-03-02T14:00:00.000Z',
      '2026-03-02T14:15:00.000Z',
      '2026-03-02T14:30:00.000Z',
    ]);
  });

  it('removes slots covered by blocking overrides', () => {
    const slots = computeAvailabilitySlots({
      organizerTimezone: 'UTC',
      rangeStartIso: '2026-03-02T00:00:00.000Z',
      days: 1,
      durationMinutes: 30,
      rules: [
        {
          dayOfWeek: 1,
          startMinute: 840,
          endMinute: 960,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
        },
      ],
      overrides: [
        {
          startAt: new Date('2026-03-02T14:45:00.000Z'),
          endAt: new Date('2026-03-02T15:45:00.000Z'),
          isAvailable: false,
        },
      ],
      bookings: [],
    });

    expect(slots.map((slot) => slot.startsAt)).toEqual([
      '2026-03-02T14:00:00.000Z',
      '2026-03-02T14:15:00.000Z',
    ]);
  });

  it('respects existing booking buffers saved in booking metadata', () => {
    const slots = computeAvailabilitySlots({
      organizerTimezone: 'UTC',
      rangeStartIso: '2026-03-02T00:00:00.000Z',
      days: 1,
      durationMinutes: 30,
      rules: [
        {
          dayOfWeek: 1,
          startMinute: 540,
          endMinute: 690,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
        },
      ],
      overrides: [],
      bookings: [
        {
          startsAt: new Date('2026-03-02T10:00:00.000Z'),
          endsAt: new Date('2026-03-02T10:30:00.000Z'),
          status: 'confirmed',
          metadata: JSON.stringify({
            bufferBeforeMinutes: 30,
            bufferAfterMinutes: 30,
          }),
        },
      ],
    });

    const startsAtList = slots.map((slot) => slot.startsAt);
    expect(startsAtList).toContain('2026-03-02T09:00:00.000Z');
    expect(startsAtList).not.toContain('2026-03-02T09:30:00.000Z');
    expect(startsAtList).not.toContain('2026-03-02T10:30:00.000Z');
  });
});
