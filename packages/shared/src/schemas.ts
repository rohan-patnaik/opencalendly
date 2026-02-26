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

export const magicLinkRequestSchema = z.object({
  email: emailSchema,
  username: usernameSchema.optional(),
  displayName: z.string().min(1).max(120).optional(),
  timezone: timezoneSchema.optional(),
});

export const verifyMagicLinkRequestSchema = z.object({
  token: z.string().min(32).max(256),
});

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

export const webhookEventSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['booking.created', 'booking.canceled', 'booking.rescheduled']),
  createdAt: z.string().datetime(),
  payload: z.object({
    bookingId: z.string().uuid(),
    eventTypeId: z.string().uuid(),
    organizerId: z.string().uuid(),
    inviteeEmail: z.string().email(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  }),
});

export type HealthCheck = z.infer<typeof healthCheckSchema>;
export type MagicLinkRequest = z.infer<typeof magicLinkRequestSchema>;
export type VerifyMagicLinkRequest = z.infer<typeof verifyMagicLinkRequestSchema>;
export type EventTypeCreateInput = z.infer<typeof eventTypeCreateSchema>;
export type EventTypeUpdateInput = z.infer<typeof eventTypeUpdateSchema>;
export type EventQuestion = z.infer<typeof eventQuestionSchema>;
export type AvailabilityRuleInput = z.infer<typeof availabilityRuleSchema>;
export type AvailabilityOverrideInput = z.infer<typeof availabilityOverrideSchema>;
export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;
export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;
export type WebhookEvent = z.infer<typeof webhookEventSchema>;
