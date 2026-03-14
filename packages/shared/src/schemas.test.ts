import { describe, expect, it } from 'vitest';

import {
  availabilityRuleSchema,
  bookingActionTokenSchema,
  bookingCancelSchema,
  calendarConnectCompleteSchema,
  calendarConnectStartSchema,
  calendarSyncRequestSchema,
  calendarWritebackRunSchema,
  clerkAuthExchangeRequestSchema,
  devAuthBootstrapRequestSchema,
  analyticsRangeQuerySchema,
  analyticsTrackFunnelEventSchema,
  bookingCreateSchema,
  bookingRescheduleSchema,
  setNotificationRulesSchema,
  notificationsRunSchema,
  eventTypeCreateSchema,
  healthCheckSchema,
  timeOffCreateSchema,
  timeOffHolidayImportSchema,
  teamAddMemberSchema,
  teamBookingCreateSchema,
  teamCreateSchema,
  teamEventTypeCreateSchema,
  waitlistJoinSchema,
  webhookSubscriptionCreateSchema,
  webhookSubscriptionUpdateSchema,
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

  it('accepts webhook subscription create payloads', () => {
    const payload = webhookSubscriptionCreateSchema.parse({
      url: 'https://example.com/webhooks/opencalendly',
      events: ['booking.created', 'booking.canceled'],
      secret: 'whsec_super_secret',
    });

    expect(payload.events).toHaveLength(2);
  });

  it.each([
    'http://example.com/webhooks/opencalendly',
    'https://localhost/webhooks/opencalendly',
    'https://internal/webhooks/opencalendly',
    'https://127.0.0.1/webhooks/opencalendly',
    'https://[::1]/webhooks/opencalendly',
    'https://user:pass@example.com/webhooks/opencalendly',
  ])('rejects unsafe webhook subscription create payload URLs: %s', (url) => {
    const result = webhookSubscriptionCreateSchema.safeParse({
      url,
      events: ['booking.created'],
      secret: 'whsec_super_secret',
    });

    expect(result.success).toBe(false);
  });

  it('rejects empty webhook subscription update payloads', () => {
    const result = webhookSubscriptionUpdateSchema.safeParse({});
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
      dailyBookingLimit: 10,
      weeklyBookingLimit: 30,
      monthlyBookingLimit: 100,
    });

    expect(payload.slug).toBe('intro-call');
    expect(payload.dailyBookingLimit).toBe(10);
    expect(payload.weeklyBookingLimit).toBe(30);
    expect(payload.monthlyBookingLimit).toBe(100);
  });

  it.each([{ dailyBookingLimit: 0 }, { weeklyBookingLimit: 0 }, { monthlyBookingLimit: 0 }])(
    'rejects event type payloads with invalid booking caps: %o',
    (capPatch) => {
      const result = eventTypeCreateSchema.safeParse({
        name: 'Intro Call',
        slug: 'intro-call',
        durationMinutes: 30,
        locationType: 'video',
        ...capPatch,
      });

      expect(result.success).toBe(false);
    },
  );

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

  it('accepts manual time-off payloads', () => {
    const payload = timeOffCreateSchema.parse({
      startAt: '2026-03-10T09:00:00.000Z',
      endAt: '2026-03-10T17:00:00.000Z',
      reason: 'Out of office',
    });

    expect(payload.reason).toBe('Out of office');
  });

  it('rejects invalid time-off windows', () => {
    const result = timeOffCreateSchema.safeParse({
      startAt: '2026-03-10T17:00:00.000Z',
      endAt: '2026-03-10T09:00:00.000Z',
    });

    expect(result.success).toBe(false);
  });

  it('accepts holiday import payloads', () => {
    const payload = timeOffHolidayImportSchema.parse({
      locale: 'IN',
      year: 2026,
    });

    expect(payload.locale).toBe('IN');
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

  it('accepts clerk auth exchange payloads', () => {
    const payload = clerkAuthExchangeRequestSchema.parse({
      clerkToken: 'x'.repeat(64),
      username: 'demo-user',
      displayName: 'Demo User',
      timezone: 'Asia/Kolkata',
    });

    expect(payload.username).toBe('demo-user');
  });

  it('rejects invalid clerk auth exchange payloads', () => {
    const result = clerkAuthExchangeRequestSchema.safeParse({
      clerkToken: 'short',
      username: 'Invalid Spaces',
    });

    expect(result.success).toBe(false);
  });

  it('accepts empty dev auth bootstrap payloads', () => {
    expect(devAuthBootstrapRequestSchema.parse({})).toEqual({});
  });

  it('rejects invalid dev auth bootstrap emails', () => {
    const result = devAuthBootstrapRequestSchema.safeParse({
      email: 'not-an-email',
    });

    expect(result.success).toBe(false);
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

  it('accepts notification rules payloads', () => {
    const payload = setNotificationRulesSchema.parse({
      rules: [
        { notificationType: 'reminder', offsetMinutes: 60, isEnabled: true },
        { notificationType: 'follow_up', offsetMinutes: 120, isEnabled: true },
      ],
    });

    expect(payload.rules).toHaveLength(2);
  });

  it('rejects duplicate notification rules payloads', () => {
    const result = setNotificationRulesSchema.safeParse({
      rules: [
        { notificationType: 'reminder', offsetMinutes: 60, isEnabled: true },
        { notificationType: 'reminder', offsetMinutes: 60, isEnabled: false },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('accepts notifications runner payloads', () => {
    const payload = notificationsRunSchema.parse({
      limit: 25,
    });

    expect(payload.limit).toBe(25);
  });

  it('accepts waitlist join payloads', () => {
    const payload = waitlistJoinSchema.parse({
      email: 'demo@opencalendly.dev',
      source: 'demo-credits-exhausted',
      metadata: { timezone: 'Asia/Kolkata' },
    });

    expect(payload.source).toBe('demo-credits-exhausted');
  });

  it('accepts team create payloads', () => {
    const payload = teamCreateSchema.parse({
      name: 'Customer Success Team',
      slug: 'customer-success',
    });

    expect(payload.slug).toBe('customer-success');
  });

  it('accepts team member payloads', () => {
    const payload = teamAddMemberSchema.parse({
      userId: '5e8d2e15-f2e2-4a39-9c58-b0d2f8ef7ef2',
      role: 'member',
    });

    expect(payload.role).toBe('member');
  });

  it('accepts team event type payloads', () => {
    const payload = teamEventTypeCreateSchema.parse({
      teamId: '88d979f3-4700-4a1b-b8c0-b3e0940d8e9f',
      name: 'Team Intro',
      slug: 'team-intro',
      durationMinutes: 30,
      mode: 'round_robin',
      requiredMemberUserIds: ['5e8d2e15-f2e2-4a39-9c58-b0d2f8ef7ef2'],
    });

    expect(payload.mode).toBe('round_robin');
  });

  it('accepts team booking payloads', () => {
    const payload = teamBookingCreateSchema.parse({
      teamSlug: 'customer-success',
      eventSlug: 'team-intro',
      startsAt: '2026-03-01T15:00:00.000Z',
      inviteeName: 'Pat Lee',
      inviteeEmail: 'pat@example.com',
    });

    expect(payload.teamSlug).toBe('customer-success');
  });

  it('accepts calendar OAuth start payload', () => {
    const payload = calendarConnectStartSchema.parse({
      redirectUri: 'http://localhost:3000/settings/calendar/google/callback',
    });

    expect(payload.redirectUri).toContain('/settings/calendar/google/callback');
  });

  it('accepts calendar OAuth completion payload', () => {
    const payload = calendarConnectCompleteSchema.parse({
      code: '4/0AbCDefg123',
      state: 'x'.repeat(64),
      redirectUri: 'http://localhost:3000/settings/calendar/google/callback',
    });

    expect(payload.code).toContain('4/0');
  });

  it('rejects invalid calendar sync ranges', () => {
    const result = calendarSyncRequestSchema.safeParse({
      start: '2026-03-10T12:00:00.000Z',
      end: '2026-03-10T11:00:00.000Z',
    });

    expect(result.success).toBe(false);
  });

  it('accepts calendar writeback run payload', () => {
    const payload = calendarWritebackRunSchema.parse({
      limit: 25,
    });

    expect(payload.limit).toBe(25);
  });

  it('accepts analytics funnel tracking payload', () => {
    const payload = analyticsTrackFunnelEventSchema.parse({
      username: 'demo',
      eventSlug: 'intro-call',
      stage: 'page_view',
    });

    expect(payload.stage).toBe('page_view');
  });

  it('rejects booking_confirmed stage in public funnel tracking payload', () => {
    const result = analyticsTrackFunnelEventSchema.safeParse({
      username: 'demo',
      eventSlug: 'intro-call',
      stage: 'booking_confirmed',
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid analytics range filters', () => {
    const result = analyticsRangeQuerySchema.safeParse({
      startDate: '2026-04-30',
      endDate: '2026-04-01',
    });

    expect(result.success).toBe(false);
  });

  it('rejects malformed analytics calendar dates', () => {
    const result = analyticsRangeQuerySchema.safeParse({
      startDate: '2026-02-31',
      endDate: '2026-03-01',
    });

    expect(result.success).toBe(false);
  });
});
