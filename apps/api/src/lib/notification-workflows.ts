export type NotificationRuleType = 'reminder' | 'follow_up';
export type ScheduledNotificationStatus = 'pending' | 'sent' | 'failed' | 'canceled';

export type NotificationRuleRecord = {
  id: string;
  notificationType: NotificationRuleType;
  offsetMinutes: number;
  isEnabled: boolean;
};

export type NotificationBookingRecord = {
  bookingId: string;
  organizerId: string;
  eventTypeId: string;
  inviteeEmail: string;
  inviteeName: string;
  startsAt: Date;
  endsAt: Date;
};

export type ScheduledNotificationInsert = {
  organizerId: string;
  bookingId: string;
  eventTypeId: string;
  notificationRuleId: string;
  notificationType: NotificationRuleType;
  recipientEmail: string;
  recipientName: string;
  bookingStartsAt: Date;
  bookingEndsAt: Date;
  sendAt: Date;
};

export type RunnerOutcome =
  | {
      action: 'skip';
    }
  | {
      action: 'update';
      values: {
        status: 'sent' | 'failed';
        attemptCount: number;
        provider: string;
        providerMessageId: string | null;
        lastError: string | null;
        sentAt: Date | null;
        updatedAt: Date;
      };
    };

export const resolveScheduledNotificationSendAt = (input: {
  notificationType: NotificationRuleType;
  offsetMinutes: number;
  bookingStartsAt: Date;
  bookingEndsAt: Date;
}): Date => {
  const offsetMs = input.offsetMinutes * 60 * 1000;
  if (input.notificationType === 'reminder') {
    return new Date(input.bookingStartsAt.getTime() - offsetMs);
  }
  return new Date(input.bookingEndsAt.getTime() + offsetMs);
};

export const buildScheduledNotificationsForBooking = (input: {
  booking: NotificationBookingRecord;
  rules: NotificationRuleRecord[];
}): ScheduledNotificationInsert[] => {
  return input.rules
    .filter((rule) => rule.isEnabled)
    .map((rule) => ({
      organizerId: input.booking.organizerId,
      bookingId: input.booking.bookingId,
      eventTypeId: input.booking.eventTypeId,
      notificationRuleId: rule.id,
      notificationType: rule.notificationType,
      recipientEmail: input.booking.inviteeEmail.trim().toLowerCase(),
      recipientName: input.booking.inviteeName,
      bookingStartsAt: input.booking.startsAt,
      bookingEndsAt: input.booking.endsAt,
      sendAt: resolveScheduledNotificationSendAt({
        notificationType: rule.notificationType,
        offsetMinutes: rule.offsetMinutes,
        bookingStartsAt: input.booking.startsAt,
        bookingEndsAt: input.booking.endsAt,
      }),
    }));
};

export const toEmailDeliveryTypeForNotification = (
  notificationType: NotificationRuleType,
): 'booking_reminder' | 'booking_follow_up' => {
  return notificationType === 'reminder' ? 'booking_reminder' : 'booking_follow_up';
};

export const resolveRunnerOutcome = (input: {
  currentStatus: ScheduledNotificationStatus;
  attemptCount: number;
  now: Date;
  sendResult: {
    sent: boolean;
    provider: string;
    messageId?: string;
    error?: string;
  };
}): RunnerOutcome => {
  if (input.currentStatus === 'sent' || input.currentStatus === 'canceled') {
    return { action: 'skip' };
  }

  const nextAttemptCount = input.attemptCount + 1;

  if (input.sendResult.sent) {
    return {
      action: 'update',
      values: {
        status: 'sent',
        attemptCount: nextAttemptCount,
        provider: input.sendResult.provider,
        providerMessageId: input.sendResult.messageId ?? null,
        lastError: null,
        sentAt: input.now,
        updatedAt: input.now,
      },
    };
  }

  return {
    action: 'update',
    values: {
      status: 'failed',
      attemptCount: nextAttemptCount,
      provider: input.sendResult.provider,
      providerMessageId: null,
      lastError: input.sendResult.error?.slice(0, 1000) ?? 'Email send failed.',
      sentAt: null,
      updatedAt: input.now,
    },
  };
};
