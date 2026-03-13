import { z } from 'zod';

export const healthCheckSchema = z.object({
  status: z.literal('ok'),
});

const usernamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const questionIdPattern = /^[a-zA-Z0-9_-]+$/;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const ipv4SegmentPattern = /^(25[0-5]|2[0-4]\d|1?\d?\d)$/;
const ipv6HostnamePattern = /^[0-9a-f:.]+$/i;

const isValidIsoDate = (value: string): boolean => {
  if (!isoDatePattern.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.toISOString().slice(0, 10) === value;
};

const stripIpv6Brackets = (value: string): string => value.replace(/^\[(.*)\]$/, '$1');

const isIpv4Literal = (value: string): boolean => {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => ipv4SegmentPattern.test(part));
};

const isIpv6Literal = (value: string): boolean => {
  const normalized = stripIpv6Brackets(value);
  return normalized.includes(':') && ipv6HostnamePattern.test(normalized);
};

export const isSafeWebhookTargetUrl = (value: string): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    return false;
  }

  const hostname = stripIpv6Brackets(parsed.hostname.trim().toLowerCase());
  if (!hostname) {
    return false;
  }

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return false;
  }

  if (
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.home') ||
    hostname.endsWith('.lan')
  ) {
    return false;
  }

  if (isIpv4Literal(hostname) || isIpv6Literal(hostname)) {
    return false;
  }

  if (!hostname.includes('.')) {
    return false;
  }

  return true;
};

const isoDateSchema = z.string().refine(isValidIsoDate, {
  message: 'Invalid date. Use YYYY-MM-DD.',
});

export const timezoneSchema = z.string().min(1).max(80);
export const usernameSchema = z.string().min(3).max(64).regex(usernamePattern);
export const eventSlugSchema = z.string().min(2).max(80).regex(slugPattern);
export const emailSchema = z.string().email().max(320);

export const eventQuestionSchema = z.object({
  id: z.string().min(1).max(64).regex(questionIdPattern),
  label: z.string().min(1).max(120),
  required: z.boolean(),
  placeholder: z.string().min(1).max(160).optional(),
});

export const eventQuestionsSchema = z.array(eventQuestionSchema).max(20);
export const locationTypeSchema = z.enum(['video', 'phone', 'in_person', 'custom']);
export const teamMemberRoleSchema = z.enum(['owner', 'member']);
export const teamSchedulingModeSchema = z.enum(['round_robin', 'collective']);
export const bookingLimitSchema = z.number().int().min(1).max(1000);

export const clerkAuthExchangeRequestSchema = z.object({
  clerkToken: z.string().min(20).max(4096),
  username: usernameSchema.optional(),
  displayName: z.string().min(1).max(120).optional(),
  timezone: timezoneSchema.optional(),
});

export const devAuthBootstrapRequestSchema = z.object({
  email: emailSchema.optional(),
});
export type DevAuthBootstrapRequest = z.infer<typeof devAuthBootstrapRequestSchema>;

export const bookingActionTokenSchema = z.string().min(32).max(256);
export const bookingActionTypeSchema = z.enum(['cancel', 'reschedule']);

export const eventTypeCreateSchema = z.object({
  name: z.string().min(1).max(120),
  slug: eventSlugSchema,
  durationMinutes: z.number().int().min(5).max(240),
  locationType: locationTypeSchema,
  locationValue: z.string().max(500).nullish(),
  questions: eventQuestionsSchema.default([]),
  dailyBookingLimit: bookingLimitSchema.nullish(),
  weeklyBookingLimit: bookingLimitSchema.nullish(),
  monthlyBookingLimit: bookingLimitSchema.nullish(),
});

export const eventTypeUpdateSchema = eventTypeCreateSchema
  .partial()
  .extend({
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  });

export const teamCreateSchema = z.object({
  name: z.string().min(1).max(120),
  slug: eventSlugSchema,
});

export const teamAddMemberSchema = z.object({
  userId: z.string().uuid(),
  role: teamMemberRoleSchema.default('member'),
});

export const teamEventTypeCreateSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().min(1).max(120),
  slug: eventSlugSchema,
  durationMinutes: z.number().int().min(5).max(240),
  mode: teamSchedulingModeSchema,
  locationType: locationTypeSchema.default('video'),
  locationValue: z.string().max(500).nullish(),
  questions: eventQuestionsSchema.default([]),
  dailyBookingLimit: bookingLimitSchema.nullish(),
  weeklyBookingLimit: bookingLimitSchema.nullish(),
  monthlyBookingLimit: bookingLimitSchema.nullish(),
  requiredMemberUserIds: z.array(z.string().uuid()).min(1).max(100).optional(),
});

export const availabilityRuleSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
    bufferBeforeMinutes: z.number().int().min(0).max(180),
    bufferAfterMinutes: z.number().int().min(0).max(180),
  })
  .refine((value) => value.endMinute > value.startMinute, {
    message: 'endMinute must be greater than startMinute.',
  });

export const availabilityOverrideSchema = z
  .object({
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    isAvailable: z.boolean(),
    reason: z.string().max(300).nullish(),
  })
  .refine((value) => Date.parse(value.endAt) > Date.parse(value.startAt), {
    message: 'endAt must be after startAt.',
  });

export const setAvailabilityRulesSchema = z.object({
  rules: z.array(availabilityRuleSchema).max(50),
});

export const setAvailabilityOverridesSchema = z.object({
  overrides: z.array(availabilityOverrideSchema).max(200),
});

export const timeOffCreateSchema = z
  .object({
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    reason: z.string().max(300).nullish(),
  })
  .refine((value) => Date.parse(value.endAt) > Date.parse(value.startAt), {
    message: 'endAt must be after startAt.',
  });

export const timeOffHolidayImportSchema = z.object({
  locale: z.enum(['IN', 'US']),
  year: z.number().int().min(2000).max(2100),
});

export const availabilityQuerySchema = z.object({
  timezone: timezoneSchema.optional(),
  start: z.string().datetime({ offset: true }).optional(),
  days: z.coerce.number().int().min(1).max(30).optional(),
});

export const bookingCreateSchema = z.object({
  username: usernameSchema,
  eventSlug: eventSlugSchema,
  startsAt: z.string().datetime({ offset: true }),
  timezone: timezoneSchema.optional(),
  inviteeName: z.string().min(1).max(120),
  inviteeEmail: emailSchema,
  answers: z.record(z.string(), z.string()).optional(),
});

export const teamBookingCreateSchema = z.object({
  teamSlug: eventSlugSchema,
  eventSlug: eventSlugSchema,
  startsAt: z.string().datetime({ offset: true }),
  timezone: timezoneSchema.optional(),
  inviteeName: z.string().min(1).max(120),
  inviteeEmail: emailSchema,
  answers: z.record(z.string(), z.string()).optional(),
});

export const bookingCancelSchema = z.object({
  reason: z.string().min(1).max(500).nullish(),
});

export const bookingRescheduleSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  timezone: timezoneSchema.optional(),
});

export const notificationRuleTypeSchema = z.enum(['reminder', 'follow_up']);
export const notificationRuleSchema = z.object({
  notificationType: notificationRuleTypeSchema,
  offsetMinutes: z.number().int().min(1).max(10080),
  isEnabled: z.boolean().default(true),
});

export const setNotificationRulesSchema = z
  .object({
    rules: z.array(notificationRuleSchema).max(20),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.rules.forEach((rule, index) => {
      const key = `${rule.notificationType}:${rule.offsetMinutes}`;
      if (seen.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate notification rules are not allowed.',
          path: ['rules', index],
        });
      }
      seen.add(key);
    });
  });

export const notificationsRunSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});

export const waitlistJoinSchema = z.object({
  email: emailSchema,
  source: z.string().min(1).max(80).default('demo-credits-exhausted'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const webhookEventTypeSchema = z.enum([
  'booking.created',
  'booking.canceled',
  'booking.rescheduled',
]);

export const calendarProviderSchema = z.enum(['google', 'microsoft']);

export const calendarConnectStartSchema = z.object({
  redirectUri: z.string().url().max(2000),
});

export const calendarConnectCompleteSchema = z.object({
  code: z.string().min(8).max(4096),
  state: z.string().min(32).max(4096),
  redirectUri: z.string().url().max(2000),
});

export const calendarSyncRequestSchema = z
  .object({
    start: z.string().datetime({ offset: true }).optional(),
    end: z.string().datetime({ offset: true }).optional(),
  })
  .refine(
    (value) => {
      if (!value.start || !value.end) {
        return true;
      }
      return Date.parse(value.end) > Date.parse(value.start);
    },
    {
      message: 'end must be after start.',
    },
  );

export const calendarWritebackRunSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});

export const analyticsFunnelStageSchema = z.enum(['page_view', 'slot_selection', 'booking_confirmed']);
export const analyticsTrackFunnelEventSchema = z.object({
  username: usernameSchema,
  eventSlug: eventSlugSchema,
  stage: analyticsFunnelStageSchema.exclude(['booking_confirmed']),
});

export const analyticsRangeQuerySchema = z
  .object({
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema.optional(),
    eventTypeId: z.string().uuid().optional(),
    teamId: z.string().uuid().optional(),
  })
  .refine(
    (value) => {
      if (!value.startDate || !value.endDate) {
        return true;
      }
      return value.endDate >= value.startDate;
    },
    {
      message: 'endDate must be on or after startDate.',
      path: ['endDate'],
    },
  );

export const webhookSubscriptionCreateSchema = z.object({
  url: z.string().url().max(2000).refine(isSafeWebhookTargetUrl, {
    message: 'Use an HTTPS webhook URL with a public hostname.',
  }),
  events: z.array(webhookEventTypeSchema).min(1).max(3),
  secret: z.string().min(8).max(200),
});

export const webhookSubscriptionUpdateSchema = z
  .object({
    url: z
      .string()
      .url()
      .max(2000)
      .refine(isSafeWebhookTargetUrl, {
        message: 'Use an HTTPS webhook URL with a public hostname.',
      })
      .optional(),
    events: z.array(webhookEventTypeSchema).min(1).max(3).optional(),
    secret: z.string().min(8).max(200).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  });

export const webhookEventPayloadSchema = z.object({
  bookingId: z.string().uuid(),
  eventTypeId: z.string().uuid(),
  organizerId: z.string().uuid(),
  inviteeEmail: z.string().email(),
  inviteeName: z.string().min(1).max(120),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const webhookEventSchema = z.object({
  id: z.string().uuid(),
  type: webhookEventTypeSchema,
  createdAt: z.string().datetime(),
  payload: webhookEventPayloadSchema,
});

export type HealthCheck = z.infer<typeof healthCheckSchema>;
export type ClerkAuthExchangeRequest = z.infer<typeof clerkAuthExchangeRequestSchema>;
export type BookingActionToken = z.infer<typeof bookingActionTokenSchema>;
export type BookingActionType = z.infer<typeof bookingActionTypeSchema>;
export type EventTypeCreateInput = z.infer<typeof eventTypeCreateSchema>;
export type EventTypeUpdateInput = z.infer<typeof eventTypeUpdateSchema>;
export type EventQuestion = z.infer<typeof eventQuestionSchema>;
export type TeamMemberRole = z.infer<typeof teamMemberRoleSchema>;
export type TeamSchedulingMode = z.infer<typeof teamSchedulingModeSchema>;
export type TeamCreateInput = z.infer<typeof teamCreateSchema>;
export type TeamAddMemberInput = z.infer<typeof teamAddMemberSchema>;
export type TeamEventTypeCreateInput = z.infer<typeof teamEventTypeCreateSchema>;
export type AvailabilityRuleInput = z.infer<typeof availabilityRuleSchema>;
export type AvailabilityOverrideInput = z.infer<typeof availabilityOverrideSchema>;
export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;
export type TimeOffCreateInput = z.infer<typeof timeOffCreateSchema>;
export type TimeOffHolidayImportInput = z.infer<typeof timeOffHolidayImportSchema>;
export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;
export type TeamBookingCreateInput = z.infer<typeof teamBookingCreateSchema>;
export type BookingCancelInput = z.infer<typeof bookingCancelSchema>;
export type BookingRescheduleInput = z.infer<typeof bookingRescheduleSchema>;
export type NotificationRuleType = z.infer<typeof notificationRuleTypeSchema>;
export type NotificationRuleInput = z.infer<typeof notificationRuleSchema>;
export type SetNotificationRulesInput = z.infer<typeof setNotificationRulesSchema>;
export type NotificationsRunInput = z.infer<typeof notificationsRunSchema>;
export type WaitlistJoinInput = z.infer<typeof waitlistJoinSchema>;
export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>;
export type WebhookSubscriptionCreateInput = z.infer<typeof webhookSubscriptionCreateSchema>;
export type WebhookSubscriptionUpdateInput = z.infer<typeof webhookSubscriptionUpdateSchema>;
export type WebhookEventPayload = z.infer<typeof webhookEventPayloadSchema>;
export type WebhookEvent = z.infer<typeof webhookEventSchema>;
export type CalendarProvider = z.infer<typeof calendarProviderSchema>;
export type CalendarConnectStartInput = z.infer<typeof calendarConnectStartSchema>;
export type CalendarConnectCompleteInput = z.infer<typeof calendarConnectCompleteSchema>;
export type CalendarSyncRequestInput = z.infer<typeof calendarSyncRequestSchema>;
export type CalendarWritebackRunInput = z.infer<typeof calendarWritebackRunSchema>;
export type AnalyticsFunnelStage = z.infer<typeof analyticsFunnelStageSchema>;
export type AnalyticsTrackFunnelEventInput = z.infer<typeof analyticsTrackFunnelEventSchema>;
export type AnalyticsRangeQueryInput = z.infer<typeof analyticsRangeQuerySchema>;
