import { describe, expect, it } from 'vitest';

import {
  availabilityRuleSchema,
  bookingActionTokenSchema,
  bookingCancelSchema,
  bookingCreateSchema,
  bookingRescheduleSchema,
  eventTypeCreateSchema,
  healthCheckSchema,
  magicLinkRequestSchema,
  webhookEventSchema,
} from './schemas';

describe('shared schemas', () => {
  it('accepts valid health check payload', () => {
    expect(healthCheckSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('rejects invalid webhook events', () => {
    const result = webhookEventSchema.safeParse({ type: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('accepts event type payloads with booking questions', () => {
    const payload = eventTypeCreateSchema.parse({
      name: 'Intro Call',
      slug: 'intro-call',
      durationMinutes: 30,
      locationType: 'video',
      locationValue: 'https://meet.example.com/demo',
      questions: [
        {
          id: 'company',
          label: 'Company',
          required: false,
        },
      ],
    });

    expect(payload.slug).toBe('intro-call');
  });

  it('rejects invalid availability windows', () => {
    const result = availabilityRuleSchema.safeParse({
      dayOfWeek: 1,
      startMinute: 600,
      endMinute: 540,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 5,
    });

    expect(result.success).toBe(false);
  });

  it('accepts booking commit payload', () => {
    const payload = bookingCreateSchema.parse({
      username: 'demo',
      eventSlug: 'intro-call',
      startsAt: '2026-03-01T15:00:00.000Z',
      inviteeName: 'Pat Lee',
      inviteeEmail: 'pat@example.com',
      answers: { company: 'Acme' },
    });

    expect(payload.answers?.company).toBe('Acme');
  });

  it('accepts booking action token payloads', () => {
    const token = 'a'.repeat(64);
    expect(bookingActionTokenSchema.parse(token)).toBe(token);
  });

  it('accepts booking cancellation payloads', () => {
    const payload = bookingCancelSchema.parse({
      reason: 'Need to move this by a day.',
    });

    expect(payload.reason).toContain('move');
  });

  it('accepts booking reschedule payloads', () => {
    const payload = bookingRescheduleSchema.parse({
      startsAt: '2026-03-02T16:00:00.000Z',
      timezone: 'Asia/Kolkata',
    });

    expect(payload.timezone).toBe('Asia/Kolkata');
  });

  it('rejects malformed auth payload', () => {
    const result = magicLinkRequestSchema.safeParse({
      email: 'not-an-email',
    });

    expect(result.success).toBe(false);
  });
});
