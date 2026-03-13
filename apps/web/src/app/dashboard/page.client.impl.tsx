'use client';

import { useEffect } from 'react';
import { useClerk } from '@clerk/nextjs';

import { Card, PageShell } from '../../components/ui';
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

  if (!ready || authChecking) {
    return (
      <PageShell
        eyebrow="Feature 8"
        title="Analytics Dashboard"
        description="Read-only organizer analytics for funnel, team distribution, and operator health."
      >
        <Card>
          <p>Restoring your session…</p>
        </Card>
      </PageShell>
    );
  }

  if (!session || !authedUser) {
    return (
      <PageShell
        eyebrow="Authentication required"
        title="Analytics Dashboard"
        description="Sign in to access organizer analytics dashboards."
      >
        <DashboardSignedOutState authError={authError} styles={styles} />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Feature 8"
      title="Analytics Dashboard"
      description="Read-only organizer analytics for funnel, team scheduling distribution, and operator health."
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
