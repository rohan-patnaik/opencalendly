'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

import { PageShell, Toast } from '../../components/ui';
import { CalendarsPanel } from '../../features/organizer/calendars-panel';
import { ProfilePanel } from '../../features/organizer/profile-panel';
import type { OrganizerConsoleUser } from '../../features/organizer/types';
import { useBusyActions } from '../../features/organizer/use-busy-actions';
import { organizerApi, type CalendarConnectionStatus } from '../../lib/organizer-api';
import { revokeApiSession } from '../../lib/api-client';
import { resolvePostAuthRoute } from '../../lib/post-auth-route';
import { useAuthSession } from '../../lib/use-auth-session';
import organizerStyles from '../organizer/page.module.css';

type OnboardingPageClientProps = {
  apiBaseUrl: string;
};

export default function OnboardingPageClient({ apiBaseUrl }: OnboardingPageClientProps) {
  const router = useRouter();
  const { signOut } = useClerk();
  const { isLoaded, isSignedIn } = useAuth();
  const { ready, session, clear, save } = useAuthSession();
  const busy = useBusyActions();
  const [profile, setProfile] = useState<OrganizerConsoleUser | null>(null);
  const [calendarStatuses, setCalendarStatuses] = useState<CalendarConnectionStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelMessage, setPanelMessage] = useState<string | null>(null);
  const [sessionBridgeTimedOut, setSessionBridgeTimedOut] = useState(false);
  const [sessionBridgeRetryKey, setSessionBridgeRetryKey] = useState(0);

  const refreshOnboardingData = useCallback(async () => {
    if (!session) {
      return;
    }

    setLoading(true);
    setGlobalError(null);

    try {
      const [profilePayload, calendarPayload] = await Promise.all([
        organizerApi.getProfile(apiBaseUrl, session),
        organizerApi.getCalendarSyncStatus(apiBaseUrl, session),
      ]);

      if (profilePayload.user.onboardingCompleted) {
        handleProfileUpdated(profilePayload.user);
        router.replace(resolvePostAuthRoute(true));
        return;
      }

      setProfile(profilePayload.user);
      setCalendarStatuses(calendarPayload.connections);
    } catch (caught) {
      setGlobalError(caught instanceof Error ? caught.message : 'Unable to load onboarding.');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, router, save, session]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!session) {
      if (isLoaded && isSignedIn) {
        return;
      }
      router.replace('/auth/sign-in?redirect_url=%2Fonboarding');
      return;
    }

    if (session.user.onboardingCompleted) {
      router.replace(resolvePostAuthRoute(true));
      return;
    }

    void refreshOnboardingData();
  }, [isLoaded, isSignedIn, ready, refreshOnboardingData, router, session]);

  useEffect(() => {
    if (!(isLoaded && isSignedIn && ready && !session)) {
      setSessionBridgeTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      setSessionBridgeTimedOut(true);
    }, 20_000);

    return () => {
      clearTimeout(timer);
    };
  }, [isLoaded, isSignedIn, ready, session, sessionBridgeRetryKey]);

  const handleProfileUpdated = (nextUser: OrganizerConsoleUser) => {
    setProfile(nextUser);
    if (session) {
      save({
        ...session,
        user: {
          ...session.user,
          username: nextUser.username,
          displayName: nextUser.displayName,
          timezone: nextUser.timezone,
          onboardingCompleted: nextUser.onboardingCompleted,
        },
      });
    }
  };

  const handleFinish = async () => {
    if (!session || !profile) {
      return;
    }

    const action = 'completeOnboarding';
    busy.beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      const payload = await organizerApi.completeOnboarding(apiBaseUrl, session);
      handleProfileUpdated(payload.user);
      setPanelMessage('Onboarding complete. Opening your organizer…');
      router.replace('/organizer');
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to complete onboarding.');
    } finally {
      busy.endBusy(action);
    }
  };

  const handleSignOut = async () => {
    await signOut({ redirectUrl: '/auth/sign-in' });
    clear();
    void revokeApiSession(apiBaseUrl).catch((error) => {
      console.error('revokeApiSession failed after Clerk sign-out', {
        apiBaseUrl,
        error,
      });
    });
  };

  if (isLoaded && isSignedIn && ready && !session) {
    return (
      <PageShell
        eyebrow="Onboarding"
        title="Set up your scheduling workspace"
        description="Finalizing your OpenCalendly session…"
      >
        <section className={organizerStyles.card}>
          {sessionBridgeTimedOut ? (
            <Toast variant="error">
              Session setup is taking longer than expected.
              <button
                type="button"
                className={organizerStyles.ghostButton}
                onClick={() => {
                  setSessionBridgeTimedOut(false);
                  setSessionBridgeRetryKey((value) => value + 1);
                  router.refresh();
                }}
              >
                Retry
              </button>{' '}
              <button
                type="button"
                className={organizerStyles.ghostButton}
                onClick={() => {
                  void handleSignOut();
                }}
              >
                Sign out
              </button>
            </Toast>
          ) : (
            <Toast variant="info">Finalizing your OpenCalendly session…</Toast>
          )}
        </section>
      </PageShell>
    );
  }

  if (!ready || loading) {
    return (
      <PageShell
        eyebrow="Onboarding"
        title="Set up your scheduling workspace"
        description="Preparing your OpenCalendly account…"
      >
        <div className={organizerStyles.card}>
          <p>Loading onboarding…</p>
        </div>
      </PageShell>
    );
  }

  if (!session || !profile) {
    return null;
  }

  return (
    <PageShell
      eyebrow="Onboarding"
      title="Set up your scheduling workspace"
      description="Pick your public profile, connect calendars, and choose where bookings should write back."
    >
      <section className={organizerStyles.heroCard}>
        <div className={organizerStyles.metaStrip}>
          <span>
            Signed in as <strong>{profile.email}</strong>
          </span>
          <span>Timezone: {profile.timezone}</span>
          <button
            type="button"
            className={organizerStyles.ghostButton}
            onClick={() => void handleSignOut()}
          >
            Sign out
          </button>
        </div>
        {globalError ? <Toast variant="error">{globalError}</Toast> : null}
        {panelError ? <Toast variant="error">{panelError}</Toast> : null}
        {panelMessage ? <Toast variant="success">{panelMessage}</Toast> : null}
      </section>

      <section className={organizerStyles.card}>
        <div className={organizerStyles.sectionHeader}>
          <h2>1. Profile</h2>
          <p>Choose the name and username people will see on your booking pages.</p>
        </div>
        <ProfilePanel
          apiBaseUrl={apiBaseUrl}
          session={session}
          user={profile}
          onProfileUpdated={handleProfileUpdated}
          isBusy={busy.isBusy}
          beginBusy={busy.beginBusy}
          endBusy={busy.endBusy}
          setPanelError={setPanelError}
          setPanelMessage={setPanelMessage}
          styles={organizerStyles}
        />
      </section>

      <section className={organizerStyles.card}>
        <div className={organizerStyles.sectionHeader}>
          <h2>2. Calendars</h2>
          <p>Connect every calendar that should block availability, then choose one writeback target.</p>
        </div>
        <CalendarsPanel
          apiBaseUrl={apiBaseUrl}
          session={session}
          calendarStatuses={calendarStatuses}
          refreshOrganizerState={refreshOnboardingData}
          isBusy={busy.isBusy}
          beginBusy={busy.beginBusy}
          endBusy={busy.endBusy}
          setPanelError={setPanelError}
          setPanelMessage={setPanelMessage}
          styles={organizerStyles}
        />
      </section>

      <section className={organizerStyles.card}>
        <div className={organizerStyles.sectionHeader}>
          <h2>3. Start</h2>
          <p>You can return to these settings any time from the organizer console.</p>
        </div>
        <div className={organizerStyles.inlineActions}>
          <button
            type="button"
            className={organizerStyles.primaryButton}
            onClick={() => void handleFinish()}
            disabled={busy.isBusy('completeOnboarding')}
          >
            {busy.isBusy('completeOnboarding') ? 'Finishing…' : 'Open organizer'}
          </button>
        </div>
      </section>
    </PageShell>
  );
}
