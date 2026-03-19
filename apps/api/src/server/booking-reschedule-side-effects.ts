import { sendBookingRescheduledEmail } from '../lib/email';
import {
  emptyWritebackResult,
  mergeWritebackResults,
  queueCalendarWriteback,
} from './booking-writeback-summary';
import { tryRecordEmailDelivery } from './telemetry';
import type { Bindings, Database } from './types';
import { enqueueWebhookDeliveries } from './webhook-deliveries';

type BookingRecord = {
  id: string;
  eventTypeId: string;
  organizerId: string;
  inviteeName: string;
  inviteeEmail: string;
  startsAt: Date;
  endsAt: Date;
};

const buildSkippedEmailResults = (message: string, count = 2) => {
  return Array.from({ length: count }, () => ({
    sent: false,
    provider: 'none' as const,
    error: message,
  }));
};

export const queueBookingRescheduleSideEffects = async (
  db: Database,
  input: {
    oldBooking: BookingRecord & { status: string };
    newBooking: BookingRecord;
    alreadyProcessed: boolean;
  },
) => {
  const organizerChanged = input.oldBooking.organizerId !== input.newBooking.organizerId;
  const queuedWebhookDeliveries = input.alreadyProcessed
    ? 0
    : (
        await Promise.all([
          organizerChanged
            ? enqueueWebhookDeliveries(db, {
                organizerId: input.oldBooking.organizerId,
                type: 'booking.canceled',
                booking: {
                  id: input.oldBooking.id,
                  eventTypeId: input.oldBooking.eventTypeId,
                  organizerId: input.oldBooking.organizerId,
                  inviteeEmail: input.oldBooking.inviteeEmail,
                  inviteeName: input.oldBooking.inviteeName,
                  startsAtIso: input.oldBooking.startsAt.toISOString(),
                  endsAtIso: input.oldBooking.endsAt.toISOString(),
                },
                metadata: {
                  cancellationReason: 'Booking reassigned during reschedule.',
                  rescheduledToBookingId: input.newBooking.id,
                  reassignedOrganizerId: input.newBooking.organizerId,
                  newStartsAt: input.newBooking.startsAt.toISOString(),
                  newEndsAt: input.newBooking.endsAt.toISOString(),
                },
              })
            : Promise.resolve(0),
          enqueueWebhookDeliveries(db, {
            organizerId: input.newBooking.organizerId,
            type: 'booking.rescheduled',
            booking: {
              id: input.newBooking.id,
              eventTypeId: input.newBooking.eventTypeId,
              organizerId: input.newBooking.organizerId,
              inviteeEmail: input.newBooking.inviteeEmail,
              inviteeName: input.newBooking.inviteeName,
              startsAtIso: input.newBooking.startsAt.toISOString(),
              endsAtIso: input.newBooking.endsAt.toISOString(),
            },
            metadata: {
              rescheduledFromBookingId: input.oldBooking.id,
              previousStartsAt: input.oldBooking.startsAt.toISOString(),
              previousEndsAt: input.oldBooking.endsAt.toISOString(),
            },
          }),
        ])
      ).reduce((sum, queued) => sum + queued, 0);

  return {
    queuedWebhookDeliveries,
    calendarWriteback: input.alreadyProcessed
      ? emptyWritebackResult
      : input.oldBooking.organizerId === input.newBooking.organizerId
        ? await queueCalendarWriteback(db, {
            bookingId: input.oldBooking.id,
            organizerId: input.newBooking.organizerId,
            operation: 'reschedule',
            rescheduleTarget: {
              bookingId: input.newBooking.id,
              startsAtIso: input.newBooking.startsAt.toISOString(),
              endsAtIso: input.newBooking.endsAt.toISOString(),
            },
          })
        : mergeWritebackResults(
            await queueCalendarWriteback(db, {
              bookingId: input.oldBooking.id,
              organizerId: input.oldBooking.organizerId,
              operation: 'cancel',
            }),
            await queueCalendarWriteback(db, {
              bookingId: input.newBooking.id,
              organizerId: input.newBooking.organizerId,
              operation: 'create',
            }),
          ),
  };
};

export const sendBookingRescheduleEmailSideEffects = async (
  env: Bindings,
  db: Database,
  input: {
    oldBooking: BookingRecord & { status: string };
    newBooking: BookingRecord;
    eventType: { name: string };
    oldOrganizer: { email: string; displayName: string };
    newOrganizer: { email: string; displayName: string };
    timezone: string;
    alreadyProcessed: boolean;
  },
) => {
  const organizerChanged = input.oldBooking.organizerId !== input.newBooking.organizerId;
  if (input.alreadyProcessed) {
    return buildSkippedEmailResults('Idempotent replay: reschedule already processed.', organizerChanged ? 3 : 2);
  }

  const organizerNotifications = organizerChanged
    ? [
        {
          organizerId: input.oldBooking.organizerId,
          bookingId: input.oldBooking.id,
          eventTypeId: input.oldBooking.eventTypeId,
          recipientEmail: input.oldOrganizer.email,
          recipientName: input.oldOrganizer.displayName,
          organizerDisplayName: input.oldOrganizer.displayName,
          idempotencyKey: `booking-rescheduled:${input.oldBooking.id}:${input.newBooking.id}:organizer-old`,
        },
        {
          organizerId: input.newBooking.organizerId,
          bookingId: input.newBooking.id,
          eventTypeId: input.newBooking.eventTypeId,
          recipientEmail: input.newOrganizer.email,
          recipientName: input.newOrganizer.displayName,
          organizerDisplayName: input.newOrganizer.displayName,
          idempotencyKey: `booking-rescheduled:${input.oldBooking.id}:${input.newBooking.id}:organizer-new`,
        },
      ]
    : [
        {
          organizerId: input.newBooking.organizerId,
          bookingId: input.newBooking.id,
          eventTypeId: input.newBooking.eventTypeId,
          recipientEmail: input.newOrganizer.email,
          recipientName: input.newOrganizer.displayName,
          organizerDisplayName: input.newOrganizer.displayName,
          idempotencyKey: `booking-rescheduled:${input.oldBooking.id}:${input.newBooking.id}:organizer`,
        },
      ];

  const email = await Promise.all([
    sendBookingRescheduledEmail(env, {
      recipientEmail: input.newBooking.inviteeEmail,
      recipientName: input.newBooking.inviteeName,
      recipientRole: 'invitee',
      organizerDisplayName: input.newOrganizer.displayName,
      eventName: input.eventType.name,
      oldStartsAt: input.oldBooking.startsAt.toISOString(),
      newStartsAt: input.newBooking.startsAt.toISOString(),
      timezone: input.timezone,
      idempotencyKey: `booking-rescheduled:${input.oldBooking.id}:${input.newBooking.id}:invitee`,
    }),
    ...organizerNotifications.map((notification) =>
      sendBookingRescheduledEmail(env, {
        recipientEmail: notification.recipientEmail,
        recipientName: notification.recipientName,
        recipientRole: 'organizer',
        organizerDisplayName: notification.organizerDisplayName,
        eventName: input.eventType.name,
        oldStartsAt: input.oldBooking.startsAt.toISOString(),
        newStartsAt: input.newBooking.startsAt.toISOString(),
        timezone: input.timezone,
        idempotencyKey: notification.idempotencyKey,
      }),
    ),
  ]);

  const [inviteeEmailResult, ...organizerEmailResults] = email;
  if (inviteeEmailResult) {
    await tryRecordEmailDelivery(env, db, {
      organizerId: input.newBooking.organizerId,
      bookingId: input.newBooking.id,
      eventTypeId: input.newBooking.eventTypeId,
      recipientEmail: input.newBooking.inviteeEmail,
      emailType: 'booking_rescheduled',
      provider: inviteeEmailResult.provider,
      status: inviteeEmailResult.sent ? 'succeeded' : 'failed',
      ...(inviteeEmailResult.messageId ? { providerMessageId: inviteeEmailResult.messageId } : {}),
      ...(inviteeEmailResult.error ? { error: inviteeEmailResult.error } : {}),
    });
  }

  for (const [index, organizerEmailResult] of organizerEmailResults.entries()) {
    const notification = organizerNotifications[index];
    if (!notification || !organizerEmailResult) {
      continue;
    }

    await tryRecordEmailDelivery(env, db, {
      organizerId: notification.organizerId,
      bookingId: notification.bookingId,
      eventTypeId: notification.eventTypeId,
      recipientEmail: notification.recipientEmail,
      emailType: 'booking_rescheduled',
      provider: organizerEmailResult.provider,
      status: organizerEmailResult.sent ? 'succeeded' : 'failed',
      ...(organizerEmailResult.messageId ? { providerMessageId: organizerEmailResult.messageId } : {}),
      ...(organizerEmailResult.error ? { error: organizerEmailResult.error } : {}),
    });
  }

  return email;
};
