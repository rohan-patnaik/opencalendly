'use client';

import { useEffect, useState } from 'react';
import { useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

import { Card, PageShell } from '../../components/ui';
import { useDemoQuota } from '../../lib/demo-quota';
import { useAuthSession } from '../../lib/use-auth-session';
import { OrganizerHero, OrganizerSidebar, OrganizerSignedOutState } from '../../features/organizer/overview';
import {
  buildCalendarConnectSuccessMessage,
  consumeRecentCalendarConnection,
} from '../../features/organizer/calendar-connect-feedback';
import { OrganizerSectionContent } from '../../features/organizer/section-content';
import type { OrganizerConsoleUser } from '../../features/organizer/types';
import { useBusyActions } from '../../features/organizer/use-busy-actions';
import { useNotificationRules } from '../../features/organizer/use-notification-rules';
import { useOrganizerBootstrap } from '../../features/organizer/use-organizer-bootstrap';
import { useOrganizerSession } from '../../features/organizer/use-organizer-session';
import { useTeamDetails } from '../../features/organizer/use-team-details';
import type { OrganizerSectionId } from '../../features/organizer/utils';
import { getOrganizerConsolePageState } from './page-state';
import styles from './page.module.css';

type OrganizerConsolePageClientProps = {
  apiBaseUrl: string;
  activeSection?: OrganizerSectionId;
};

export default function OrganizerConsolePageClient({
  apiBaseUrl,
  activeSection = 'event-types',
}: OrganizerConsolePageClientProps) {
  const router = useRouter();
  const { session, ready, clear, save } = useAuthSession();
  const { signOut } = useClerk();
  const [panelMessage, setPanelMessage] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [recentCalendarConnection, setRecentCalendarConnection] = useState<ReturnType<typeof consumeRecentCalendarConnection>>(null);
  const { authChecking, authError, authedUser, setAuthedUser, handleSignOut } = useOrganizerSession({
    apiBaseUrl,
    ready,
    session,
    clear,
    signOut,
    setPanelError,
  });
  const {
    status: demoQuotaStatus,
    loading: demoQuotaLoading,
    error: demoQuotaError,
    refresh: refreshDemoQuota,
  } = useDemoQuota({
    apiBaseUrl,
    session,
    enabled: Boolean(session),
  });
  const busy = useBusyActions();
  const organizer = useOrganizerBootstrap({
    apiBaseUrl,
    session,
    authedUser,
    refreshDemoQuota,
  });
  const teamDetails = useTeamDetails({
    apiBaseUrl,
    session,
    selectedTeamId: organizer.selectedTeamId,
  });
  const notificationRules = useNotificationRules({
    apiBaseUrl,
    session,
    eventTypes: organizer.state.eventTypes,
  });
  const pageState = getOrganizerConsolePageState({
    ready,
    authChecking,
    session,
    authedUser,
    hasResolvedInitialLoad: organizer.hasResolvedInitialLoad,
  });

  useEffect(() => {
    if (authedUser && !authedUser.onboardingCompleted) {
      router.replace('/onboarding');
    }
  }, [authedUser, router]);

  useEffect(() => {
    if (activeSection !== 'calendars') {
      return;
    }

    const feedback = consumeRecentCalendarConnection();
    if (!feedback) {
      return;
    }

    setRecentCalendarConnection(feedback);
    setPanelMessage(buildCalendarConnectSuccessMessage(feedback));
  }, [activeSection]);

  const handleProfileUpdated = (nextUser: OrganizerConsoleUser) => {
    setAuthedUser(nextUser);
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

  if (pageState === 'auth-loading') {
    return (
      <PageShell
        eyebrow="Feature 12"
        title="Organizer Console"
        description="Manage event types, availability, teams, webhooks, and calendars."
      >
        <Card>
          <p>Restoring your workspace…</p>
        </Card>
      </PageShell>
    );
  }

  if (pageState === 'signed-out') {
    return (
      <PageShell
        eyebrow="Authentication required"
        title="Organizer Console"
        description="Sign in to manage your scheduling setup."
        className={styles.signedOutShell}
        stackClassName={styles.signedOutStack}
        introClassName={styles.signedOutIntro}
      >
        <Card className={styles.signedOutCard}>
          <OrganizerSignedOutState authError={authError} styles={styles} />
        </Card>
      </PageShell>
    );
  }

  if (pageState === 'data-loading') {
    return (
      <PageShell
        eyebrow="Feature 12"
        title="Organizer Console"
        description="Run the core scheduling controls from one place."
        className={styles.loadingShell}
        stackClassName={styles.loadingStack}
        introClassName={styles.loadingIntro}
      >
        <Card className={styles.loadingCard}>
          <p>Loading organizer controls…</p>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Feature 12"
      title="Organizer Console"
      description="Run the core scheduling controls from one place."
    >
      <OrganizerHero
        apiBaseUrl={apiBaseUrl}
        session={session}
        authedUser={authedUser as NonNullable<typeof authedUser>}
        isRefreshing={organizer.isRefreshing}
        busyCount={busy.busyActions.size}
        globalError={organizer.globalError}
        panelError={panelError}
        panelMessage={panelMessage}
        handleSignOut={() => void handleSignOut()}
        refreshOrganizerState={() => void organizer.refreshOrganizerState()}
        demoQuotaStatus={demoQuotaStatus}
        demoQuotaLoading={demoQuotaLoading}
        demoQuotaError={demoQuotaError}
        refreshDemoQuota={refreshDemoQuota}
        calendarStatuses={organizer.state.calendarStatuses}
        availableCalendarProviders={organizer.state.availableCalendarProviders}
        isBusy={busy.isBusy}
        beginBusy={busy.beginBusy}
        endBusy={busy.endBusy}
        setPanelError={setPanelError}
        styles={styles}
      />

      <div className={styles.consoleLayout}>
        <OrganizerSidebar
          organizerSummary={organizer.organizerSummary}
          activeSection={activeSection}
          styles={styles}
        />

        <div className={styles.consoleMain}>
          <OrganizerSectionContent
            activeSection={activeSection}
            apiBaseUrl={apiBaseUrl}
            session={session}
            authedUser={authedUser}
            organizer={organizer}
            recentCalendarConnection={recentCalendarConnection}
            teamDetails={teamDetails}
            notificationRules={notificationRules}
            busy={busy}
            setPanelError={setPanelError}
            setPanelMessage={setPanelMessage}
            onProfileUpdated={handleProfileUpdated}
            styles={styles}
          />
        </div>
      </div>
    </PageShell>
  );
}
