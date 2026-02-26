export type CalendarWritebackOperation = 'create' | 'cancel' | 'reschedule';
export type CalendarWritebackStatus = 'pending' | 'succeeded' | 'failed';

export type CalendarWritebackRecord = {
  operation: CalendarWritebackOperation;
  attemptCount: number;
  maxAttempts: number;
  externalEventId: string | null;
  idempotencyKey: string;
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
  createEvent(
    input: CalendarWritebackBookingContext & { idempotencyKey: string },
  ): Promise<{ externalEventId: string }>;
  cancelEvent(input: { externalEventId: string }): Promise<void>;
  updateEvent(input: { externalEventId: string; startsAtIso: string; endsAtIso: string }): Promise<void>;
  findEventByIdempotencyKey?(
    input: { idempotencyKey: string },
  ): Promise<{ externalEventId: string } | null>;
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

  const findExistingEventId = async (idempotencyKey: string): Promise<string | null> => {
    if (!input.providerClient.findEventByIdempotencyKey) {
      return null;
    }
    const existing = await input.providerClient.findEventByIdempotencyKey({ idempotencyKey });
    return existing?.externalEventId ?? null;
  };

  const createOrReuseEvent = async (
    booking: CalendarWritebackBookingContext,
    idempotencyKey: string,
  ): Promise<string> => {
    const existingBeforeCreate = await findExistingEventId(idempotencyKey);
    if (existingBeforeCreate) {
      return existingBeforeCreate;
    }

    try {
      const created = await input.providerClient.createEvent({
        ...booking,
        idempotencyKey,
      });
      return created.externalEventId;
    } catch (error) {
      const existingAfterCreate = await findExistingEventId(idempotencyKey);
      if (existingAfterCreate) {
        return existingAfterCreate;
      }
      throw error;
    }
  };

  try {
    let externalEventId = input.record.externalEventId;
    let transferExternalEventToBookingId: string | null = null;

    if (input.record.operation === 'create') {
      externalEventId = await createOrReuseEvent(input.booking, input.record.idempotencyKey);
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
        externalEventId = await createOrReuseEvent(
          {
            ...input.booking,
            startsAtIso: input.rescheduleTarget.startsAtIso,
            endsAtIso: input.rescheduleTarget.endsAtIso,
          },
          input.rescheduleTarget.bookingId,
        );
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
