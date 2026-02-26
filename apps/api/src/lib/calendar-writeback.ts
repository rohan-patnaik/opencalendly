export type CalendarWritebackOperation = 'create' | 'cancel' | 'reschedule';
export type CalendarWritebackStatus = 'pending' | 'succeeded' | 'failed';

export type CalendarWritebackRecord = {
  operation: CalendarWritebackOperation;
  attemptCount: number;
  maxAttempts: number;
  externalEventId: string | null;
};

export type CalendarWritebackBookingContext = {
  eventName: string;
  inviteeName: string;
  inviteeEmail: string;
  startsAtIso: string;
  endsAtIso: string;
  timezone: string;
  locationType: string;
  locationValue: string | null;
};

export type CalendarWritebackRescheduleTarget = {
  bookingId: string;
  startsAtIso: string;
  endsAtIso: string;
};

export type CalendarWritebackProviderClient = {
  createEvent(input: CalendarWritebackBookingContext): Promise<{ externalEventId: string }>;
  cancelEvent(input: { externalEventId: string }): Promise<void>;
  updateEvent(input: { externalEventId: string; startsAtIso: string; endsAtIso: string }): Promise<void>;
};

export type CalendarWritebackResult = {
  status: CalendarWritebackStatus;
  attemptCount: number;
  nextAttemptAt: Date;
  lastAttemptAt: Date;
  lastError: string | null;
  externalEventId: string | null;
  transferExternalEventToBookingId: string | null;
};

const MAX_ERROR_LENGTH = 1000;
const MAX_BACKOFF_MINUTES = 60;

export const computeNextWritebackAttemptAt = (attemptCount: number, now: Date): Date => {
  const exponent = Math.max(0, Math.min(6, attemptCount - 1));
  const backoffMinutes = Math.min(MAX_BACKOFF_MINUTES, 2 ** exponent);
  return new Date(now.getTime() + backoffMinutes * 60_000);
};

const toErrorMessage = (error: unknown): string => {
  const value = error instanceof Error ? error.message : 'Calendar writeback failed.';
  return value.slice(0, MAX_ERROR_LENGTH);
};

export const processCalendarWriteback = async (input: {
  record: CalendarWritebackRecord;
  booking: CalendarWritebackBookingContext;
  rescheduleTarget?: CalendarWritebackRescheduleTarget | null;
  providerClient: CalendarWritebackProviderClient;
  now: Date;
}): Promise<CalendarWritebackResult> => {
  const attemptCount = input.record.attemptCount + 1;
  const lastAttemptAt = input.now;

  try {
    let externalEventId = input.record.externalEventId;
    let transferExternalEventToBookingId: string | null = null;

    if (input.record.operation === 'create') {
      const created = await input.providerClient.createEvent(input.booking);
      externalEventId = created.externalEventId;
    } else if (input.record.operation === 'cancel') {
      if (externalEventId) {
        await input.providerClient.cancelEvent({ externalEventId });
      }
    } else if (input.record.operation === 'reschedule') {
      if (!input.rescheduleTarget) {
        throw new Error('Reschedule target is required for calendar writeback.');
      }

      if (externalEventId) {
        await input.providerClient.updateEvent({
          externalEventId,
          startsAtIso: input.rescheduleTarget.startsAtIso,
          endsAtIso: input.rescheduleTarget.endsAtIso,
        });
      } else {
        const created = await input.providerClient.createEvent({
          ...input.booking,
          startsAtIso: input.rescheduleTarget.startsAtIso,
          endsAtIso: input.rescheduleTarget.endsAtIso,
        });
        externalEventId = created.externalEventId;
      }

      transferExternalEventToBookingId = input.rescheduleTarget.bookingId;
    }

    return {
      status: 'succeeded',
      attemptCount,
      nextAttemptAt: input.now,
      lastAttemptAt,
      lastError: null,
      externalEventId,
      transferExternalEventToBookingId,
    };
  } catch (error) {
    const exhausted = attemptCount >= input.record.maxAttempts;
    return {
      status: exhausted ? 'failed' : 'pending',
      attemptCount,
      nextAttemptAt: exhausted ? input.now : computeNextWritebackAttemptAt(attemptCount, input.now),
      lastAttemptAt,
      lastError: toErrorMessage(error),
      externalEventId: input.record.externalEventId,
      transferExternalEventToBookingId: null,
    };
  }
};
