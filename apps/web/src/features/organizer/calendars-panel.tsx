'use client';

import { organizerApi, type CalendarProviderStatus } from '../../lib/organizer-api';
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
  calendarStatuses: CalendarProviderStatus[];
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

  const handleCalendarSync = async (provider: 'google' | 'microsoft') => {
    if (!session) {
      return;
    }

    const action = `calendarSync:${provider}`;
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      const result =
        provider === 'google'
          ? await organizerApi.syncGoogle(apiBaseUrl, session)
          : await organizerApi.syncMicrosoft(apiBaseUrl, session);
      setPanelMessage(
        `${provider === 'google' ? 'Google' : 'Microsoft'} sync complete: ${result.busyWindowCount} busy windows refreshed.`,
      );
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : `Unable to sync ${provider} calendar.`);
    } finally {
      endBusy(action);
    }
  };

  const handleCalendarDisconnect = async (provider: 'google' | 'microsoft') => {
    if (!session) {
      return;
    }

    const action = `calendarDisconnect:${provider}`;
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      if (provider === 'google') {
        await organizerApi.disconnectGoogle(apiBaseUrl, session);
      } else {
        await organizerApi.disconnectMicrosoft(apiBaseUrl, session);
      }
      setPanelMessage(`${provider === 'google' ? 'Google' : 'Microsoft'} calendar disconnected.`);
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : `Unable to disconnect ${provider} calendar.`);
    } finally {
      endBusy(action);
    }
  };

  return calendarStatuses.length === 0 ? (
    <p className={styles.empty}>No provider statuses available.</p>
  ) : (
    <div className={styles.listGrid}>
      {calendarStatuses.map((status) => (
        <article key={status.provider} className={styles.itemCard}>
          <div className={styles.itemHead}>
            <strong>{status.provider === 'google' ? 'Google Calendar' : 'Microsoft Calendar'}</strong>
            <span className={styles.badge}>{status.connected ? 'connected' : 'not connected'}</span>
          </div>
          <p>Email: {status.externalEmail ?? 'n/a'}</p>
          <p>Last sync: {status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : 'never'}</p>
          <p>Next sync: {status.nextSyncAt ? new Date(status.nextSyncAt).toLocaleString() : 'not scheduled'}</p>
          {status.lastError ? <p className={styles.error}>{status.lastError}</p> : null}
          <div className={styles.inlineActions}>
            <button type="button" className={styles.secondaryButton} onClick={() => void handleStartCalendarConnect(status.provider)} disabled={isBusy(`calendarConnect:${status.provider}`)}>
              {isBusy(`calendarConnect:${status.provider}`) ? 'Starting…' : 'Connect'}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={() => void handleCalendarSync(status.provider)} disabled={isBusy(`calendarSync:${status.provider}`)}>
              {isBusy(`calendarSync:${status.provider}`) ? 'Syncing…' : 'Sync now'}
            </button>
            <button type="button" className={styles.ghostButton} onClick={() => void handleCalendarDisconnect(status.provider)} disabled={isBusy(`calendarDisconnect:${status.provider}`)}>
              {isBusy(`calendarDisconnect:${status.provider}`) ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
};
