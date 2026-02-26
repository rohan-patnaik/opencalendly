import { describe, expect, it } from 'vitest';

import {
  resolveAnalyticsRange,
  summarizeFunnelAnalytics,
  summarizeOperatorHealth,
  summarizeTeamAnalytics,
} from './analytics';

describe('resolveAnalyticsRange', () => {
  it('uses default 30-day range when no dates are provided', () => {
    const range = resolveAnalyticsRange({
      now: new Date('2026-03-15T18:45:00.000Z'),
    });

    expect(range.startDate).toBe('2026-02-14');
    expect(range.endDate).toBe('2026-03-15');
  });

  it('rejects ranges larger than 90 days', () => {
    expect(() =>
      resolveAnalyticsRange({
        startDate: '2026-01-01',
        endDate: '2026-04-15',
      }),
    ).toThrow('Analytics range cannot exceed 90 days.');
  });

  it('rejects invalid ISO date input', () => {
    expect(() =>
      resolveAnalyticsRange({
        startDate: '2026-02-30',
        endDate: '2026-03-10',
      }),
    ).toThrow('Invalid startDate. Use YYYY-MM-DD.');
  });

  it('rejects invalid endDate input', () => {
    expect(() =>
      resolveAnalyticsRange({
        startDate: '2026-03-01',
        endDate: '2026-02-30',
      }),
    ).toThrow('Invalid endDate. Use YYYY-MM-DD.');
  });

  it('rejects endDate earlier than startDate', () => {
    expect(() =>
      resolveAnalyticsRange({
        startDate: '2026-03-10',
        endDate: '2026-03-01',
      }),
    ).toThrow('endDate must be on or after startDate.');
  });
});

describe('summarizeFunnelAnalytics', () => {
  it('builds funnel, status, and daily metrics without double-counting confirmations', () => {
    const result = summarizeFunnelAnalytics({
      eventTypeNameById: new Map([['event-1', 'Intro Call']]),
      funnelRows: [
        {
          stage: 'page_view',
          eventTypeId: 'event-1',
          occurredAt: new Date('2026-03-01T10:00:00.000Z'),
        },
        {
          stage: 'page_view',
          eventTypeId: 'event-1',
          occurredAt: new Date('2026-03-01T10:05:00.000Z'),
        },
        {
          stage: 'slot_selection',
          eventTypeId: 'event-1',
          occurredAt: new Date('2026-03-01T10:06:00.000Z'),
        },
        {
          stage: 'booking_confirmed',
          eventTypeId: 'event-1',
          occurredAt: new Date('2026-03-01T10:07:00.000Z'),
        },
      ],
      bookingRows: [
        {
          eventTypeId: 'event-1',
          status: 'confirmed',
          createdAt: new Date('2026-03-01T10:07:00.000Z'),
        },
        {
          eventTypeId: 'event-1',
          status: 'canceled',
          createdAt: new Date('2026-03-01T11:00:00.000Z'),
        },
        {
          eventTypeId: 'event-1',
          status: 'rescheduled',
          createdAt: new Date('2026-03-01T12:00:00.000Z'),
        },
      ],
    });

    expect(result.summary.pageViews).toBe(2);
    expect(result.summary.slotSelections).toBe(1);
    expect(result.summary.bookingConfirmations).toBe(1);
    expect(result.summary.confirmed).toBe(1);
    expect(result.summary.canceled).toBe(1);
    expect(result.summary.rescheduled).toBe(1);
    expect(result.summary.conversionRate).toBe(0.5);
    expect(result.byEventType[0]?.eventTypeName).toBe('Intro Call');
    expect(result.daily[0]?.date).toBe('2026-03-01');
  });
});

describe('summarizeTeamAnalytics', () => {
  it('aggregates round-robin assignments and dedupes collective bookings', () => {
    const result = summarizeTeamAnalytics({
      teamEventTypeRows: [
        {
          teamEventTypeId: 'tet-1',
          teamId: 'team-1',
          teamName: 'Support',
          eventTypeId: 'event-1',
          eventTypeName: 'Team Intro',
        },
      ],
      roundRobinRows: [
        {
          teamEventTypeId: 'tet-1',
          memberUserId: 'user-1',
          memberDisplayName: 'Alice',
        },
        {
          teamEventTypeId: 'tet-1',
          memberUserId: 'user-1',
          memberDisplayName: 'Alice',
        },
      ],
      collectiveRows: [
        {
          teamEventTypeId: 'tet-1',
          bookingId: 'booking-1',
        },
        {
          teamEventTypeId: 'tet-1',
          bookingId: 'booking-1',
        },
        {
          teamEventTypeId: 'tet-1',
          bookingId: 'booking-2',
        },
      ],
    });

    expect(result.roundRobinAssignments).toHaveLength(1);
    expect(result.roundRobinAssignments[0]?.assignments).toBe(2);
    expect(result.collectiveBookings).toHaveLength(1);
    expect(result.collectiveBookings[0]?.bookings).toBe(2);
  });
});

describe('summarizeOperatorHealth', () => {
  it('aggregates webhook and email delivery health', () => {
    const result = summarizeOperatorHealth({
      webhookRows: [{ status: 'pending' }, { status: 'succeeded' }, { status: 'failed' }],
      emailRows: [
        { status: 'succeeded', emailType: 'booking_confirmation' },
        { status: 'failed', emailType: 'booking_confirmation' },
        { status: 'succeeded', emailType: 'booking_cancellation' },
      ],
    });

    expect(result.webhookDeliveries).toEqual({
      total: 3,
      pending: 1,
      succeeded: 1,
      failed: 1,
    });
    expect(result.emailDeliveries.total).toBe(3);
    expect(result.emailDeliveries.succeeded).toBe(2);
    expect(result.emailDeliveries.failed).toBe(1);
    expect(result.emailDeliveries.byType).toHaveLength(2);
  });

  it('counts unknown statuses as failed and supports aggregated row counts', () => {
    const result = summarizeOperatorHealth({
      webhookRows: [
        { status: 'pending', count: 2 },
        { status: 'succeeded', count: 1 },
        { status: 'timed_out', count: 3 },
      ],
      emailRows: [
        { status: 'succeeded', emailType: 'booking_confirmation', count: 2 },
        { status: 'bounced', emailType: 'booking_confirmation', count: 1 },
        { status: 'failed', emailType: 'booking_rescheduled', count: 4 },
      ],
    });

    expect(result.webhookDeliveries).toEqual({
      total: 6,
      pending: 2,
      succeeded: 1,
      failed: 3,
    });
    expect(result.emailDeliveries.total).toBe(7);
    expect(result.emailDeliveries.succeeded).toBe(2);
    expect(result.emailDeliveries.failed).toBe(5);
    expect(result.emailDeliveries.byType).toEqual([
      {
        emailType: 'booking_confirmation',
        total: 3,
        succeeded: 2,
        failed: 1,
      },
      {
        emailType: 'booking_rescheduled',
        total: 4,
        succeeded: 0,
        failed: 4,
      },
    ]);
  });
});
