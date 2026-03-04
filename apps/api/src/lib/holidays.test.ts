import { describe, expect, it } from 'vitest';

import { buildHolidayTimeOffWindows } from './holidays';

describe('buildHolidayTimeOffWindows', () => {
  it('builds windows with locale-prefixed source keys', () => {
    const windows = buildHolidayTimeOffWindows({
      locale: 'IN',
      year: 2026,
      timezone: 'Asia/Kolkata',
    });
    const firstWindow = windows[0];

    expect(windows.length).toBeGreaterThan(0);
    expect(firstWindow).toBeDefined();
    expect(firstWindow?.sourceKey.startsWith('IN:')).toBe(true);
    expect(firstWindow?.endAt.getTime()).toBeGreaterThan(firstWindow?.startAt.getTime() ?? 0);
  });

  it('falls back to UTC for invalid timezone input', () => {
    const windows = buildHolidayTimeOffWindows({
      locale: 'US',
      year: 2026,
      timezone: 'Invalid/Zone',
    });
    const firstWindow = windows[0];

    expect(windows.length).toBeGreaterThan(0);
    expect(firstWindow).toBeDefined();
    expect(firstWindow?.sourceKey.startsWith('US:')).toBe(true);
    expect(firstWindow?.startAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('produces stable source keys for repeated imports (idempotent keying)', () => {
    const firstPass = buildHolidayTimeOffWindows({
      locale: 'IN',
      year: 2027,
      timezone: 'Asia/Kolkata',
    });
    const secondPass = buildHolidayTimeOffWindows({
      locale: 'IN',
      year: 2027,
      timezone: 'Asia/Kolkata',
    });

    expect(firstPass.map((window) => window.sourceKey)).toEqual(
      secondPass.map((window) => window.sourceKey),
    );
  });
});
