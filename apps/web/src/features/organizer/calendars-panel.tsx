'use client';

import { organizerApi, type CalendarConnectionStatus } from '../../lib/organizer-api';
import type { AuthSession } from '../../lib/auth-session';

type OrganizerStyles = Record<string, string>;

export const CalendarsPanel = ({
  apiBaseUrl,
  session,
  calendarStatuses,
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
  calendarStatuses: CalendarConnectionStatus[];
  refreshOrganizerState: () => Promise<void>;
  isBusy: (action: string) => boolean;
  beginBusy: (action: string) => void;
  endBusy: (action: string) => void;
  setPanelError: (message: string | null) => void;
  setPanelMessage: (message: string | null) => void;
  styles: OrganizerStyles;
}) => {
  const handleStartCalendarConnect = async (provider: 'google' | 'microsoft') => {
    if (!session) {
      return;
    }

    const action = `calendarConnect:${provider}`;
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      const redirectUri = `${window.location.origin}/settings/calendar/${provider}/callback`;
      const payload =
        provider === 'google'
          ? await organizerApi.startGoogleConnect(apiBaseUrl, session, { redirectUri })
          : await organizerApi.startMicrosoftConnect(apiBaseUrl, session, { redirectUri });
      window.location.assign(payload.authUrl);
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : `Unable to start ${provider} connect flow.`);
      endBusy(action);
    }
  };

  const handleCalendarSync = async (connection: CalendarConnectionStatus) => {
    if (!session) {
      return;
    }

    const action = `calendarSync:${connection.id}`;
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      const result = await organizerApi.syncConnection(apiBaseUrl, session, connection.id);
      setPanelMessage(
        `${connection.provider === 'google' ? 'Google' : 'Microsoft'} sync complete: ${result.busyWindowCount} busy windows refreshed.`,
      );
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(
        caught instanceof Error
          ? caught.message
          : `Unable to sync ${connection.provider} calendar.`,
      );
    } finally {
      endBusy(action);
    }
  };

  const handleCalendarDisconnect = async (connection: CalendarConnectionStatus) => {
    if (!session) {
      return;
    }

    const action = `calendarDisconnect:${connection.id}`;
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      await organizerApi.disconnectConnection(apiBaseUrl, session, connection.id);
      setPanelMessage(
        `${connection.provider === 'google' ? 'Google' : 'Microsoft'} calendar disconnected.`,
      );
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(
        caught instanceof Error
          ? caught.message
          : `Unable to disconnect ${connection.provider} calendar.`,
      );
    } finally {
      endBusy(action);
    }
  };

  const handlePreferenceChange = async (
    connection: CalendarConnectionStatus,
    body: { useForConflictChecks?: boolean; useForWriteback?: boolean },
  ) => {
    if (!session) {
      return;
    }

    const action = `calendarPreferences:${connection.id}`;
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      await organizerApi.updateCalendarConnectionPreferences(apiBaseUrl, session, connection.id, body);
      setPanelMessage('Calendar preferences saved.');
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(
        caught instanceof Error ? caught.message : 'Unable to update calendar preferences.',
      );
    } finally {
      endBusy(action);
    }
  };

  return (
    <div className={styles.splitGrid}>
      <div className={styles.form}>
        <h3>Add calendars</h3>
        <p className={styles.helperText}>
          Connect as many Google and Microsoft calendars as you need.
        </p>
        <div className={styles.inlineActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void handleStartCalendarConnect('google')}
            disabled={isBusy('calendarConnect:google')}
          >
            {isBusy('calendarConnect:google') ? 'Starting…' : 'Add Google calendar'}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void handleStartCalendarConnect('microsoft')}
            disabled={isBusy('calendarConnect:microsoft')}
          >
            {isBusy('calendarConnect:microsoft') ? 'Starting…' : 'Add Microsoft calendar'}
          </button>
        </div>
      </div>

      <div className={styles.form}>
        <h3>Connected calendars</h3>
        {calendarStatuses.length === 0 ? (
          <p className={styles.empty}>No calendars connected yet.</p>
        ) : (
          <div className={styles.listGrid}>
            {calendarStatuses.map((status) => (
              <article key={status.id} className={styles.itemCard}>
                <div className={styles.itemHead}>
                  <strong>
                    {status.provider === 'google' ? 'Google Calendar' : 'Microsoft Calendar'}
                  </strong>
                  <span className={styles.badge}>connected</span>
                </div>
                <p>Email: {status.externalEmail ?? 'n/a'}</p>
                <p>
                  Last sync:{' '}
                  {status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : 'never'}
                </p>
                <p>
                  Next sync:{' '}
                  {status.nextSyncAt ? new Date(status.nextSyncAt).toLocaleString() : 'not scheduled'}
                </p>
                {status.lastError ? <p className={styles.error}>{status.lastError}</p> : null}
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={status.useForConflictChecks}
                    onChange={() =>
                      void handlePreferenceChange(status, {
                        useForConflictChecks: !status.useForConflictChecks,
                      })
                    }
                    disabled={isBusy(`calendarPreferences:${status.id}`)}
                  />
                  Use for conflict checks
                </label>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={status.useForWriteback}
                    onChange={() =>
                      void handlePreferenceChange(status, { useForWriteback: !status.useForWriteback })
                    }
                    disabled={isBusy(`calendarPreferences:${status.id}`)}
                  />
                  Default writeback calendar
                </label>
                <div className={styles.inlineActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void handleCalendarSync(status)}
                    disabled={isBusy(`calendarSync:${status.id}`)}
                  >
                    {isBusy(`calendarSync:${status.id}`) ? 'Syncing…' : 'Sync now'}
                  </button>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => void handleCalendarDisconnect(status)}
                    disabled={isBusy(`calendarDisconnect:${status.id}`)}
                  >
                    {isBusy(`calendarDisconnect:${status.id}`) ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
