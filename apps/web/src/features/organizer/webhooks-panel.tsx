'use client';

import { type FormEvent, useMemo, useState } from 'react';

import { organizerApi, type OrganizerWebhook } from '../../lib/organizer-api';
import type { AuthSession } from '../../lib/auth-session';
import { parseIntegerOrUndefined } from './utils';

type OrganizerStyles = Record<string, string>;

export const WebhooksPanel = ({
  apiBaseUrl,
  session,
  webhooks,
  refreshOrganizerState,
  isBusy,
  beginBusy,
  endBusy,
  setPanelError,
  setPanelMessage,
  styles,
}: {
  apiBaseUrl: string;
  session: AuthSession | null;
  webhooks: OrganizerWebhook[];
  refreshOrganizerState: () => Promise<void>;
  isBusy: (action: string) => boolean;
  beginBusy: (action: string) => void;
  endBusy: (action: string) => void;
  setPanelError: (message: string | null) => void;
  setPanelMessage: (message: string | null) => void;
  styles: OrganizerStyles;
}) => {
  const [webhookForm, setWebhookForm] = useState({
    url: '',
    secret: '',
    bookingCreated: true,
    bookingCanceled: false,
    bookingRescheduled: false,
  });
  const [webhookRunLimit, setWebhookRunLimit] = useState('20');

  const selectedWebhookEvents = useMemo(() => {
    const events: Array<'booking.created' | 'booking.canceled' | 'booking.rescheduled'> = [];
    if (webhookForm.bookingCreated) {
      events.push('booking.created');
    }
    if (webhookForm.bookingCanceled) {
      events.push('booking.canceled');
    }
    if (webhookForm.bookingRescheduled) {
      events.push('booking.rescheduled');
    }
    return events;
  }, [webhookForm.bookingCanceled, webhookForm.bookingCreated, webhookForm.bookingRescheduled]);

  const handleCreateWebhook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) {
      return;
    }

    const action = 'webhookCreate';
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      if (selectedWebhookEvents.length === 0) {
        setPanelError('Select at least one webhook event.');
        return;
      }

      await organizerApi.createWebhook(apiBaseUrl, session, {
        url: webhookForm.url.trim(),
        secret: webhookForm.secret,
        events: selectedWebhookEvents,
      });
      setWebhookForm({
        url: '',
        secret: '',
        bookingCreated: true,
        bookingCanceled: false,
        bookingRescheduled: false,
      });
      setPanelMessage('Webhook created.');
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to create webhook.');
    } finally {
      endBusy(action);
    }
  };

  const handleToggleWebhookActive = async (webhookId: string, isActive: boolean) => {
    if (!session) {
      return;
    }

    const action = `webhookToggle:${webhookId}`;
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      await organizerApi.updateWebhook(apiBaseUrl, session, webhookId, { isActive: !isActive });
      setPanelMessage('Webhook status updated.');
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to update webhook status.');
    } finally {
      endBusy(action);
    }
  };

  const handleRunWebhookDeliveries = async () => {
    if (!session) {
      return;
    }

    const action = 'webhookRun';
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      const payload = await organizerApi.runWebhookDeliveries(
        apiBaseUrl,
        session,
        parseIntegerOrUndefined(webhookRunLimit),
      );
      setPanelMessage(
        `Webhook run complete: processed=${payload.processed}, succeeded=${payload.succeeded}, retried=${payload.retried}, failed=${payload.failed}.`,
      );
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to run webhook deliveries.');
    } finally {
      endBusy(action);
    }
  };

  return (
    <div className={styles.splitGrid}>
      <form className={styles.form} onSubmit={handleCreateWebhook}>
        <h3>Create webhook</h3>
        <label className={styles.label}>
          URL
          <input className={styles.input} type="url" value={webhookForm.url} onChange={(event) => setWebhookForm((prev) => ({ ...prev, url: event.target.value }))} placeholder="https://example.com/webhooks/opencalendly" required />
        </label>
        <label className={styles.label}>
          Secret
          <input className={styles.input} type="password" autoComplete="new-password" value={webhookForm.secret} onChange={(event) => setWebhookForm((prev) => ({ ...prev, secret: event.target.value }))} minLength={8} required />
        </label>
        <fieldset className={styles.checkboxGroup}>
          <legend>Events</legend>
          <label className={styles.checkbox}>
            <input type="checkbox" checked={webhookForm.bookingCreated} onChange={(event) => setWebhookForm((prev) => ({ ...prev, bookingCreated: event.target.checked }))} />
            booking.created
          </label>
          <label className={styles.checkbox}>
            <input type="checkbox" checked={webhookForm.bookingCanceled} onChange={(event) => setWebhookForm((prev) => ({ ...prev, bookingCanceled: event.target.checked }))} />
            booking.canceled
          </label>
          <label className={styles.checkbox}>
            <input type="checkbox" checked={webhookForm.bookingRescheduled} onChange={(event) => setWebhookForm((prev) => ({ ...prev, bookingRescheduled: event.target.checked }))} />
            booking.rescheduled
          </label>
        </fieldset>
        <button type="submit" className={styles.primaryButton} disabled={isBusy('webhookCreate')}>
          {isBusy('webhookCreate') ? 'Creating…' : 'Create webhook'}
        </button>
        <div className={styles.inlineActions}>
          <label className={styles.labelCompact}>
            Run limit
            <input className={styles.input} value={webhookRunLimit} onChange={(event) => setWebhookRunLimit(event.target.value)} inputMode="numeric" />
          </label>
          <button type="button" className={styles.secondaryButton} onClick={() => void handleRunWebhookDeliveries()} disabled={isBusy('webhookRun')}>
            {isBusy('webhookRun') ? 'Running…' : 'Run delivery worker'}
          </button>
        </div>
      </form>

      <div className={styles.form}>
        <h3>Webhook subscriptions</h3>
        {webhooks.length === 0 ? (
          <p className={styles.empty}>No webhook subscriptions configured.</p>
        ) : (
          <div className={styles.listGrid}>
            {webhooks.map((webhook) => (
              <article key={webhook.id} className={styles.itemCard}>
                <div className={styles.itemHead}>
                  <strong>{webhook.url}</strong>
                  <span className={styles.badge}>{webhook.isActive ? 'active' : 'inactive'}</span>
                </div>
                <p>Events: {webhook.events.join(', ')}</p>
                <button type="button" className={styles.ghostButton} onClick={() => void handleToggleWebhookActive(webhook.id, webhook.isActive)} disabled={isBusy(`webhookToggle:${webhook.id}`)}>
                  {isBusy(`webhookToggle:${webhook.id}`) ? 'Saving…' : webhook.isActive ? 'Disable' : 'Enable'}
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
