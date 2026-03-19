import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  enqueueCalendarWritebacksForBookingMock,
  enqueueWebhookDeliveriesMock,
  sendBookingConfirmationEmailMock,
  sendBookingCancellationEmailMock,
  sendBookingRescheduledEmailMock,
  tryRecordEmailDeliveryMock,
} = vi.hoisted(() => ({
  enqueueCalendarWritebacksForBookingMock: vi.fn(),
  enqueueWebhookDeliveriesMock: vi.fn(),
  sendBookingConfirmationEmailMock: vi.fn(),
  sendBookingCancellationEmailMock: vi.fn(),
  sendBookingRescheduledEmailMock: vi.fn(),
  tryRecordEmailDeliveryMock: vi.fn(),
}));

vi.mock('./calendar-writeback-queue', () => ({
  enqueueCalendarWritebacksForBooking: enqueueCalendarWritebacksForBookingMock,
}));

vi.mock('./webhook-deliveries', () => ({
  enqueueWebhookDeliveries: enqueueWebhookDeliveriesMock,
}));

vi.mock('../lib/email', () => ({
  sendBookingConfirmationEmail: sendBookingConfirmationEmailMock,
  sendBookingCancellationEmail: sendBookingCancellationEmailMock,
  sendBookingRescheduledEmail: sendBookingRescheduledEmailMock,
}));

vi.mock('./telemetry', () => ({
  tryRecordAnalyticsFunnelEvent: vi.fn(),
  tryRecordEmailDelivery: tryRecordEmailDeliveryMock,
}));

import {
} from './booking-side-effects';
import {
  queueBookingRescheduleSideEffects,
  sendBookingRescheduleEmailSideEffects,
} from './booking-reschedule-side-effects';

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

    expect(enqueueWebhookDeliveriesMock).toHaveBeenCalledTimes(1);
    expect(enqueueWebhookDeliveriesMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizerId: 'organizer-1',
        type: 'booking.rescheduled',
      }),
    );
    expect(result.queuedWebhookDeliveries).toBe(1);

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

  it('queues cancel-old and create-new writebacks and notifies both organizers when the organizer changes', async () => {
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

    expect(enqueueWebhookDeliveriesMock).toHaveBeenCalledTimes(2);
    expect(enqueueWebhookDeliveriesMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        organizerId: 'organizer-old',
        type: 'booking.canceled',
        metadata: expect.objectContaining({
          rescheduledToBookingId: 'booking-new',
          reassignedOrganizerId: 'organizer-new',
        }),
      }),
    );
    expect(enqueueWebhookDeliveriesMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        organizerId: 'organizer-new',
        type: 'booking.rescheduled',
      }),
    );
    expect(result.queuedWebhookDeliveries).toBe(2);

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

describe('sendBookingRescheduleEmailSideEffects', () => {
  beforeEach(() => {
    sendBookingRescheduledEmailMock.mockReset();
    tryRecordEmailDeliveryMock.mockReset();
    sendBookingRescheduledEmailMock.mockResolvedValue({
      sent: true,
      provider: 'resend',
      messageId: 'message-1',
    });
  });

  it('keeps the existing invitee and organizer email pair when the organizer stays the same', async () => {
    const result = await sendBookingRescheduleEmailSideEffects({} as never, {} as never, {
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
      eventType: { name: 'Intro Call' },
      oldOrganizer: { email: 'organizer@example.com', displayName: 'Alex Old' },
      newOrganizer: { email: 'organizer@example.com', displayName: 'Alex Old' },
      timezone: 'UTC',
      alreadyProcessed: false,
    });

    expect(result).toHaveLength(2);
    expect(sendBookingRescheduledEmailMock).toHaveBeenCalledTimes(2);
    expect(tryRecordEmailDeliveryMock).toHaveBeenCalledTimes(2);
    expect(tryRecordEmailDeliveryMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        organizerId: 'organizer-1',
        bookingId: 'booking-new',
        recipientEmail: 'organizer@example.com',
      }),
    );
  });

  it('emails both old and new organizers when a reschedule changes organizer ownership', async () => {
    const result = await sendBookingRescheduleEmailSideEffects({} as never, {} as never, {
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
      eventType: { name: 'Intro Call' },
      oldOrganizer: { email: 'old-organizer@example.com', displayName: 'Alex Old' },
      newOrganizer: { email: 'new-organizer@example.com', displayName: 'Sam New' },
      timezone: 'UTC',
      alreadyProcessed: false,
    });

    expect(result).toHaveLength(3);
    expect(sendBookingRescheduledEmailMock).toHaveBeenCalledTimes(3);
    expect(sendBookingRescheduledEmailMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        recipientEmail: 'old-organizer@example.com',
        idempotencyKey: 'booking-rescheduled:booking-old:booking-new:organizer-old',
      }),
    );
    expect(sendBookingRescheduledEmailMock).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      expect.objectContaining({
        recipientEmail: 'new-organizer@example.com',
        idempotencyKey: 'booking-rescheduled:booking-old:booking-new:organizer-new',
      }),
    );

    expect(tryRecordEmailDeliveryMock).toHaveBeenCalledTimes(3);
    expect(tryRecordEmailDeliveryMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        organizerId: 'organizer-old',
        bookingId: 'booking-old',
        recipientEmail: 'old-organizer@example.com',
      }),
    );
    expect(tryRecordEmailDeliveryMock).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        organizerId: 'organizer-new',
        bookingId: 'booking-new',
        recipientEmail: 'new-organizer@example.com',
      }),
    );
  });
});
