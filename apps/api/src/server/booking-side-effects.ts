import { sendBookingCancellationEmail, sendBookingConfirmationEmail, sendBookingRescheduledEmail } from '../lib/email';
import { enqueueWebhookDeliveries } from './webhook-deliveries';
import { enqueueCalendarWritebacksForBooking } from './calendar-writeback-queue';
import { runCalendarWritebackBatch } from './calendar-writeback-runner';
import { tryRecordAnalyticsFunnelEvent, tryRecordEmailDelivery } from './telemetry';
import type { Bindings, Database } from './types';
import { clampCalendarWritebackBatchLimit } from './env';

type BookingRecord = {
  id: string;
  eventTypeId: string;
  organizerId: string;
  inviteeName: string;
  inviteeEmail: string;
  startsAt: Date;
  endsAt: Date;
};

type EventTypeRecord = {
  name: string;
  locationType: string;
  locationValue: string | null;
};

type ActionUrls = {
  lookupCancelUrl: string;
  lookupRescheduleUrl: string;
  cancelUrl: string;
  rescheduleUrl: string;
  cancelPageUrl: string;
  reschedulePageUrl: string;
};

const emptyWritebackResult = {
  queued: 0,
  processed: 0,
  succeeded: 0,
  retried: 0,
  failed: 0,
};

const runImmediateWriteback = async (
  db: Database,
  env: Bindings,
  input: Parameters<typeof enqueueCalendarWritebacksForBooking>[1],
) => {
  const queue = await enqueueCalendarWritebacksForBooking(db, input);
  if (queue.queued === 0) {
    return emptyWritebackResult;
  }

  const outcome = await runCalendarWritebackBatch(db, env, {
    organizerId: input.organizerId,
    rowIds: queue.rowIds,
    limit: clampCalendarWritebackBatchLimit(queue.queued),
  });

  return { queued: queue.queued, ...outcome };
};

export const runBookingCreatedSideEffects = async (
  env: Bindings,
  db: Database,
  input: {
    booking: BookingRecord;
    eventType: EventTypeRecord;
    organizerDisplayName: string;
    timezone: string;
    actionUrls: ActionUrls;
    webhookMetadata?: Record<string, unknown>;
    analytics?: { teamEventTypeId?: string | null };
  },
) => {
  await tryRecordAnalyticsFunnelEvent(db, {
    organizerId: input.booking.organizerId,
    eventTypeId: input.booking.eventTypeId,
    ...(input.analytics?.teamEventTypeId ? { teamEventTypeId: input.analytics.teamEventTypeId } : {}),
    stage: 'booking_confirmed',
    occurredAt: new Date(),
  });

  const email = await sendBookingConfirmationEmail(env, {
    inviteeEmail: input.booking.inviteeEmail,
    inviteeName: input.booking.inviteeName,
    organizerDisplayName: input.organizerDisplayName,
    eventName: input.eventType.name,
    startsAt: input.booking.startsAt.toISOString(),
    timezone: input.timezone,
    locationType: input.eventType.locationType,
    locationValue: input.eventType.locationValue,
    cancelLink: input.actionUrls.cancelPageUrl,
    rescheduleLink: input.actionUrls.reschedulePageUrl,
    idempotencyKey: `booking-confirmation:${input.booking.id}`,
  });

  await tryRecordEmailDelivery(env, db, {
    organizerId: input.booking.organizerId,
    bookingId: input.booking.id,
    eventTypeId: input.booking.eventTypeId,
    recipientEmail: input.booking.inviteeEmail,
    emailType: 'booking_confirmation',
    provider: email.provider,
    status: email.sent ? 'succeeded' : 'failed',
    ...(email.messageId ? { providerMessageId: email.messageId } : {}),
    ...(email.error ? { error: email.error } : {}),
  });

  const queuedWebhookDeliveries = await enqueueWebhookDeliveries(db, {
    organizerId: input.booking.organizerId,
    type: 'booking.created',
    booking: {
      id: input.booking.id,
      eventTypeId: input.booking.eventTypeId,
      organizerId: input.booking.organizerId,
      inviteeEmail: input.booking.inviteeEmail,
      inviteeName: input.booking.inviteeName,
      startsAtIso: input.booking.startsAt.toISOString(),
      endsAtIso: input.booking.endsAt.toISOString(),
    },
    metadata: {
      actionLookupCancelUrl: input.actionUrls.lookupCancelUrl,
      actionLookupRescheduleUrl: input.actionUrls.lookupRescheduleUrl,
      ...(input.webhookMetadata ?? {}),
    },
  });

  return {
    email,
    queuedWebhookDeliveries,
    calendarWriteback: await runImmediateWriteback(db, env, {
      bookingId: input.booking.id,
      organizerId: input.booking.organizerId,
      operation: 'create',
    }),
  };
};

export const runBookingCancellationSideEffects = async (
  env: Bindings,
  db: Database,
  input: {
    booking: BookingRecord & { status: string };
    eventType: { name: string };
    organizer: { email: string; displayName: string };
    timezone: string;
    cancellationReason?: string | null;
    alreadyProcessed: boolean;
  },
) => {
  const email = input.alreadyProcessed
    ? {
        sent: false,
        provider: 'none' as const,
        error: 'Idempotent replay: cancellation already processed.',
      }
    : await Promise.all([
        sendBookingCancellationEmail(env, {
          recipientEmail: input.booking.inviteeEmail,
          recipientName: input.booking.inviteeName,
          recipientRole: 'invitee',
          organizerDisplayName: input.organizer.displayName,
          eventName: input.eventType.name,
          startsAt: input.booking.startsAt.toISOString(),
          timezone: input.timezone,
          cancellationReason: input.cancellationReason ?? null,
          idempotencyKey: `booking-cancel:${input.booking.id}:invitee`,
        }),
        sendBookingCancellationEmail(env, {
          recipientEmail: input.organizer.email,
          recipientName: input.organizer.displayName,
          recipientRole: 'organizer',
          organizerDisplayName: input.organizer.displayName,
          eventName: input.eventType.name,
          startsAt: input.booking.startsAt.toISOString(),
          timezone: input.timezone,
          cancellationReason: input.cancellationReason ?? null,
          idempotencyKey: `booking-cancel:${input.booking.id}:organizer`,
        }),
      ]);

  if (!input.alreadyProcessed && Array.isArray(email)) {
    const [inviteeEmailResult, organizerEmailResult] = email;
    if (inviteeEmailResult) {
      await tryRecordEmailDelivery(env, db, {
        organizerId: input.booking.organizerId,
        bookingId: input.booking.id,
        eventTypeId: input.booking.eventTypeId,
        recipientEmail: input.booking.inviteeEmail,
        emailType: 'booking_cancellation',
        provider: inviteeEmailResult.provider,
        status: inviteeEmailResult.sent ? 'succeeded' : 'failed',
        ...(inviteeEmailResult.messageId ? { providerMessageId: inviteeEmailResult.messageId } : {}),
        ...(inviteeEmailResult.error ? { error: inviteeEmailResult.error } : {}),
      });
    }
    if (organizerEmailResult) {
      await tryRecordEmailDelivery(env, db, {
        organizerId: input.booking.organizerId,
        bookingId: input.booking.id,
        eventTypeId: input.booking.eventTypeId,
        recipientEmail: input.organizer.email,
        emailType: 'booking_cancellation',
        provider: organizerEmailResult.provider,
        status: organizerEmailResult.sent ? 'succeeded' : 'failed',
        ...(organizerEmailResult.messageId ? { providerMessageId: organizerEmailResult.messageId } : {}),
        ...(organizerEmailResult.error ? { error: organizerEmailResult.error } : {}),
      });
    }
  }

  const queuedWebhookDeliveries = input.alreadyProcessed
    ? 0
    : await enqueueWebhookDeliveries(db, {
        organizerId: input.booking.organizerId,
        type: 'booking.canceled',
        booking: {
          id: input.booking.id,
          eventTypeId: input.booking.eventTypeId,
          organizerId: input.booking.organizerId,
          inviteeEmail: input.booking.inviteeEmail,
          inviteeName: input.booking.inviteeName,
          startsAtIso: input.booking.startsAt.toISOString(),
          endsAtIso: input.booking.endsAt.toISOString(),
        },
        metadata: { cancellationReason: input.cancellationReason ?? null },
      });

  return {
    email,
    queuedWebhookDeliveries,
    calendarWriteback: input.alreadyProcessed
      ? emptyWritebackResult
      : await runImmediateWriteback(db, env, {
          bookingId: input.booking.id,
          organizerId: input.booking.organizerId,
          operation: 'cancel',
        }),
  };
};

export const runBookingRescheduleSideEffects = async (
  env: Bindings,
  db: Database,
  input: {
    oldBooking: BookingRecord & { status: string };
    newBooking: BookingRecord;
    eventType: { name: string };
    organizer: { email: string; displayName: string };
    timezone: string;
    alreadyProcessed: boolean;
  },
) => {
  const email = input.alreadyProcessed
    ? {
        sent: false,
        provider: 'none' as const,
        error: 'Idempotent replay: reschedule already processed.',
      }
    : await Promise.all([
        sendBookingRescheduledEmail(env, {
          recipientEmail: input.newBooking.inviteeEmail,
          recipientName: input.newBooking.inviteeName,
          recipientRole: 'invitee',
          organizerDisplayName: input.organizer.displayName,
          eventName: input.eventType.name,
          oldStartsAt: input.oldBooking.startsAt.toISOString(),
          newStartsAt: input.newBooking.startsAt.toISOString(),
          timezone: input.timezone,
          idempotencyKey: `booking-rescheduled:${input.oldBooking.id}:${input.newBooking.id}:invitee`,
        }),
        sendBookingRescheduledEmail(env, {
          recipientEmail: input.organizer.email,
          recipientName: input.organizer.displayName,
          recipientRole: 'organizer',
          organizerDisplayName: input.organizer.displayName,
          eventName: input.eventType.name,
          oldStartsAt: input.oldBooking.startsAt.toISOString(),
          newStartsAt: input.newBooking.startsAt.toISOString(),
          timezone: input.timezone,
          idempotencyKey: `booking-rescheduled:${input.oldBooking.id}:${input.newBooking.id}:organizer`,
        }),
      ]);

  if (!input.alreadyProcessed && Array.isArray(email)) {
    const [inviteeEmailResult, organizerEmailResult] = email;
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
    if (organizerEmailResult) {
      await tryRecordEmailDelivery(env, db, {
        organizerId: input.newBooking.organizerId,
        bookingId: input.newBooking.id,
        eventTypeId: input.newBooking.eventTypeId,
        recipientEmail: input.organizer.email,
        emailType: 'booking_rescheduled',
        provider: organizerEmailResult.provider,
        status: organizerEmailResult.sent ? 'succeeded' : 'failed',
        ...(organizerEmailResult.messageId ? { providerMessageId: organizerEmailResult.messageId } : {}),
        ...(organizerEmailResult.error ? { error: organizerEmailResult.error } : {}),
      });
    }
  }

  const queuedWebhookDeliveries = input.alreadyProcessed
    ? 0
    : await enqueueWebhookDeliveries(db, {
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
      });

  return {
    email,
    queuedWebhookDeliveries,
    calendarWriteback: input.alreadyProcessed
      ? emptyWritebackResult
      : await runImmediateWriteback(db, env, {
          bookingId: input.oldBooking.id,
          organizerId: input.newBooking.organizerId,
          operation: 'reschedule',
          rescheduleTarget: {
            bookingId: input.newBooking.id,
            startsAtIso: input.newBooking.startsAt.toISOString(),
            endsAtIso: input.newBooking.endsAt.toISOString(),
          },
        }),
  };
};
