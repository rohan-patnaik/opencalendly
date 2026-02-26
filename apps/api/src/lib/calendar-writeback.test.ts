import { describe, expect, it, vi } from 'vitest';

import {
  computeNextWritebackAttemptAt,
  processCalendarWriteback,
  type CalendarWritebackProviderClient,
} from './calendar-writeback';

const baseBooking = {
  eventName: 'Intro Call',
  inviteeName: 'Pat Lee',
  inviteeEmail: 'pat@example.com',
  startsAtIso: '2026-03-10T10:00:00.000Z',
  endsAtIso: '2026-03-10T10:30:00.000Z',
  timezone: 'UTC',
  locationType: 'video',
  locationValue: 'https://meet.example.com/intro',
};

const createProviderClient = (): CalendarWritebackProviderClient => ({
  createEvent: vi.fn(async () => ({ externalEventId: 'provider-event-1' })),
  cancelEvent: vi.fn(async () => undefined),
  updateEvent: vi.fn(async () => undefined),
  findEventByIdempotencyKey: vi.fn(async () => null),
});

describe('calendar-writeback', () => {
  it('handles create success', async () => {
    const now = new Date('2026-03-10T08:00:00.000Z');
    const providerClient = createProviderClient();

    const result = await processCalendarWriteback({
      record: {
        operation: 'create',
        attemptCount: 0,
        maxAttempts: 5,
        externalEventId: null,
        idempotencyKey: 'booking-1',
      },
      booking: baseBooking,
      providerClient,
      now,
    });

    expect(result.status).toBe('succeeded');
    expect(result.externalEventId).toBe('provider-event-1');
    expect(result.transferExternalEventToBookingId).toBeNull();
    expect(providerClient.createEvent).toHaveBeenCalledWith({
      ...baseBooking,
      idempotencyKey: 'booking-1',
    });
  });

  it('handles cancel success as no-op when external event id is missing', async () => {
    const now = new Date('2026-03-10T08:00:00.000Z');
    const providerClient = createProviderClient();

    const result = await processCalendarWriteback({
      record: {
        operation: 'cancel',
        attemptCount: 0,
        maxAttempts: 5,
        externalEventId: null,
        idempotencyKey: 'booking-1',
      },
      booking: baseBooking,
      providerClient,
      now,
    });

    expect(result.status).toBe('succeeded');
    expect(result.externalEventId).toBeNull();
    expect(providerClient.cancelEvent).not.toHaveBeenCalled();
  });

  it('handles reschedule success and transfers mapping to new booking id', async () => {
    const now = new Date('2026-03-10T08:00:00.000Z');
    const providerClient = createProviderClient();

    const result = await processCalendarWriteback({
      record: {
        operation: 'reschedule',
        attemptCount: 0,
        maxAttempts: 5,
        externalEventId: 'provider-event-1',
        idempotencyKey: 'booking-1',
      },
      booking: baseBooking,
      rescheduleTarget: {
        bookingId: 'new-booking-id',
        startsAtIso: '2026-03-10T11:00:00.000Z',
        endsAtIso: '2026-03-10T11:30:00.000Z',
      },
      providerClient,
      now,
    });

    expect(result.status).toBe('succeeded');
    expect(result.transferExternalEventToBookingId).toBe('new-booking-id');
    expect(providerClient.updateEvent).toHaveBeenCalledTimes(1);
  });

  it('retries with bounded backoff when provider call fails', async () => {
    const now = new Date('2026-03-10T08:00:00.000Z');
    const providerClient = createProviderClient();
    providerClient.createEvent = vi.fn(async () => {
      throw new Error('Provider is temporarily unavailable');
    });

    const result = await processCalendarWriteback({
      record: {
        operation: 'create',
        attemptCount: 1,
        maxAttempts: 5,
        externalEventId: null,
        idempotencyKey: 'booking-1',
      },
      booking: baseBooking,
      providerClient,
      now,
    });

    expect(result.status).toBe('pending');
    expect(result.attemptCount).toBe(2);
    expect(result.nextAttemptAt.toISOString()).toBe(computeNextWritebackAttemptAt(2, now).toISOString());
    expect(result.lastError).toBe('Calendar writeback failed.');
  });

  it('marks failure when max attempts are exhausted', async () => {
    const now = new Date('2026-03-10T08:00:00.000Z');
    const providerClient = createProviderClient();
    providerClient.cancelEvent = vi.fn(async () => {
      throw new Error('Provider rejected request');
    });

    const result = await processCalendarWriteback({
      record: {
        operation: 'cancel',
        attemptCount: 2,
        maxAttempts: 3,
        externalEventId: 'provider-event-1',
        idempotencyKey: 'booking-1',
      },
      booking: baseBooking,
      providerClient,
      now,
    });

    expect(result.status).toBe('failed');
    expect(result.attemptCount).toBe(3);
    expect(result.nextAttemptAt.toISOString()).toBe(now.toISOString());
    expect(result.lastError).toBe('Calendar writeback failed.');
  });

  it('reuses an already existing event by idempotency key', async () => {
    const now = new Date('2026-03-10T08:00:00.000Z');
    const providerClient = createProviderClient();
    providerClient.findEventByIdempotencyKey = vi.fn(async () => ({
      externalEventId: 'provider-event-existing',
    }));

    const result = await processCalendarWriteback({
      record: {
        operation: 'create',
        attemptCount: 0,
        maxAttempts: 5,
        externalEventId: null,
        idempotencyKey: 'booking-1',
      },
      booking: baseBooking,
      providerClient,
      now,
    });

    expect(result.status).toBe('succeeded');
    expect(result.externalEventId).toBe('provider-event-existing');
    expect(providerClient.createEvent).not.toHaveBeenCalled();
  });

  it('uses provider-scoped idempotency key for reschedule-create fallback', async () => {
    const now = new Date('2026-03-10T08:00:00.000Z');
    const providerClient = createProviderClient();

    await processCalendarWriteback({
      record: {
        operation: 'reschedule',
        attemptCount: 0,
        maxAttempts: 5,
        externalEventId: null,
        idempotencyKey: 'google:old-booking-id',
      },
      booking: baseBooking,
      rescheduleTarget: {
        bookingId: 'new-booking-id',
        startsAtIso: '2026-03-10T11:00:00.000Z',
        endsAtIso: '2026-03-10T11:30:00.000Z',
      },
      providerClient,
      now,
    });

    expect(providerClient.createEvent).toHaveBeenCalledWith({
      ...baseBooking,
      startsAtIso: '2026-03-10T11:00:00.000Z',
      endsAtIso: '2026-03-10T11:30:00.000Z',
      idempotencyKey: 'google:new-booking-id',
    });
  });
});
