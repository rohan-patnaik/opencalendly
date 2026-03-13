'use client';

import { type FormEvent, useState } from 'react';

import { organizerApi, type TimeOffBlock } from '../../lib/organizer-api';
import type { AuthSession } from '../../lib/auth-session';
import { formatDateTime, toNullableString } from './utils';

type OrganizerStyles = Record<string, string>;

export const TimeOffPanel = ({
  apiBaseUrl,
  session,
  timeOffBlocks,
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
  timeOffBlocks: TimeOffBlock[];
  isBusy: (action: string) => boolean;
  beginBusy: (action: string) => void;
  endBusy: (action: string) => void;
  refreshOrganizerState: () => Promise<void>;
  setPanelError: (message: string | null) => void;
  setPanelMessage: (message: string | null) => void;
  styles: OrganizerStyles;
}) => {
  const [timeOffCreateForm, setTimeOffCreateForm] = useState({
    startAt: '',
    endAt: '',
    reason: '',
  });
  const [holidayImportForm, setHolidayImportForm] = useState({
    locale: 'IN' as 'IN' | 'US',
    year: String(new Date().getFullYear()),
  });

  const handleCreateTimeOffBlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) {
      return;
    }

    setPanelError(null);
    setPanelMessage(null);

    const startAtMs = Date.parse(timeOffCreateForm.startAt);
    const endAtMs = Date.parse(timeOffCreateForm.endAt);
    if (!Number.isFinite(startAtMs) || !Number.isFinite(endAtMs)) {
      setPanelError('Time-off start and end are required.');
      return;
    }
    if (endAtMs <= startAtMs) {
      setPanelError('Time-off end must be after start.');
      return;
    }

    const action = 'timeOffCreate';
    beginBusy(action);

    try {
      await organizerApi.createTimeOffBlock(apiBaseUrl, session, {
        startAt: new Date(startAtMs).toISOString(),
        endAt: new Date(endAtMs).toISOString(),
        reason: toNullableString(timeOffCreateForm.reason),
      });
      setTimeOffCreateForm({ startAt: '', endAt: '', reason: '' });
      setPanelMessage('Time-off block created.');
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to create time-off block.');
    } finally {
      endBusy(action);
    }
  };

  const handleDeleteTimeOffBlock = async (timeOffId: string) => {
    if (!session) {
      return;
    }

    const action = `timeOffDelete:${timeOffId}`;
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      await organizerApi.deleteTimeOffBlock(apiBaseUrl, session, timeOffId);
      setPanelMessage('Time-off block deleted.');
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to delete time-off block.');
    } finally {
      endBusy(action);
    }
  };

  const handleImportHolidayTimeOffBlocks = async () => {
    if (!session) {
      return;
    }

    setPanelError(null);
    setPanelMessage(null);
    const year = Number(holidayImportForm.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setPanelError('Holiday year must be between 2000 and 2100.');
      return;
    }

    const action = 'timeOffImportHolidays';
    beginBusy(action);

    try {
      const result = await organizerApi.importHolidayTimeOffBlocks(apiBaseUrl, session, {
        locale: holidayImportForm.locale,
        year,
      });
      setPanelMessage(`Holiday import complete: imported=${result.imported}, skipped=${result.skipped}.`);
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to import holiday time-off blocks.');
    } finally {
      endBusy(action);
    }
  };

  return (
    <>
      <div className={styles.splitGrid}>
        <form className={styles.form} onSubmit={handleCreateTimeOffBlock}>
          <h3>Create time-off block</h3>
          <label className={styles.label}>
            Start
            <input className={styles.input} type="datetime-local" value={timeOffCreateForm.startAt} onChange={(event) => setTimeOffCreateForm((prev) => ({ ...prev, startAt: event.target.value }))} required />
          </label>
          <label className={styles.label}>
            End
            <input className={styles.input} type="datetime-local" value={timeOffCreateForm.endAt} onChange={(event) => setTimeOffCreateForm((prev) => ({ ...prev, endAt: event.target.value }))} required />
          </label>
          <label className={styles.label}>
            Reason
            <input className={styles.input} value={timeOffCreateForm.reason} onChange={(event) => setTimeOffCreateForm((prev) => ({ ...prev, reason: event.target.value }))} />
          </label>
          <button type="submit" className={styles.primaryButton} disabled={isBusy('timeOffCreate')}>
            {isBusy('timeOffCreate') ? 'Creating…' : 'Add time-off block'}
          </button>
        </form>

        <div className={styles.form}>
          <h3>Import holidays</h3>
          <label className={styles.label}>
            Locale
            <select className={styles.select} value={holidayImportForm.locale} onChange={(event) => setHolidayImportForm((prev) => ({ ...prev, locale: event.target.value as 'IN' | 'US' }))}>
              <option value="IN">India (IN)</option>
              <option value="US">United States (US)</option>
            </select>
          </label>
          <label className={styles.label}>
            Year
            <input className={styles.input} type="number" min={2000} max={2100} value={holidayImportForm.year} onChange={(event) => setHolidayImportForm((prev) => ({ ...prev, year: event.target.value }))} required />
          </label>
          <button type="button" className={styles.secondaryButton} onClick={() => void handleImportHolidayTimeOffBlocks()} disabled={isBusy('timeOffImportHolidays')}>
            {isBusy('timeOffImportHolidays') ? 'Importing…' : 'Import holiday blocks'}
          </button>
          <p className={styles.helperText}>Imports are idempotent by locale/date and will skip already imported holiday rows.</p>
        </div>
      </div>

      <div className={styles.form}>
        <h3>Current time-off blocks</h3>
        {timeOffBlocks.length === 0 ? (
          <p className={styles.empty}>No time-off blocks configured.</p>
        ) : (
          <div className={styles.listGrid}>
            {timeOffBlocks.map((block) => (
              <article key={block.id} className={styles.itemCard}>
                <div className={styles.itemHead}>
                  <strong>{block.reason ?? 'Unavailable'}</strong>
                  <span className={styles.badge}>{block.source}</span>
                </div>
                <p>
                  {formatDateTime(block.startAt)} - {formatDateTime(block.endAt)}
                </p>
                {block.sourceKey ? <p className={styles.helperText}>sourceKey: {block.sourceKey}</p> : null}
                <button type="button" className={styles.ghostButton} onClick={() => void handleDeleteTimeOffBlock(block.id)} disabled={isBusy(`timeOffDelete:${block.id}`)}>
                  {isBusy(`timeOffDelete:${block.id}`) ? 'Deleting…' : 'Delete'}
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
};
