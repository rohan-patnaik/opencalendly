'use client';

import { type FormEvent, useEffect, useState } from 'react';

import { organizerApi } from '../../lib/organizer-api';
import type { AuthSession } from '../../lib/auth-session';
import type { OrganizerConsoleUser } from './types';

type OrganizerStyles = Record<string, string>;

const fallbackTimezones = ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York'];

const resolveTimezones = (): string[] => {
  if (typeof Intl.supportedValuesOf === 'function') {
    return Intl.supportedValuesOf('timeZone');
  }
  return fallbackTimezones;
};

export const ProfilePanel = ({
  apiBaseUrl,
  session,
  user,
  onProfileUpdated,
  isBusy,
  beginBusy,
  endBusy,
  setPanelError,
  setPanelMessage,
  styles,
}: {
  apiBaseUrl: string;
  session: AuthSession | null;
  user: OrganizerConsoleUser;
  onProfileUpdated: (user: OrganizerConsoleUser) => void;
  isBusy: (action: string) => boolean;
  beginBusy: (action: string) => void;
  endBusy: (action: string) => void;
  setPanelError: (message: string | null) => void;
  setPanelMessage: (message: string | null) => void;
  styles: OrganizerStyles;
}) => {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [username, setUsername] = useState(user.username);
  const [timezone, setTimezone] = useState(user.timezone);
  const [timezones] = useState<string[]>(() => resolveTimezones());

  useEffect(() => {
    setDisplayName(user.displayName);
    setUsername(user.username);
    setTimezone(user.timezone);
  }, [user.displayName, user.timezone, user.username]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) {
      return;
    }

    const action = 'profileUpdate';
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      const payload = await organizerApi.updateProfile(apiBaseUrl, session, {
        displayName: displayName.trim(),
        username: username.trim().toLowerCase(),
        timezone: timezone.trim(),
      });
      onProfileUpdated(payload.user);
      setPanelMessage('Profile updated.');
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to update profile.');
    } finally {
      endBusy(action);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3>Public profile</h3>
      <label className={styles.label}>
        Email
        <input className={styles.input} value={user.email} disabled />
      </label>
      <label className={styles.label}>
        Display name
        <input
          className={styles.input}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
        />
      </label>
      <label className={styles.label}>
        Username
        <input
          className={styles.input}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />
      </label>
      <label className={styles.label}>
        Timezone
        <select
          className={styles.input}
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          required
        >
          {timezones.map((timezoneOption) => (
            <option key={timezoneOption} value={timezoneOption}>
              {timezoneOption}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className={styles.primaryButton} disabled={isBusy('profileUpdate')}>
        {isBusy('profileUpdate') ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  );
};
