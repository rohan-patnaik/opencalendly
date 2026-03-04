import { describe, expect, it } from 'vitest';

import {
  buildScheduledNotificationsForBooking,
  resolveRunnerOutcome,
  resolveScheduledNotificationSendAt,
  toEmailDeliveryTypeForNotification,
} from './notification-workflows';

describe('notification workflow helpers', () => {
  it('computes reminder send time before booking start', () => {
    const sendAt = resolveScheduledNotificationSendAt({
      notificationType: 'reminder',
      offsetMinutes: 60,
      bookingStartsAt: new Date('2026-03-10T10:00:00.000Z'),
      bookingEndsAt: new Date('2026-03-10T10:30:00.000Z'),
    });

    expect(sendAt.toISOString()).toBe('2026-03-10T09:00:00.000Z');
  });

  it('computes follow-up send time after booking end', () => {
    const sendAt = resolveScheduledNotificationSendAt({
      notificationType: 'follow_up',
      offsetMinutes: 120,
      bookingStartsAt: new Date('2026-03-10T10:00:00.000Z'),
      bookingEndsAt: new Date('2026-03-10T10:30:00.000Z'),
    });

    expect(sendAt.toISOString()).toBe('2026-03-10T12:30:00.000Z');
  });

  it('builds scheduled rows only for enabled rules', () => {
    const rows = buildScheduledNotificationsForBooking({
      booking: {
        bookingId: 'booking-1',
        organizerId: 'organizer-1',
        eventTypeId: 'event-1',
        inviteeEmail: 'Invitee@Example.com',
        inviteeName: 'Invitee',
        startsAt: new Date('2026-03-10T10:00:00.000Z'),
        endsAt: new Date('2026-03-10T10:30:00.000Z'),
      },
      rules: [
        {
          id: 'rule-1',
          notificationType: 'reminder',
          offsetMinutes: 30,
          isEnabled: true,
        },
        {
          id: 'rule-2',
          notificationType: 'follow_up',
          offsetMinutes: 15,
          isEnabled: false,
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.recipientEmail).toBe('invitee@example.com');
    expect(rows[0]?.notificationType).toBe('reminder');
  });

  it('maps notification type to email telemetry type', () => {
    expect(toEmailDeliveryTypeForNotification('reminder')).toBe('booking_reminder');
    expect(toEmailDeliveryTypeForNotification('follow_up')).toBe('booking_follow_up');
  });

  it('marks successful runner send as sent and increments attempts', () => {
    const now = new Date('2026-03-10T09:10:00.000Z');
    const outcome = resolveRunnerOutcome({
      currentStatus: 'pending',
      attemptCount: 0,
      now,
      sendResult: {
        sent: true,
        provider: 'resend',
        messageId: 'msg_123',
      },
    });

    expect(outcome.action).toBe('update');
    if (outcome.action === 'update') {
      expect(outcome.values.status).toBe('sent');
      expect(outcome.values.attemptCount).toBe(1);
      expect(outcome.values.providerMessageId).toBe('msg_123');
      expect(outcome.values.sentAt?.toISOString()).toBe(now.toISOString());
    }
  });

  it('marks failed runner send as failed and increments attempts', () => {
    const outcome = resolveRunnerOutcome({
      currentStatus: 'pending',
      attemptCount: 1,
      now: new Date('2026-03-10T09:10:00.000Z'),
      sendResult: {
        sent: false,
        provider: 'resend',
        error: 'provider timeout',
      },
    });

    expect(outcome.action).toBe('update');
    if (outcome.action === 'update') {
      expect(outcome.values.status).toBe('failed');
      expect(outcome.values.attemptCount).toBe(2);
      expect(outcome.values.lastError).toBe('provider timeout');
      expect(outcome.values.sentAt).toBeNull();
    }
  });

  it('skips already sent rows for idempotent runner behavior', () => {
    const outcome = resolveRunnerOutcome({
      currentStatus: 'sent',
      attemptCount: 1,
      now: new Date('2026-03-10T09:10:00.000Z'),
      sendResult: {
        sent: true,
        provider: 'resend',
      },
    });

    expect(outcome).toEqual({ action: 'skip' });
  });
});
