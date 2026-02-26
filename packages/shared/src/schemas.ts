import { z } from 'zod';

export const healthCheckSchema = z.object({
  status: z.literal('ok'),
});

const usernamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const questionIdPattern = /^[a-zA-Z0-9_-]+$/;

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

export const magicLinkRequestSchema = z.object({
  email: emailSchema,
  username: usernameSchema.optional(),
  displayName: z.string().min(1).max(120).optional(),
  timezone: timezoneSchema.optional(),
});

export const verifyMagicLinkRequestSchema = z.object({
  token: z.string().min(32).max(256),
});

export const bookingActionTokenSchema = z.string().min(32).max(256);
export const bookingActionTypeSchema = z.enum(['cancel', 'reschedule']);

export const eventTypeCreateSchema = z.object({
  name: z.string().min(1).max(120),
  slug: eventSlugSchema,
  durationMinutes: z.number().int().min(5).max(240),
  locationType: locationTypeSchema,
  locationValue: z.string().max(500).nullish(),
  questions: eventQuestionsSchema.default([]),
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

export const demoCreditsConsumeSchema = z.object({
  email: emailSchema,
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

export const webhookSubscriptionCreateSchema = z.object({
  url: z.string().url().max(2000),
  events: z.array(webhookEventTypeSchema).min(1).max(3),
  secret: z.string().min(8).max(200),
});

export const webhookSubscriptionUpdateSchema = z
  .object({
    url: z.string().url().max(2000).optional(),
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
export type MagicLinkRequest = z.infer<typeof magicLinkRequestSchema>;
export type VerifyMagicLinkRequest = z.infer<typeof verifyMagicLinkRequestSchema>;
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
export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;
export type TeamBookingCreateInput = z.infer<typeof teamBookingCreateSchema>;
export type BookingCancelInput = z.infer<typeof bookingCancelSchema>;
export type BookingRescheduleInput = z.infer<typeof bookingRescheduleSchema>;
export type DemoCreditsConsumeInput = z.infer<typeof demoCreditsConsumeSchema>;
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
