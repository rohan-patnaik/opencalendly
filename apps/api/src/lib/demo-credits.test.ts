import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DEMO_DAILY_ACCOUNT_LIMIT,
  DEFAULT_DEMO_DAILY_CREDIT_LIMIT,
  buildDemoAccountStatus,
  buildDemoAdmissionsStatus,
  buildDemoQuotaResetAt,
  buildDemoQuotaStatus,
  getDemoFeatureCost,
  isLaunchDemoTeamSlug,
  isLaunchDemoUsername,
  parseDemoBypassEmails,
  parseDemoDailyAccountLimit,
  parseDemoDailyCreditLimit,
  toUtcDateKey,
} from './demo-credits';

describe('demo quota helpers', () => {
  it('builds UTC date key from date', () => {
    expect(toUtcDateKey(new Date('2026-02-26T23:59:59.000Z'))).toBe('2026-02-26');
  });

  it('builds reset timestamp for the next UTC day', () => {
    expect(buildDemoQuotaResetAt('2026-02-26')).toBe('2026-02-27T00:00:00.000Z');
  });

  it('uses the default daily account limit when env is empty', () => {
    expect(parseDemoDailyAccountLimit(undefined)).toBe(DEFAULT_DEMO_DAILY_ACCOUNT_LIMIT);
  });

  it('uses the default daily credit limit when env is empty', () => {
    expect(parseDemoDailyCreditLimit(undefined)).toBe(DEFAULT_DEMO_DAILY_CREDIT_LIMIT);
  });

  it('falls back when daily quota env values are malformed', () => {
    expect(parseDemoDailyAccountLimit('20foo')).toBe(DEFAULT_DEMO_DAILY_ACCOUNT_LIMIT);
    expect(parseDemoDailyCreditLimit('1e3')).toBe(DEFAULT_DEMO_DAILY_CREDIT_LIMIT);
  });

  it('parses bypass emails as a lowercase trimmed set', () => {
    expect(parseDemoBypassEmails(' Dev@One.com,ops@example.com , ')).toEqual(
      new Set(['dev@one.com', 'ops@example.com']),
    );
  });

  it('computes admissions remaining and exhaustion status', () => {
    expect(
      buildDemoAdmissionsStatus({
        date: '2026-02-26',
        dailyLimit: 10,
        admittedCount: 10,
      }),
    ).toMatchObject({
      remaining: 0,
      isExhausted: true,
    });
  });

  it('computes account credits remaining and exhaustion status', () => {
    expect(
      buildDemoAccountStatus({
        admitted: true,
        isBypass: false,
        creditsLimit: 20,
        creditsUsed: 7,
      }),
    ).toMatchObject({
      admitted: true,
      creditsLimit: 20,
      creditsUsed: 7,
      remaining: 13,
      isExhausted: false,
    });
  });

  it('builds a full quota status payload with feature costs', () => {
    const status = buildDemoQuotaStatus({
      date: '2026-02-26',
      admissions: buildDemoAdmissionsStatus({
        date: '2026-02-26',
        dailyLimit: 15,
        admittedCount: 4,
      }),
      account: buildDemoAccountStatus({
        admitted: true,
        isBypass: false,
        creditsLimit: 20,
        creditsUsed: 4,
      }),
    });

    expect(status.resetAt).toBe('2026-02-27T00:00:00.000Z');
    expect(status.featureCosts.length).toBeGreaterThan(0);
  });

  it('recognizes the launch demo username and team slug', () => {
    expect(isLaunchDemoUsername('Demo')).toBe(true);
    expect(isLaunchDemoTeamSlug('demo-team')).toBe(true);
    expect(isLaunchDemoUsername('alice')).toBe(false);
  });

  it('returns the configured cost for chargeable features', () => {
    expect(getDemoFeatureCost('one_on_one_booking')).toBe(4);
    expect(getDemoFeatureCost('team_booking')).toBe(5);
  });
});
