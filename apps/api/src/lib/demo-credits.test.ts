import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DEMO_DAILY_PASS_LIMIT,
  buildDemoCreditsStatus,
  consumeDemoCreditFromState,
  parseDemoDailyPassLimit,
  toUtcDateKey,
} from './demo-credits';

describe('demo credits helpers', () => {
  it('builds UTC date key from date', () => {
    expect(toUtcDateKey(new Date('2026-02-26T23:59:59.000Z'))).toBe('2026-02-26');
  });

  it('uses default limit for empty env value', () => {
    expect(parseDemoDailyPassLimit(undefined)).toBe(DEFAULT_DEMO_DAILY_PASS_LIMIT);
  });

  it('clamps parsed limit to lower bound', () => {
    expect(parseDemoDailyPassLimit('0')).toBe(1);
  });

  it('computes remaining and exhausted status', () => {
    expect(
      buildDemoCreditsStatus({
        date: '2026-02-26',
        dailyLimit: 10,
        used: 10,
      }),
    ).toMatchObject({
      remaining: 0,
      isExhausted: true,
    });
  });

  it('consumes one pass when available', () => {
    const result = consumeDemoCreditFromState({
      date: '2026-02-26',
      dailyLimit: 10,
      used: 3,
    });

    expect(result.consumed).toBe(true);
    expect(result.status.used).toBe(4);
    expect(result.status.remaining).toBe(6);
  });

  it('does not consume when exhausted', () => {
    const result = consumeDemoCreditFromState({
      date: '2026-02-26',
      dailyLimit: 2,
      used: 2,
    });

    expect(result.consumed).toBe(false);
    expect(result.status.used).toBe(2);
    expect(result.status.remaining).toBe(0);
  });
});
