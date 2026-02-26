import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  buildWebhookEvent,
  buildWebhookSignatureHeader,
  computeNextWebhookAttemptAt,
  computeWebhookRetryDelaySeconds,
  isWebhookDeliveryExhausted,
  normalizeWebhookEvents,
} from './webhooks';

describe('webhook helpers', () => {
  it('builds webhook events with valid payload shape', () => {
    const event = buildWebhookEvent({
      id: '3f98795f-b12c-4682-8b87-0f6cfcbce33d',
      createdAt: '2026-02-26T07:45:00.000Z',
      type: 'booking.created',
      payload: {
        bookingId: '526c8230-6f9e-4332-81cb-2f6d3e3ef105',
        eventTypeId: '6f2799fb-f5ca-4f21-b0df-4b3f43a84d82',
        organizerId: '7f7a3e89-863a-4651-8ffc-8e28d6dc6fd2',
        inviteeEmail: 'pat@example.com',
        inviteeName: 'Pat Lee',
        startsAt: '2026-03-01T10:00:00.000Z',
        endsAt: '2026-03-01T10:30:00.000Z',
      },
    });

    expect(event.type).toBe('booking.created');
    expect(event.payload.inviteeEmail).toBe('pat@example.com');
  });

  it('builds deterministic signature headers', () => {
    const secret = 'whsec_test_secret';
    const payload = '{"ok":true}';
    const timestamp = 1_772_094_000;

    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    expect(buildWebhookSignatureHeader(secret, payload, timestamp)).toBe(
      `t=${timestamp},v1=${expected}`,
    );
  });

  it('computes exponential retry schedule with cap', () => {
    expect(computeWebhookRetryDelaySeconds(1)).toBe(30);
    expect(computeWebhookRetryDelaySeconds(2)).toBe(60);
    expect(computeWebhookRetryDelaySeconds(3)).toBe(120);
    expect(computeWebhookRetryDelaySeconds(8)).toBe(3600);
  });

  it('computes the next retry timestamp from attempt count', () => {
    const start = new Date('2026-02-26T08:00:00.000Z');
    const next = computeNextWebhookAttemptAt(2, start);
    expect(next.toISOString()).toBe('2026-02-26T08:01:00.000Z');
  });

  it('marks delivery exhaustion by attempt threshold', () => {
    expect(isWebhookDeliveryExhausted(5, 6)).toBe(false);
    expect(isWebhookDeliveryExhausted(6, 6)).toBe(true);
  });

  it('normalizes webhook event lists by removing duplicates', () => {
    expect(
      normalizeWebhookEvents([
        'booking.created',
        'booking.created',
        'booking.canceled',
      ]),
    ).toEqual(['booking.created', 'booking.canceled']);
  });
});
