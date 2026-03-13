import { authedGetJson, authedPatchJson, authedPostJson } from '../api-client';
import type { AuthSession } from '../auth-session';
import { organizerApiFallback as fallback } from './fallback';
import type { OrganizerWebhook } from './types';

export const organizerWebhooksApi = {
  listWebhooks: async (apiBaseUrl: string, session: AuthSession | null) => {
    return authedGetJson<{ ok: true; webhooks: OrganizerWebhook[] }>({
      url: `${apiBaseUrl}/v0/webhooks`,
      session,
      fallbackError: fallback.webhooksList,
    });
  },

  createWebhook: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    body: {
      url: string;
      events: Array<'booking.created' | 'booking.canceled' | 'booking.rescheduled'>;
      secret: string;
    },
  ) => {
    return authedPostJson<{ ok: true; webhook: OrganizerWebhook }>({
      url: `${apiBaseUrl}/v0/webhooks`,
      session,
      body,
      fallbackError: fallback.webhookCreate,
    });
  },

  updateWebhook: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    webhookId: string,
    body: Partial<{
      url: string;
      events: Array<'booking.created' | 'booking.canceled' | 'booking.rescheduled'>;
      secret: string;
      isActive: boolean;
    }>,
  ) => {
    return authedPatchJson<{ ok: true; webhook: OrganizerWebhook }>({
      url: `${apiBaseUrl}/v0/webhooks/${encodeURIComponent(webhookId)}`,
      session,
      body,
      fallbackError: fallback.webhookPatch,
    });
  },

  runWebhookDeliveries: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    limit?: number,
  ) => {
    return authedPostJson<{
      ok: true;
      processed: number;
      succeeded: number;
      retried: number;
      failed: number;
    }>({
      url: `${apiBaseUrl}/v0/webhooks/deliveries/run${typeof limit === 'number' ? `?limit=${encodeURIComponent(String(limit))}` : ''}`,
      session,
      body: {},
      fallbackError: fallback.webhookRun,
    });
  },
};
