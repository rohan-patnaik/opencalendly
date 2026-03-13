'use client';

import { useEffect, useState } from 'react';

import { organizerApi, type AvailabilityOverride, type AvailabilityRule } from '../../lib/organizer-api';
import type { AuthSession } from '../../lib/auth-session';
import {
  dayLabels,
  formatDateTime,
  isAvailabilityOverrideInput,
  isAvailabilityRuleInput,
  parseJsonArray,
  toClockTime,
  type AvailabilityOverrideInput,
  type AvailabilityRuleInput,
} from './utils';

type OrganizerStyles = Record<string, string>;

export const AvailabilityPanel = ({
  apiBaseUrl,
  session,
  availabilityRules,
  availabilityOverrides,
  isBusy,
  beginBusy,
  endBusy,
  refreshOrganizerState,
  setPanelError,
  setPanelMessage,
  styles,
}: {
  apiBaseUrl: string;
  session: AuthSession | null;
  availabilityRules: AvailabilityRule[];
  availabilityOverrides: AvailabilityOverride[];
  isBusy: (action: string) => boolean;
  beginBusy: (action: string) => void;
  endBusy: (action: string) => void;
  refreshOrganizerState: () => Promise<void>;
  setPanelError: (message: string | null) => void;
  setPanelMessage: (message: string | null) => void;
  styles: OrganizerStyles;
}) => {
  const [rulesDraft, setRulesDraft] = useState('[]');
  const [overridesDraft, setOverridesDraft] = useState('[]');

  useEffect(() => {
    setRulesDraft(
      JSON.stringify(
        availabilityRules.map((rule) => ({
          dayOfWeek: rule.dayOfWeek,
          startMinute: rule.startMinute,
          endMinute: rule.endMinute,
          bufferBeforeMinutes: rule.bufferBeforeMinutes,
          bufferAfterMinutes: rule.bufferAfterMinutes,
        })),
        null,
        2,
      ),
    );
  }, [availabilityRules]);

  useEffect(() => {
    setOverridesDraft(
      JSON.stringify(
        availabilityOverrides.map((override) => ({
          startAt: override.startAt,
          endAt: override.endAt,
          isAvailable: override.isAvailable,
          reason: override.reason,
        })),
        null,
        2,
      ),
    );
  }, [availabilityOverrides]);

  const handleSaveRules = async () => {
    if (!session) {
      return;
    }

    const action = 'rulesSave';
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      const parsedRules = parseJsonArray<AvailabilityRuleInput>(rulesDraft, 'Rules payload', isAvailabilityRuleInput);
      await organizerApi.replaceAvailabilityRules(apiBaseUrl, session, parsedRules);
      setPanelMessage('Availability rules updated.');
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to update availability rules.');
    } finally {
      endBusy(action);
    }
  };

  const handleSaveOverrides = async () => {
    if (!session) {
      return;
    }

    const action = 'overridesSave';
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      const parsedOverrides = parseJsonArray<AvailabilityOverrideInput>(
        overridesDraft,
        'Overrides payload',
        isAvailabilityOverrideInput,
      );
      await organizerApi.replaceAvailabilityOverrides(apiBaseUrl, session, parsedOverrides);
      setPanelMessage('Availability overrides updated.');
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to update availability overrides.');
    } finally {
      endBusy(action);
    }
  };

  return (
    <div className={styles.splitGrid}>
      <div className={styles.form}>
        <h3>Current rules</h3>
        {availabilityRules.length === 0 ? (
          <p className={styles.empty}>No recurring rules configured.</p>
        ) : (
          <ul>
            {availabilityRules.map((rule) => (
              <li key={rule.id}>
                {dayLabels[rule.dayOfWeek] ?? `Day ${rule.dayOfWeek}`}: {toClockTime(rule.startMinute)} -{' '}
                {toClockTime(rule.endMinute)} (buffers: {rule.bufferBeforeMinutes}m / {rule.bufferAfterMinutes}m)
              </li>
            ))}
          </ul>
        )}

        <label className={styles.label}>
          Rules JSON
          <textarea className={styles.textarea} value={rulesDraft} onChange={(event) => setRulesDraft(event.target.value)} spellCheck={false} />
        </label>
        <button type="button" className={styles.primaryButton} onClick={() => void handleSaveRules()} disabled={isBusy('rulesSave')}>
          {isBusy('rulesSave') ? 'Saving…' : 'Save rules'}
        </button>
      </div>

      <div className={styles.form}>
        <h3>Current overrides</h3>
        {availabilityOverrides.length === 0 ? (
          <p className={styles.empty}>No date overrides configured.</p>
        ) : (
          <ul>
            {availabilityOverrides.map((override) => (
              <li key={override.id}>
                {override.isAvailable ? 'Available' : 'Unavailable'}: {formatDateTime(override.startAt)} -{' '}
                {formatDateTime(override.endAt)}
                {override.reason ? ` (${override.reason})` : ''}
              </li>
            ))}
          </ul>
        )}

        <label className={styles.label}>
          Overrides JSON
          <textarea className={styles.textarea} value={overridesDraft} onChange={(event) => setOverridesDraft(event.target.value)} spellCheck={false} />
        </label>
        <button type="button" className={styles.primaryButton} onClick={() => void handleSaveOverrides()} disabled={isBusy('overridesSave')}>
          {isBusy('overridesSave') ? 'Saving…' : 'Save overrides'}
        </button>
      </div>
    </div>
  );
};
