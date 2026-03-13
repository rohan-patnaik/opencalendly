import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import {
  eventTypes,
  notificationRules,
  scheduledNotifications,
  users,
} from '@opencalendly/db';

import {
  buildScheduledNotificationsForBooking,
  resolveRunnerOutcome,
  type NotificationRuleType,
  toEmailDeliveryTypeForNotification,
} from '../lib/notification-workflows';
import {
  sendBookingFollowUpEmail,
  sendBookingReminderEmail,
} from '../lib/email';
import { normalizeTimezone } from './core';
import { NOTIFICATION_RUN_LEASE_MINUTES, NOTIFICATION_RUN_MAX_ATTEMPTS } from './env';
import { tryRecordEmailDelivery } from './telemetry';
import type { Bindings, Database } from './types';

export type NotificationRuleRow = {
  id: string;
  notificationType: NotificationRuleType;
  offsetMinutes: number;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type NotificationRunOutcome = {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  rowIds: string[];
};

export const listEventTypeNotificationRules = async (
  db: Pick<Database, 'select'>,
  input: { eventTypeId: string; organizerId: string },
): Promise<NotificationRuleRow[] | null> => {
  const [eventType] = await db
    .select({ id: eventTypes.id })
    .from(eventTypes)
    .where(and(eq(eventTypes.id, input.eventTypeId), eq(eventTypes.userId, input.organizerId)))
    .limit(1);

  if (!eventType) {
    return null;
  }

  return db
    .select({
      id: notificationRules.id,
      notificationType: notificationRules.notificationType,
      offsetMinutes: notificationRules.offsetMinutes,
      isEnabled: notificationRules.isEnabled,
      createdAt: notificationRules.createdAt,
      updatedAt: notificationRules.updatedAt,
    })
    .from(notificationRules)
    .where(eq(notificationRules.eventTypeId, input.eventTypeId))
    .orderBy(asc(notificationRules.notificationType), asc(notificationRules.offsetMinutes));
};

export const enqueueScheduledNotificationsForBooking = async (
  db: Pick<Database, 'select' | 'insert'>,
  input: {
    bookingId: string;
    organizerId: string;
    eventTypeId: string;
    inviteeEmail: string;
    inviteeName: string;
    startsAt: Date;
    endsAt: Date;
  },
): Promise<number> => {
  const rules = await db
    .select({
      id: notificationRules.id,
      notificationType: notificationRules.notificationType,
      offsetMinutes: notificationRules.offsetMinutes,
      isEnabled: notificationRules.isEnabled,
    })
    .from(notificationRules)
    .where(eq(notificationRules.eventTypeId, input.eventTypeId));

  const rows = buildScheduledNotificationsForBooking({
    booking: {
      bookingId: input.bookingId,
      organizerId: input.organizerId,
      eventTypeId: input.eventTypeId,
      inviteeEmail: input.inviteeEmail,
      inviteeName: input.inviteeName,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    },
    rules,
  });

  if (rows.length === 0) {
    return 0;
  }

  const inserted = await db
    .insert(scheduledNotifications)
    .values(rows)
    .onConflictDoNothing({
      target: [
        scheduledNotifications.bookingId,
        scheduledNotifications.notificationRuleId,
        scheduledNotifications.recipientEmail,
      ],
    })
    .returning({ id: scheduledNotifications.id });

  return inserted.length;
};

export const cancelPendingScheduledNotificationsForBooking = async (
  db: Pick<Database, 'update'>,
  input: { bookingId: string },
): Promise<number> => {
  const now = new Date();
  const updated = await db
    .update(scheduledNotifications)
    .set({
      status: 'canceled',
      canceledAt: now,
      leasedUntil: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(scheduledNotifications.bookingId, input.bookingId),
        inArray(scheduledNotifications.status, ['pending', 'failed']),
      ),
    )
    .returning({ id: scheduledNotifications.id });

  return updated.length;
};

export const claimDueScheduledNotificationRowIds = async (
  db: Pick<Database, 'transaction'>,
  input: { now: Date; organizerId: string; limit: number },
): Promise<string[]> => {
  const leaseUntil = new Date(input.now.getTime() + NOTIFICATION_RUN_LEASE_MINUTES * 60_000);

  return db.transaction(async (transaction) => {
    const claimed = await transaction.execute<{ id: string }>(sql`
      with due_rows as (
        select id
        from scheduled_notifications
        where organizer_id = ${input.organizerId}
          and status in ('pending', 'failed')
          and attempt_count < ${NOTIFICATION_RUN_MAX_ATTEMPTS}
          and send_at <= ${input.now}
          and (leased_until is null or leased_until <= ${input.now})
        order by send_at asc
        limit ${input.limit}
        for update skip locked
      )
      update scheduled_notifications as target
      set leased_until = ${leaseUntil},
          updated_at = ${input.now}
      from due_rows
      where target.id = due_rows.id
      returning target.id
    `);

    return claimed.rows.map((row) => row.id);
  });
};

export const runScheduledNotificationBatch = async (
  env: Bindings,
  db: Database,
  input: { organizerId: string; limit: number; now?: Date },
): Promise<NotificationRunOutcome> => {
  const now = input.now ?? new Date();
  const claimedRowIds = await claimDueScheduledNotificationRowIds(db, {
    now,
    organizerId: input.organizerId,
    limit: input.limit,
  });

  if (claimedRowIds.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, skipped: 0, rowIds: [] };
  }

  const dueRows = await db
    .select({
      id: scheduledNotifications.id,
      organizerId: scheduledNotifications.organizerId,
      bookingId: scheduledNotifications.bookingId,
      eventTypeId: scheduledNotifications.eventTypeId,
      notificationType: scheduledNotifications.notificationType,
      recipientEmail: scheduledNotifications.recipientEmail,
      recipientName: scheduledNotifications.recipientName,
      bookingStartsAt: scheduledNotifications.bookingStartsAt,
      status: scheduledNotifications.status,
      attemptCount: scheduledNotifications.attemptCount,
      eventTypeName: eventTypes.name,
      eventTypeLocationType: eventTypes.locationType,
      eventTypeLocationValue: eventTypes.locationValue,
      organizerDisplayName: users.displayName,
      organizerTimezone: users.timezone,
    })
    .from(scheduledNotifications)
    .innerJoin(eventTypes, eq(eventTypes.id, scheduledNotifications.eventTypeId))
    .innerJoin(users, eq(users.id, scheduledNotifications.organizerId))
    .where(inArray(scheduledNotifications.id, claimedRowIds))
    .orderBy(asc(scheduledNotifications.sendAt))
    .limit(input.limit);

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of dueRows) {
    const [current] = await db
      .select({
        status: scheduledNotifications.status,
        attemptCount: scheduledNotifications.attemptCount,
        leasedUntil: scheduledNotifications.leasedUntil,
      })
      .from(scheduledNotifications)
      .where(eq(scheduledNotifications.id, row.id))
      .limit(1);

    if (!current || !current.leasedUntil || (current.status !== 'pending' && current.status !== 'failed')) {
      await db
        .update(scheduledNotifications)
        .set({ leasedUntil: null, updatedAt: new Date() })
        .where(
          and(
            eq(scheduledNotifications.id, row.id),
            inArray(scheduledNotifications.status, ['pending', 'failed']),
          ),
        );
      skipped += 1;
      continue;
    }

    const sendResult =
      row.notificationType === 'reminder'
        ? await sendBookingReminderEmail(env, {
            recipientEmail: row.recipientEmail,
            recipientName: row.recipientName,
            organizerDisplayName: row.organizerDisplayName,
            eventName: row.eventTypeName,
            startsAt: row.bookingStartsAt.toISOString(),
            timezone: normalizeTimezone(row.organizerTimezone),
            locationType: row.eventTypeLocationType,
            locationValue: row.eventTypeLocationValue,
            idempotencyKey: `scheduled-notification:${row.id}`,
          })
        : await sendBookingFollowUpEmail(env, {
            recipientEmail: row.recipientEmail,
            recipientName: row.recipientName,
            organizerDisplayName: row.organizerDisplayName,
            eventName: row.eventTypeName,
            startsAt: row.bookingStartsAt.toISOString(),
            timezone: normalizeTimezone(row.organizerTimezone),
            idempotencyKey: `scheduled-notification:${row.id}`,
          });

    const outcome = resolveRunnerOutcome({
      currentStatus: current.status,
      attemptCount: current.attemptCount,
      now: new Date(),
      sendResult,
    });

    if (outcome.action === 'skip') {
      await db
        .update(scheduledNotifications)
        .set({ leasedUntil: null, updatedAt: new Date() })
        .where(
          and(
            eq(scheduledNotifications.id, row.id),
            inArray(scheduledNotifications.status, ['pending', 'failed']),
          ),
        );
      skipped += 1;
      continue;
    }

    await db
      .update(scheduledNotifications)
      .set(outcome.values)
      .where(
        and(
          eq(scheduledNotifications.id, row.id),
          inArray(scheduledNotifications.status, ['pending', 'failed']),
        ),
      );

    if (sendResult.sent) {
      succeeded += 1;
    } else {
      failed += 1;
    }

    await tryRecordEmailDelivery(env, db, {
      organizerId: row.organizerId,
      bookingId: row.bookingId,
      eventTypeId: row.eventTypeId,
      recipientEmail: row.recipientEmail,
      emailType: toEmailDeliveryTypeForNotification(row.notificationType),
      provider: sendResult.provider,
      status: sendResult.sent ? 'succeeded' : 'failed',
      ...(sendResult.messageId ? { providerMessageId: sendResult.messageId } : {}),
      ...(sendResult.error ? { error: sendResult.error } : {}),
    });
  }

  return {
    processed: dueRows.length,
    succeeded,
    failed,
    skipped,
    rowIds: dueRows.map((row) => row.id),
  };
};
