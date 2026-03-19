'use client';

import { useEffect } from 'react';
import { useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

import { Card, PageShell } from '../../components/ui';
import { resolvePostAuthRoute } from '../../lib/post-auth-route';
import { useAuthSession } from '../../lib/use-auth-session';
import {
  DashboardFilters,
  DashboardFunnelSection,
  DashboardOperatorHealthSection,
  DashboardQuickActions,
  DashboardSignedInHeader,
  DashboardSignedOutState,
  DashboardTeamSection,
} from '../../features/dashboard/sections';
import { useDashboardData } from '../../features/dashboard/use-dashboard-data';
import { useDashboardSession } from '../../features/dashboard/use-dashboard-session';
import styles from './page.module.css';

type DashboardPageClientProps = {
  apiBaseUrl: string;
};

export default function DashboardPageClient({ apiBaseUrl }: DashboardPageClientProps) {
  const router = useRouter();
  const { session, ready, clear } = useAuthSession();
  const { signOut } = useClerk();
  const { authChecking, authError, authedUser, signOutError, handleSignOut } = useDashboardSession({
    apiBaseUrl,
    ready,
    session,
    clear,
    signOut,
  });
  const dashboard = useDashboardData({ apiBaseUrl, session });

  useEffect(() => {
    if (!session) {
      dashboard.clearData();
    }
  }, [dashboard, session]);

  useEffect(() => {
    if (authedUser && !authedUser.onboardingCompleted) {
      router.replace(resolvePostAuthRoute(false));
    }
  }, [authedUser, router]);

  if (!ready || authChecking) {
    return (
      <PageShell
        eyebrow="Feature 8"
        title="Analytics Dashboard"
        description="Track funnel, team load, and operator health."
      >
        <Card>
          <p>Restoring your dashboard…</p>
        </Card>
      </PageShell>
    );
  }

  if (!session || !authedUser) {
    return (
      <PageShell
        eyebrow="Authentication required"
        title="Analytics Dashboard"
        description="Sign in to view scheduling analytics."
        className={styles.signedOutShell}
        stackClassName={styles.signedOutStack}
        introClassName={styles.signedOutIntro}
      >
        <DashboardSignedOutState authError={authError} styles={styles} />
      </PageShell>
    );
  }

  if (!authedUser.onboardingCompleted) {
    return null;
  }

  return (
    <PageShell
      eyebrow="Feature 8"
      title="Analytics Dashboard"
      description="Track bookings, team distribution, and operational health."
    >
      <DashboardSignedInHeader
        authedUser={authedUser}
        signOutError={signOutError}
        onSignOut={() => void handleSignOut()}
        styles={styles}
      />
      <DashboardQuickActions styles={styles} />
      <DashboardFilters
        styles={styles}
        startDate={dashboard.startDate}
        endDate={dashboard.endDate}
        eventTypeId={dashboard.eventTypeId}
        teamId={dashboard.teamId}
        loading={dashboard.loading}
        error={dashboard.error}
        onStartDateChange={dashboard.setStartDate}
        onEndDateChange={dashboard.setEndDate}
        onEventTypeIdChange={dashboard.setEventTypeId}
        onTeamIdChange={dashboard.setTeamId}
        onLoad={() => void dashboard.loadDashboard()}
        onReset={dashboard.resetFilters}
      />

      {dashboard.funnel ? <DashboardFunnelSection funnel={dashboard.funnel} styles={styles} /> : null}
      {dashboard.team ? <DashboardTeamSection team={dashboard.team} styles={styles} /> : null}
      {dashboard.operatorHealth ? (
        <DashboardOperatorHealthSection
          operatorHealth={dashboard.operatorHealth}
          styles={styles}
        />
      ) : null}
    </PageShell>
  );
}
