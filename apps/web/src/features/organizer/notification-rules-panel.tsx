'use client';

import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';

import { organizerApi, type NotificationRule, type OrganizerEventType } from '../../lib/organizer-api';
import type { AuthSession } from '../../lib/auth-session';
import {
  isNotificationRuleInput,
  parseIntegerOrUndefined,
  parseJsonArray,
  type NotificationRuleInput,
} from './utils';

type OrganizerStyles = Record<string, string>;

export const NotificationRulesPanel = ({
  apiBaseUrl,
  session,
  eventTypes,
  notificationRulesEventTypeId,
  setNotificationRulesEventTypeId,
  notificationRules,
  notificationRulesLoading,
  notificationRulesError,
  refreshNotificationRules,
  setNotificationRules,
  isBusy,
  beginBusy,
  endBusy,
  setPanelError,
  setPanelMessage,
  styles,
}: {
  apiBaseUrl: string;
  session: AuthSession | null;
  eventTypes: OrganizerEventType[];
  notificationRulesEventTypeId: string;
  setNotificationRulesEventTypeId: (value: string) => void;
  notificationRules: NotificationRule[];
  notificationRulesLoading: boolean;
  notificationRulesError: string | null;
  refreshNotificationRules: (eventTypeId: string) => Promise<void>;
  setNotificationRules: Dispatch<SetStateAction<NotificationRule[]>>;
  isBusy: (action: string) => boolean;
  beginBusy: (action: string) => void;
  endBusy: (action: string) => void;
  setPanelError: (message: string | null) => void;
  setPanelMessage: (message: string | null) => void;
  styles: OrganizerStyles;
}) => {
  const [notificationRulesDraft, setNotificationRulesDraft] = useState('[]');
  const [notificationRunLimit, setNotificationRunLimit] = useState('20');

  useEffect(() => {
    setNotificationRulesDraft(
      JSON.stringify(
        notificationRules.map((rule) => ({
          notificationType: rule.notificationType,
          offsetMinutes: rule.offsetMinutes,
          isEnabled: rule.isEnabled,
        })),
        null,
        2,
      ),
    );
  }, [notificationRules]);

  const handleSaveNotificationRules = async () => {
    if (!session || !notificationRulesEventTypeId) {
      return;
    }

    const action = 'notificationRulesSave';
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      const parsedRules = parseJsonArray<NotificationRuleInput>(
        notificationRulesDraft,
        'Notification rules payload',
        isNotificationRuleInput,
      );

      const payload = await organizerApi.replaceNotificationRules(
        apiBaseUrl,
        session,
        notificationRulesEventTypeId,
        parsedRules.map((rule) => ({
          notificationType: rule.notificationType,
          offsetMinutes: rule.offsetMinutes,
          isEnabled: rule.isEnabled ?? true,
        })),
      );

      setNotificationRules(payload.rules);
      setPanelMessage('Notification rules updated.');
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to save notification rules.');
    } finally {
      endBusy(action);
    }
  };

  const handleRunNotificationWorkflows = async () => {
    if (!session) {
      return;
    }

    const action = 'notificationRun';
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      const payload = await organizerApi.runNotificationWorkflows(
        apiBaseUrl,
        session,
        parseIntegerOrUndefined(notificationRunLimit),
      );
      setPanelMessage(
        `Notification run complete: processed=${payload.processed}, succeeded=${payload.succeeded}, failed=${payload.failed}, skipped=${payload.skipped}.`,
      );
      await refreshNotificationRules(notificationRulesEventTypeId);
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to run notification workflows.');
    } finally {
      endBusy(action);
    }
  };

  return (
    <div className={styles.form}>
      <h3>Notification rules (reminders + follow-up)</h3>
      <p className={styles.helperText}>
        Configure event-type reminder/follow-up offsets, then run the due workflow batch.
      </p>

      <label className={styles.label}>
        Event type
        <select
          className={styles.select}
          value={notificationRulesEventTypeId}
          onChange={(event) => setNotificationRulesEventTypeId(event.target.value)}
          disabled={eventTypes.length === 0}
        >
          {eventTypes.length === 0 ? (
            <option value="">No event types available</option>
          ) : (
            eventTypes.map((eventType) => (
              <option key={eventType.id} value={eventType.id}>
                {eventType.name} ({eventType.slug})
              </option>
            ))
          )}
        </select>
      </label>

      {notificationRulesError ? <p className={styles.error}>{notificationRulesError}</p> : null}
      {notificationRulesLoading ? (
        <p>Loading notification rules…</p>
      ) : notificationRules.length === 0 ? (
        <p className={styles.empty}>No notification rules configured for this event type.</p>
      ) : (
        <ul>
          {notificationRules.map((rule) => (
            <li key={rule.id}>
              {rule.notificationType} · {rule.offsetMinutes} minute(s) ·{' '}
              {rule.isEnabled ? 'enabled' : 'disabled'}
            </li>
          ))}
        </ul>
      )}

      <label className={styles.label}>
        Notification rules JSON
        <textarea className={styles.textarea} value={notificationRulesDraft} onChange={(event) => setNotificationRulesDraft(event.target.value)} spellCheck={false} />
      </label>

      <div className={styles.rowActions}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => void handleSaveNotificationRules()}
          disabled={isBusy('notificationRulesSave') || !notificationRulesEventTypeId}
        >
          {isBusy('notificationRulesSave') ? 'Saving…' : 'Save notification rules'}
        </button>
        <label className={styles.label}>
          Runner limit
          <input className={styles.input} type="number" min={1} max={100} value={notificationRunLimit} onChange={(event) => setNotificationRunLimit(event.target.value)} />
        </label>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => void handleRunNotificationWorkflows()}
          disabled={isBusy('notificationRun')}
        >
          {isBusy('notificationRun') ? 'Running…' : 'Run due notifications'}
        </button>
      </div>
    </div>
  );
};
