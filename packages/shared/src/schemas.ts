import { z } from 'zod';

export const healthCheckSchema = z.object({
  status: z.literal('ok'),
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
export type WebhookEvent = z.infer<typeof webhookEventSchema>;
