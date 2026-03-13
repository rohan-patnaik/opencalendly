import { describe, expect, it, vi } from 'vitest';

import { executeWebhookDelivery } from './webhook-deliveries';
import type { Database, PendingWebhookDelivery } from './types';

const buildDelivery = (url: string): PendingWebhookDelivery => ({
  id: '9f0a82c5-9334-46fb-a391-1f83ceb2ef06',
  subscriptionId: 'b4799557-a220-4eff-bde5-75ff4db4378d',
  url,
  secret: 'whsec_super_secret',
  eventId: 'c716ac14-0d39-4efe-b0ee-8eb9c14d2b33',
  eventType: 'booking.created',
  payload: {
    id: 'c716ac14-0d39-4efe-b0ee-8eb9c14d2b33',
    type: 'booking.created',
    createdAt: '2026-03-14T00:00:00.000Z',
    payload: {
      bookingId: '82dab546-5137-45d7-99d1-7cf52866e4e9',
      eventTypeId: '8ef448f1-7f27-430c-8f0f-9fc2c3b52370',
      organizerId: '735d1a63-99a8-48a0-8d4b-cf344a7bbba8',
      inviteeEmail: 'invitee@example.com',
      inviteeName: 'Invitee',
      startsAt: '2026-03-14T10:00:00.000Z',
      endsAt: '2026-03-14T10:30:00.000Z',
    },
  },
  attemptCount: 0,
  maxAttempts: 6,
});

describe('executeWebhookDelivery', () => {
  it('fails invalid webhook targets without calling fetch', async () => {
    const where = vi.fn(async () => undefined);
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeWebhookDelivery(
      { update } as unknown as Database,
      buildDelivery('https://127.0.0.1/webhooks/opencalendly'),
    );

    expect(result).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        attemptCount: 6,
        lastError: 'Webhook target URL is not allowed. Use an HTTPS URL with a public hostname.',
      }),
    );
  });
});
