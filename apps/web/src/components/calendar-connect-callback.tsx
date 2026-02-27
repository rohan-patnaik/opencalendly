'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { organizerApi } from '../lib/organizer-api';
import { useAuthSession } from '../lib/use-auth-session';
import styles from './calendar-connect-callback.module.css';

type CalendarConnectCallbackProps = {
  apiBaseUrl: string;
  provider: 'google' | 'microsoft';
};

export default function CalendarConnectCallback({
  apiBaseUrl,
  provider,
}: CalendarConnectCallbackProps) {
  const searchParams = useSearchParams();
  const { ready, session } = useAuthSession();

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);

  const providerLabel = provider === 'google' ? 'Google Calendar' : 'Microsoft Calendar';
  const callbackPath = provider === 'google' ? '/settings/calendar/google/callback' : '/settings/calendar/microsoft/callback';

  const search = useMemo(
    () => ({
      code: searchParams.get('code') ?? '',
      state: searchParams.get('state') ?? '',
      error: searchParams.get('error') ?? '',
      errorDescription: searchParams.get('error_description') ?? '',
    }),
    [searchParams],
  );

  useEffect(() => {
    if (!ready || !session) {
      return;
    }

    if (search.error) {
      const description = search.errorDescription ? ` (${search.errorDescription})` : '';
      setStatus('error');
      setMessage(`Provider returned an OAuth error: ${search.error}${description}`);
      return;
    }

    if (!search.code || !search.state) {
      setStatus('error');
      setMessage('Missing OAuth callback code/state. Restart connection from Organizer Console.');
      return;
    }

    const run = async () => {
      setStatus('loading');
      setMessage(`Completing ${providerLabel} connection…`);

      try {
        const redirectUri = `${window.location.origin}${callbackPath}`;
        const payload =
          provider === 'google'
            ? await organizerApi.completeGoogleConnect(apiBaseUrl, session, {
                code: search.code,
                state: search.state,
                redirectUri,
              })
            : await organizerApi.completeMicrosoftConnect(apiBaseUrl, session, {
                code: search.code,
                state: search.state,
                redirectUri,
              });

        setConnectedEmail(payload.connection.externalEmail ?? null);
        setStatus('success');
        setMessage(`${providerLabel} connection completed successfully.`);
      } catch (caught) {
        setStatus('error');
        setMessage(
          caught instanceof Error
            ? caught.message
            : `Unable to complete ${providerLabel} connection.`,
        );
      }
    };

    void run();
  }, [apiBaseUrl, callbackPath, provider, providerLabel, ready, search, session]);

  if (!ready) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <p className={styles.kicker}>Calendar OAuth</p>
          <h1>{providerLabel} callback</h1>
          <p>Preparing callback state…</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <p className={styles.kicker}>Authentication required</p>
          <h1>{providerLabel} callback</h1>
          <p>Sign in first, then restart the calendar connect flow.</p>
          <div className={styles.actions}>
            <Link className={styles.primaryButton} href="/auth/sign-in">
              Sign in
            </Link>
            <Link className={styles.secondaryButton} href="/organizer">
              Back to organizer console
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.kicker}>Calendar OAuth</p>
        <h1>{providerLabel} callback</h1>
        {status === 'success' ? (
          <p className={styles.success}>{message}</p>
        ) : status === 'error' ? (
          <p className={styles.error}>{message}</p>
        ) : (
          <p>{message ?? 'Processing callback…'}</p>
        )}

        {connectedEmail ? (
          <div className={styles.info}>
            <strong>Connected account</strong>
            <span>{connectedEmail}</span>
          </div>
        ) : null}

        <div className={styles.actions}>
          <Link className={styles.primaryButton} href="/organizer">
            Back to organizer console
          </Link>
          <Link className={styles.secondaryButton} href="/dashboard">
            Open analytics dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
