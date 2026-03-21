'use client';

import { LinkButton } from '../../components/ui';
import type { CalendarProvider } from '../../lib/organizer-api';
import { organizerApi } from '../../lib/organizer-api';
import type { AuthSession } from '../../lib/auth-session';
import {
  buildCalendarConnectAvailabilityMessage,
  toCalendarProviderLabel,
} from './calendar-connect';

type OrganizerStyles = Record<string, string>;

export const CalendarConnectActions = ({
  apiBaseUrl,
  session,
  isBusy,
  beginBusy,
  endBusy,
  setPanelError,
  styles,
  availableProviders,
  includeManageLink = false,
}: {
  apiBaseUrl: string;
  session: AuthSession | null;
  isBusy: (action: string) => boolean;
  beginBusy: (action: string) => void;
  endBusy: (action: string) => void;
  setPanelError: (message: string | null) => void;
  styles: OrganizerStyles;
  availableProviders: CalendarProvider[];
  includeManageLink?: boolean;
}) => {
  const availabilityMessage = buildCalendarConnectAvailabilityMessage(availableProviders);

  const handleStartCalendarConnect = async (provider: 'google' | 'microsoft') => {
    if (!session) {
      return;
    }
    if (!availableProviders.includes(provider)) {
      setPanelError(`${toCalendarProviderLabel(provider)} is not available in this environment.`);
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
    <>
      <div className={styles.inlineActions}>
        {availableProviders.includes('google') ? (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void handleStartCalendarConnect('google')}
            disabled={isBusy('calendarConnect:google')}
          >
            {isBusy('calendarConnect:google') ? 'Starting…' : 'Add Google calendar'}
          </button>
        ) : null}
        {availableProviders.includes('microsoft') ? (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void handleStartCalendarConnect('microsoft')}
            disabled={isBusy('calendarConnect:microsoft')}
          >
            {isBusy('calendarConnect:microsoft') ? 'Starting…' : 'Add Microsoft calendar'}
          </button>
        ) : null}
        {includeManageLink ? (
          <LinkButton href="/organizer/calendars" variant="ghost">
            Open calendar integrations
          </LinkButton>
        ) : null}
      </div>
      {availabilityMessage ? <p className={styles.helperText}>{availabilityMessage}</p> : null}
    </>
  );
};
