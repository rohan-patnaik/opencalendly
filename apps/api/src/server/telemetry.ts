import { analyticsFunnelEvents, emailDeliveries } from '@opencalendly/db';

import { hmacToken } from '../lib/auth';
import { type AnalyticsFunnelStage } from '../lib/analytics';
import { resolveTelemetryHmacKey } from './env';
import type { Bindings, Database, EmailDeliveryType } from './types';

type AnalyticsFunnelEventWrite = {
  organizerId: string;
  eventTypeId: string;
  stage: AnalyticsFunnelStage;
  teamEventTypeId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
};

type EmailDeliveryWrite = {
  organizerId: string;
  bookingId: string;
  eventTypeId: string;
  recipientEmail: string;
  emailType: EmailDeliveryType;
  provider: string;
  status: 'succeeded' | 'failed';
  providerMessageId?: string;
  error?: string;
};

export const recordAnalyticsFunnelEvent = async (
  db: Database,
  input: AnalyticsFunnelEventWrite,
): Promise<void> => {
  await db.insert(analyticsFunnelEvents).values({
    organizerId: input.organizerId,
    eventTypeId: input.eventTypeId,
    ...(input.teamEventTypeId ? { teamEventTypeId: input.teamEventTypeId } : {}),
    stage: input.stage,
    ...(input.metadata ? { metadata: input.metadata } : {}),
    ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
  });
};

export const tryRecordAnalyticsFunnelEvent = async (
  db: Database,
  input: AnalyticsFunnelEventWrite,
): Promise<void> => {
  await recordAnalyticsFunnelEvent(db, input).catch((error) => {
    console.warn('analytics_funnel_event_write_failed', {
      eventTypeId: input.eventTypeId,
      stage: input.stage,
      error: error instanceof Error ? error.message : 'unknown',
    });
  });
};

const hashEmailForTelemetry = (email: string, telemetryHmacKey: string): string => {
  return hmacToken(email.trim().toLowerCase(), telemetryHmacKey);
};

export const recordEmailDelivery = async (
  db: Database,
  telemetryHmacKey: string,
  input: EmailDeliveryWrite,
): Promise<void> => {
  await db.insert(emailDeliveries).values({
    organizerId: input.organizerId,
    bookingId: input.bookingId,
    eventTypeId: input.eventTypeId,
    recipientEmailHash: hashEmailForTelemetry(input.recipientEmail, telemetryHmacKey),
    emailType: input.emailType,
    provider: input.provider,
    status: input.status,
    ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
    ...(input.error ? { error: input.error.slice(0, 1000) } : {}),
  });
};

export const tryRecordEmailDelivery = async (
  env: Bindings,
  db: Database,
  input: EmailDeliveryWrite,
): Promise<void> => {
  const telemetryHmacKey = resolveTelemetryHmacKey(env);
  if (!telemetryHmacKey) {
    console.warn('email_delivery_write_failed', {
      bookingId: input.bookingId,
      emailType: input.emailType,
      status: input.status,
      error: 'missing_telemetry_hmac_key',
    });
    return;
  }

  await recordEmailDelivery(db, telemetryHmacKey, input).catch((error) => {
    console.warn('email_delivery_write_failed', {
      bookingId: input.bookingId,
      emailType: input.emailType,
      status: input.status,
      error: error instanceof Error ? error.message : 'unknown',
    });
  });
};
