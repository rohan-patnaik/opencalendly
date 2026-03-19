import { beforeEach, describe, expect, it, vi } from 'vitest';

const { enqueueCalendarWritebacksForBookingMock, enqueueWebhookDeliveriesMock } = vi.hoisted(() => ({
  enqueueCalendarWritebacksForBookingMock: vi.fn(),
  enqueueWebhookDeliveriesMock: vi.fn(),
}));

vi.mock('./calendar-writeback-queue', () => ({
  enqueueCalendarWritebacksForBooking: enqueueCalendarWritebacksForBookingMock,
}));

vi.mock('./webhook-deliveries', () => ({
  enqueueWebhookDeliveries: enqueueWebhookDeliveriesMock,
}));

vi.mock('./telemetry', () => ({
  tryRecordAnalyticsFunnelEvent: vi.fn(),
  tryRecordEmailDelivery: vi.fn(),
}));

import { queueBookingRescheduleSideEffects } from './booking-side-effects';

describe('queueBookingRescheduleSideEffects', () => {
  beforeEach(() => {
    enqueueCalendarWritebacksForBookingMock.mockReset();
    enqueueWebhookDeliveriesMock.mockReset();
    enqueueWebhookDeliveriesMock.mockResolvedValue(1);
  });

  it('keeps the reschedule writeback path when the organizer stays the same', async () => {
    enqueueCalendarWritebacksForBookingMock.mockResolvedValue({ queued: 2, rowIds: ['row-1', 'row-2'] });

    const result = await queueBookingRescheduleSideEffects({} as never, {
      oldBooking: {
        id: 'booking-old',
        eventTypeId: 'event-1',
        organizerId: 'organizer-1',
        inviteeName: 'Pat Lee',
        inviteeEmail: 'pat@example.com',
        startsAt: new Date('2026-03-04T17:00:00.000Z'),
        endsAt: new Date('2026-03-04T17:30:00.000Z'),
        status: 'rescheduled',
      },
      newBooking: {
        id: 'booking-new',
        eventTypeId: 'event-1',
        organizerId: 'organizer-1',
        inviteeName: 'Pat Lee',
        inviteeEmail: 'pat@example.com',
        startsAt: new Date('2026-03-05T17:00:00.000Z'),
        endsAt: new Date('2026-03-05T17:30:00.000Z'),
      },
      alreadyProcessed: false,
    });

    expect(enqueueCalendarWritebacksForBookingMock).toHaveBeenCalledTimes(1);
    expect(enqueueCalendarWritebacksForBookingMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        bookingId: 'booking-old',
        organizerId: 'organizer-1',
        operation: 'reschedule',
        rescheduleTarget: expect.objectContaining({ bookingId: 'booking-new' }),
      }),
    );
    expect(result.calendarWriteback).toMatchObject({
      queued: 2,
      deferred: true,
    });
  });

  it('queues cancel-old and create-new writebacks when the organizer changes', async () => {
    enqueueCalendarWritebacksForBookingMock
      .mockResolvedValueOnce({ queued: 1, rowIds: ['cancel-row'] })
      .mockResolvedValueOnce({ queued: 2, rowIds: ['create-row-1', 'create-row-2'] });

    const result = await queueBookingRescheduleSideEffects({} as never, {
      oldBooking: {
        id: 'booking-old',
        eventTypeId: 'event-1',
        organizerId: 'organizer-old',
        inviteeName: 'Pat Lee',
        inviteeEmail: 'pat@example.com',
        startsAt: new Date('2026-03-04T17:00:00.000Z'),
        endsAt: new Date('2026-03-04T17:30:00.000Z'),
        status: 'rescheduled',
      },
      newBooking: {
        id: 'booking-new',
        eventTypeId: 'event-1',
        organizerId: 'organizer-new',
        inviteeName: 'Pat Lee',
        inviteeEmail: 'pat@example.com',
        startsAt: new Date('2026-03-05T17:00:00.000Z'),
        endsAt: new Date('2026-03-05T17:30:00.000Z'),
      },
      alreadyProcessed: false,
    });

    expect(enqueueCalendarWritebacksForBookingMock).toHaveBeenCalledTimes(2);
    expect(enqueueCalendarWritebacksForBookingMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        bookingId: 'booking-old',
        organizerId: 'organizer-old',
        operation: 'cancel',
      }),
    );
    expect(enqueueCalendarWritebacksForBookingMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        bookingId: 'booking-new',
        organizerId: 'organizer-new',
        operation: 'create',
      }),
    );
    expect(result.calendarWriteback).toMatchObject({
      queued: 3,
      deferred: true,
    });
  });
});
