import { and, eq, lte } from 'drizzle-orm';

import { webhookDeliveries, webhookSubscriptions } from '@opencalendly/db';
import { webhookEventSchema } from '@opencalendly/shared';

import {
  WEBHOOK_DEFAULT_MAX_ATTEMPTS,
  buildWebhookEvent,
  buildWebhookSignatureHeader,
  computeNextWebhookAttemptAt,
  isWebhookDeliveryExhausted,
  parseWebhookEventTypes,
  resolveWebhookTargetSafety,
} from '../lib/webhooks';
import type {
  Database,
  PendingWebhookDelivery,
  WebhookEventType,
  WebhookSubscriptionRecord,
} from './types';

export type WebhookDeliveryRunResult = {
  processed: number;
  succeeded: number;
  retried: number;
  failed: number;
  rowIds: string[];
};

const toWebhookSubscriptionRecord = (value: {
  id: string;
  userId: string;
  url: string;
  secret: string;
  events: unknown;
  isActive: boolean;
}): WebhookSubscriptionRecord => {
  return {
    id: value.id,
    userId: value.userId,
    url: value.url,
    secret: value.secret,
    events: parseWebhookEventTypes(value.events),
    isActive: value.isActive,
  };
};

export const enqueueWebhookDeliveries = async (
  db: Database,
  input: {
    organizerId: string;
    type: WebhookEventType;
    booking: {
      id: string;
      eventTypeId: string;
      organizerId: string;
      inviteeEmail: string;
      inviteeName: string;
      startsAtIso: string;
      endsAtIso: string;
    };
    metadata?: Record<string, unknown>;
  },
): Promise<number> => {
  const subscriptions = await db
    .select({
      id: webhookSubscriptions.id,
      userId: webhookSubscriptions.userId,
      url: webhookSubscriptions.url,
      secret: webhookSubscriptions.secret,
      events: webhookSubscriptions.events,
      isActive: webhookSubscriptions.isActive,
    })
    .from(webhookSubscriptions)
    .where(and(eq(webhookSubscriptions.userId, input.organizerId), eq(webhookSubscriptions.isActive, true)));

  const matchingSubscriptions = subscriptions
    .map((subscription) => toWebhookSubscriptionRecord(subscription))
    .filter((subscription) => subscription.events.includes(input.type));

  if (matchingSubscriptions.length === 0) {
    return 0;
  }

  const event = buildWebhookEvent({
    type: input.type,
    payload: {
      bookingId: input.booking.id,
      eventTypeId: input.booking.eventTypeId,
      organizerId: input.booking.organizerId,
      inviteeEmail: input.booking.inviteeEmail,
      inviteeName: input.booking.inviteeName,
      startsAt: input.booking.startsAtIso,
      endsAt: input.booking.endsAtIso,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    },
  });

  const deliveryWrites: Array<typeof webhookDeliveries.$inferInsert> = matchingSubscriptions.map(
    (subscription) => ({
      subscriptionId: subscription.id,
      eventId: event.id,
      eventType: event.type,
      payload: event,
      status: 'pending',
      attemptCount: 0,
      maxAttempts: WEBHOOK_DEFAULT_MAX_ATTEMPTS,
      nextAttemptAt: new Date(event.createdAt),
    }),
  );

  await db
    .insert(webhookDeliveries)
    .values(deliveryWrites)
    .onConflictDoNothing({ target: [webhookDeliveries.subscriptionId, webhookDeliveries.eventId] });

  return matchingSubscriptions.length;
};

export const executeWebhookDelivery = async (
  db: Database,
  delivery: PendingWebhookDelivery,
): Promise<'succeeded' | 'retried' | 'failed'> => {
  const now = new Date();
  const targetSafety = await resolveWebhookTargetSafety(delivery.url);
  if (!targetSafety.ok && !targetSafety.retryable) {
    await db
      .update(webhookDeliveries)
      .set({
        status: 'failed',
        attemptCount: delivery.maxAttempts,
        lastAttemptAt: now,
        lastError: targetSafety.reason,
        nextAttemptAt: now,
        updatedAt: now,
      })
      .where(eq(webhookDeliveries.id, delivery.id));

    return 'failed';
  }

  if (!targetSafety.ok) {
    const attemptedCount = delivery.attemptCount + 1;
    const exhausted = isWebhookDeliveryExhausted(attemptedCount, delivery.maxAttempts);
    const status = exhausted ? 'failed' : 'pending';

    await db
      .update(webhookDeliveries)
      .set({
        status,
        attemptCount: attemptedCount,
        lastAttemptAt: now,
        lastError: targetSafety.reason,
        nextAttemptAt: exhausted ? now : computeNextWebhookAttemptAt(attemptedCount, now),
        updatedAt: now,
      })
      .where(eq(webhookDeliveries.id, delivery.id));

    return exhausted ? 'failed' : 'retried';
  }

  const serializedPayload = JSON.stringify(delivery.payload);
  const timestampSeconds = Math.floor(now.getTime() / 1000);
  const signature = buildWebhookSignatureHeader(delivery.secret, serializedPayload, timestampSeconds);

  let responseStatus: number | null = null;
  let errorMessage: string | null = null;

  try {
    const response = await fetch(delivery.url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenCalendly-Signature': signature,
        'X-OpenCalendly-Signature-Timestamp': String(timestampSeconds),
        'X-OpenCalendly-Delivery-Id': delivery.id,
        'X-OpenCalendly-Event': delivery.eventType,
        'X-OpenCalendly-Event-Id': delivery.eventId,
      },
      body: serializedPayload,
    });

    responseStatus = response.status;
    if (response.ok) {
      await db
        .update(webhookDeliveries)
        .set({
          status: 'succeeded',
          attemptCount: delivery.attemptCount + 1,
          lastAttemptAt: now,
          lastResponseStatus: response.status,
          lastError: null,
          nextAttemptAt: now,
          updatedAt: now,
        })
        .where(eq(webhookDeliveries.id, delivery.id));

      return 'succeeded';
    }

    const responseBody = await response.text();
    errorMessage = responseBody.slice(0, 2000) || `HTTP ${response.status}`;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Webhook delivery failed.';
  }

  const attemptedCount = delivery.attemptCount + 1;
  const exhausted = isWebhookDeliveryExhausted(attemptedCount, delivery.maxAttempts);
  if (exhausted) {
    await db
      .update(webhookDeliveries)
      .set({
        status: 'failed',
        attemptCount: attemptedCount,
        lastAttemptAt: now,
        ...(responseStatus !== null ? { lastResponseStatus: responseStatus } : {}),
        lastError: errorMessage,
        nextAttemptAt: now,
        updatedAt: now,
      })
      .where(eq(webhookDeliveries.id, delivery.id));
    return 'failed';
  }

  await db
    .update(webhookDeliveries)
    .set({
      status: 'pending',
      attemptCount: attemptedCount,
      lastAttemptAt: now,
      ...(responseStatus !== null ? { lastResponseStatus: responseStatus } : {}),
      lastError: errorMessage,
      nextAttemptAt: computeNextWebhookAttemptAt(attemptedCount, now),
      updatedAt: now,
    })
    .where(eq(webhookDeliveries.id, delivery.id));

  return 'retried';
};

export const runWebhookDeliveryBatch = async (
  db: Database,
  input: { organizerId: string; limit: number; now?: Date },
): Promise<WebhookDeliveryRunResult> => {
  const now = input.now ?? new Date();
  const dueRows = await db
    .select({
      id: webhookDeliveries.id,
      subscriptionId: webhookDeliveries.subscriptionId,
      eventId: webhookDeliveries.eventId,
      eventType: webhookDeliveries.eventType,
      payload: webhookDeliveries.payload,
      attemptCount: webhookDeliveries.attemptCount,
      maxAttempts: webhookDeliveries.maxAttempts,
      url: webhookSubscriptions.url,
      secret: webhookSubscriptions.secret,
    })
    .from(webhookDeliveries)
    .innerJoin(webhookSubscriptions, eq(webhookSubscriptions.id, webhookDeliveries.subscriptionId))
    .where(
      and(
        eq(webhookSubscriptions.userId, input.organizerId),
        eq(webhookDeliveries.status, 'pending'),
        lte(webhookDeliveries.nextAttemptAt, now),
      ),
    )
    .orderBy(webhookDeliveries.nextAttemptAt)
    .limit(input.limit);

  const deliveries: PendingWebhookDelivery[] = [];
  let failed = 0;

  for (const row of dueRows) {
    const eventType = parseWebhookEventTypes([row.eventType])[0];
    const payload = webhookEventSchema.safeParse(row.payload);
    if (!eventType || !payload.success) {
      const invalidNow = new Date();
      await db
        .update(webhookDeliveries)
        .set({
          status: 'failed',
          attemptCount: row.maxAttempts,
          lastAttemptAt: invalidNow,
          lastError: 'Delivery payload failed validation.',
          nextAttemptAt: invalidNow,
          updatedAt: invalidNow,
        })
        .where(eq(webhookDeliveries.id, row.id));
      failed += 1;
      continue;
    }

    deliveries.push({
      id: row.id,
      subscriptionId: row.subscriptionId,
      url: row.url,
      secret: row.secret,
      eventId: row.eventId,
      eventType,
      payload: payload.data,
      attemptCount: row.attemptCount,
      maxAttempts: row.maxAttempts,
    });
  }

  let succeeded = 0;
  let retried = 0;
  for (const delivery of deliveries) {
    const outcome = await executeWebhookDelivery(db, delivery);
    if (outcome === 'succeeded') {
      succeeded += 1;
    } else if (outcome === 'retried') {
      retried += 1;
    } else {
      failed += 1;
    }
  }

  return {
    processed: dueRows.length,
    succeeded,
    retried,
    failed,
    rowIds: dueRows.map((row) => row.id),
  };
};
