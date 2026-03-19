'use client';

import { LinkButton } from '../../components/ui';
import { organizerApi } from '../../lib/organizer-api';
import type { AuthSession } from '../../lib/auth-session';

type OrganizerStyles = Record<string, string>;

export const CalendarConnectActions = ({
  apiBaseUrl,
  session,
  isBusy,
  beginBusy,
  endBusy,
  setPanelError,
  styles,
  includeManageLink = false,
}: {
  apiBaseUrl: string;
  session: AuthSession | null;
  isBusy: (action: string) => boolean;
  beginBusy: (action: string) => void;
  endBusy: (action: string) => void;
  setPanelError: (message: string | null) => void;
  styles: OrganizerStyles;
  includeManageLink?: boolean;
}) => {
  const handleStartCalendarConnect = async (provider: 'google' | 'microsoft') => {
    if (!session) {
      return;
    }

    const action = `calendarConnect:${provider}`;
    beginBusy(action);
    setPanelError(null);

    try {
      const redirectUri = `${window.location.origin}/settings/calendar/${provider}/callback`;
      const payload =
        provider === 'google'
          ? await organizerApi.startGoogleConnect(apiBaseUrl, session, { redirectUri })
          : await organizerApi.startMicrosoftConnect(apiBaseUrl, session, { redirectUri });
      window.location.assign(payload.authUrl);
    } catch (caught) {
      setPanelError(
        caught instanceof Error ? caught.message : `Unable to start ${provider} connect flow.`,
      );
      endBusy(action);
    }
  };

  return (
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
      {includeManageLink ? (
        <LinkButton href="/organizer/calendars" variant="ghost">
          Open calendar integrations
        </LinkButton>
      ) : null}
    </div>
  );
};
