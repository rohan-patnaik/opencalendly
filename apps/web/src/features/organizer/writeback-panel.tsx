'use client';

import { useState } from 'react';

import { organizerApi, type WritebackStatus } from '../../lib/organizer-api';
import type { AuthSession } from '../../lib/auth-session';
import { parseIntegerOrUndefined } from './utils';

type OrganizerStyles = Record<string, string>;

export const WritebackPanel = ({
  apiBaseUrl,
  session,
  writebackStatus,
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
  writebackStatus: WritebackStatus | null;
  refreshOrganizerState: () => Promise<void>;
  isBusy: (action: string) => boolean;
  beginBusy: (action: string) => void;
  endBusy: (action: string) => void;
  setPanelError: (message: string | null) => void;
  setPanelMessage: (message: string | null) => void;
  styles: OrganizerStyles;
}) => {
  const [writebackRunLimit, setWritebackRunLimit] = useState('20');

  const handleRunWritebackQueue = async () => {
    if (!session) {
      return;
    }

    const action = 'writebackRun';
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      const payload = await organizerApi.runWritebackQueue(
        apiBaseUrl,
        session,
        parseIntegerOrUndefined(writebackRunLimit),
      );
      setPanelMessage(
        `Writeback run complete: processed=${payload.processed}, succeeded=${payload.succeeded}, retried=${payload.retried}, failed=${payload.failed}.`,
      );
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to run writeback queue.');
    } finally {
      endBusy(action);
    }
  };

  return (
    <>
      {writebackStatus ? (
        <div className={styles.statGrid}>
          <div>
            <strong>{writebackStatus.summary.pending}</strong>
            <span>Pending</span>
          </div>
          <div>
            <strong>{writebackStatus.summary.succeeded}</strong>
            <span>Succeeded</span>
          </div>
          <div>
            <strong>{writebackStatus.summary.failed}</strong>
            <span>Failed</span>
          </div>
        </div>
      ) : (
        <p className={styles.empty}>Writeback status not loaded yet.</p>
      )}

      <div className={styles.inlineActions}>
        <label className={styles.labelCompact}>
          Run limit
          <input className={styles.input} value={writebackRunLimit} onChange={(event) => setWritebackRunLimit(event.target.value)} inputMode="numeric" />
        </label>
        <button type="button" className={styles.secondaryButton} onClick={() => void handleRunWritebackQueue()} disabled={isBusy('writebackRun')}>
          {isBusy('writebackRun') ? 'Running…' : 'Run writeback queue'}
        </button>
      </div>

      {writebackStatus && writebackStatus.failures.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Operation</th>
                <th>Attempt</th>
                <th>Next attempt</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {writebackStatus.failures.map((failure) => (
                <tr key={failure.id}>
                  <td>{failure.provider}</td>
                  <td>{failure.operation}</td>
                  <td>
                    {failure.attemptCount}/{failure.maxAttempts}
                  </td>
                  <td>{new Date(failure.nextAttemptAt).toLocaleString()}</td>
                  <td>{failure.lastError ?? 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.empty}>No failed writeback rows.</p>
      )}
    </>
  );
};
