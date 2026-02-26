import { createHmac, randomUUID } from 'node:crypto';

import {
  webhookEventSchema,
  webhookEventTypeSchema,
  type WebhookEvent,
  type WebhookEventType,
} from '@opencalendly/shared';

export const WEBHOOK_DEFAULT_MAX_ATTEMPTS = 6;
export const WEBHOOK_RETRY_BASE_SECONDS = 30;
export const WEBHOOK_RETRY_MAX_SECONDS = 60 * 60;

export type BuildWebhookEventInput = {
  type: WebhookEventType;
  payload: {
    bookingId: string;
    eventTypeId: string;
    organizerId: string;
    inviteeEmail: string;
    inviteeName: string;
    startsAt: string;
    endsAt: string;
    metadata?: Record<string, unknown>;
  };
  id?: string;
  createdAt?: string;
};

export const normalizeWebhookEvents = (events: WebhookEventType[]): WebhookEventType[] => {
  return Array.from(new Set(events));
};

export const parseWebhookEventTypes = (value: unknown): WebhookEventType[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsed = value
    .map((entry) => webhookEventTypeSchema.safeParse(entry))
    .filter((entry) => entry.success)
    .map((entry) => entry.data);

  return normalizeWebhookEvents(parsed);
};

export const buildWebhookEvent = (input: BuildWebhookEventInput): WebhookEvent => {
  return webhookEventSchema.parse({
    id: input.id ?? randomUUID(),
    type: input.type,
    createdAt: input.createdAt ?? new Date().toISOString(),
    payload: input.payload,
  });
};

export const createWebhookSignature = (
  secret: string,
  serializedPayload: string,
  timestampSeconds: number,
): string => {
  return createHmac('sha256', secret).update(`${timestampSeconds}.${serializedPayload}`).digest('hex');
};

export const buildWebhookSignatureHeader = (
  secret: string,
  serializedPayload: string,
  timestampSeconds: number,
): string => {
  return `t=${timestampSeconds},v1=${createWebhookSignature(secret, serializedPayload, timestampSeconds)}`;
};

export const computeWebhookRetryDelaySeconds = (attemptNumber: number): number => {
  const safeAttempt = Math.max(1, Math.floor(attemptNumber));
  const uncappedDelay = WEBHOOK_RETRY_BASE_SECONDS * 2 ** (safeAttempt - 1);
  return Math.min(WEBHOOK_RETRY_MAX_SECONDS, uncappedDelay);
};

export const computeNextWebhookAttemptAt = (attemptNumber: number, now: Date = new Date()): Date => {
  const delaySeconds = computeWebhookRetryDelaySeconds(attemptNumber);
  return new Date(now.getTime() + delaySeconds * 1000);
};

export const isWebhookDeliveryExhausted = (attemptCount: number, maxAttempts: number): boolean => {
  return attemptCount >= maxAttempts;
};
