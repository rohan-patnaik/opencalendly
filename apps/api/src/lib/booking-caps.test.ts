import { describe, expect, it } from 'vitest';

import {
  buildBookingCapUsage,
  buildBookingCapWindowsForSlot,
  filterSlotsByBookingCaps,
  hasBookingCaps,
  isSlotAllowedByBookingCaps,
  resolveBookingCapUsageRange,
} from './booking-caps';

describe('booking cap helpers', () => {
  it('detects when any cap is configured', () => {
    expect(
      hasBookingCaps({
        dailyBookingLimit: null,
        weeklyBookingLimit: null,
        monthlyBookingLimit: null,
      }),
    ).toBe(false);

    expect(
      hasBookingCaps({
        dailyBookingLimit: 5,
        weeklyBookingLimit: null,
        monthlyBookingLimit: null,
      }),
    ).toBe(true);
  });

  it('builds usage maps and enforces per-day cap in local timezone', () => {
    const usage = buildBookingCapUsage(
      [
        { startsAt: new Date('2026-03-02T08:00:00.000Z') },
        { startsAt: new Date('2026-03-02T09:00:00.000Z') },
      ],
      'UTC',
    );

    expect(
      isSlotAllowedByBookingCaps({
        startsAtIso: '2026-03-02T10:00:00.000Z',
        timezone: 'UTC',
        caps: {
          dailyBookingLimit: 2,
          weeklyBookingLimit: null,
          monthlyBookingLimit: null,
        },
        usage,
      }),
    ).toBe(false);
  });

  it('filters availability slots when cap is already reached', () => {
    const usage = buildBookingCapUsage([{ startsAt: new Date('2026-03-02T08:00:00.000Z') }], 'UTC');
    const filtered = filterSlotsByBookingCaps({
      slots: [
        { startsAt: '2026-03-02T09:00:00.000Z', endsAt: '2026-03-02T09:30:00.000Z' },
        { startsAt: '2026-03-03T09:00:00.000Z', endsAt: '2026-03-03T09:30:00.000Z' },
      ],
      timezone: 'UTC',
      caps: {
        dailyBookingLimit: 1,
        weeklyBookingLimit: null,
        monthlyBookingLimit: null,
      },
      usage,
    });

    expect(filtered.map((slot) => slot.startsAt)).toEqual(['2026-03-03T09:00:00.000Z']);
  });

  it('builds cap windows for commit-time checks', () => {
    const windows = buildBookingCapWindowsForSlot({
      startsAtIso: '2026-03-10T09:00:00.000Z',
      timezone: 'UTC',
      caps: {
        dailyBookingLimit: 2,
        weeklyBookingLimit: 5,
        monthlyBookingLimit: 10,
      },
    });

    expect(windows).toHaveLength(3);
    expect(windows.map((window) => window.period)).toEqual(['daily', 'weekly', 'monthly']);
  });

  it('expands usage query range for weekly and monthly caps', () => {
    const range = resolveBookingCapUsageRange({
      rangeStartIso: '2026-03-11T00:00:00.000Z',
      days: 3,
      timezone: 'UTC',
      caps: {
        dailyBookingLimit: null,
        weeklyBookingLimit: 4,
        monthlyBookingLimit: 8,
      },
    });

    expect(range).not.toBeNull();
    expect(range?.startsAt.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(range?.endsAt.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });
});
