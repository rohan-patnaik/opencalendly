import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createIdempotencyKey,
  formatDayLabel,
  formatSlot,
  getBrowserTimezone,
  groupSlotsByDay,
} from './public-booking';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('groupSlotsByDay', () => {
  it('groups and sorts slots by local date/time', () => {
    const result = groupSlotsByDay(
      [
        { startsAt: '2026-03-01T11:00:00.000Z', endsAt: '2026-03-01T11:30:00.000Z' },
        { startsAt: '2026-03-01T10:00:00.000Z', endsAt: '2026-03-01T10:30:00.000Z' },
      ],
      'UTC',
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.slots.map((slot) => slot.startsAt)).toEqual([
      '2026-03-01T10:00:00.000Z',
      '2026-03-01T11:00:00.000Z',
    ]);
  });
});

describe('getBrowserTimezone', () => {
  it('returns browser timezone when window is available', () => {
    vi.stubGlobal('window', {});
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: 'Asia/Kolkata',
    } as Intl.ResolvedDateTimeFormatOptions);

    expect(getBrowserTimezone()).toBe('Asia/Kolkata');
  });
});

describe('format helpers', () => {
  it('formats a slot timestamp in the selected timezone', () => {
    const isoDate = '2026-03-01T10:00:00.000Z';
    const timezone = 'UTC';

    expect(formatSlot(isoDate, timezone)).toBe(
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: timezone,
      }).format(new Date(isoDate)),
    );
  });

  it('formats a day label in the selected timezone', () => {
    const isoDate = '2026-03-01T10:00:00.000Z';
    const timezone = 'UTC';

    expect(formatDayLabel(isoDate, timezone)).toBe(
      new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: timezone,
      }).format(new Date(isoDate)),
    );
  });
});

describe('createIdempotencyKey', () => {
  it('uses crypto.randomUUID when available', () => {
    const randomUUID = vi.fn(() => 'd95ecf84-4248-4f50-85c4-cbf199f4f0f4');
    vi.stubGlobal('crypto', { randomUUID });

    const key = createIdempotencyKey();
    expect(key).toBe('d95ecf84-4248-4f50-85c4-cbf199f4f0f4');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('falls back when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', undefined);

    const key = createIdempotencyKey();
    expect(key.startsWith('fallback-')).toBe(true);
  });
});
