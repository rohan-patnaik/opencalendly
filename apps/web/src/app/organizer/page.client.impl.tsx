'use client';

import { useState } from 'react';
import { useClerk } from '@clerk/nextjs';

import { Card, PageShell } from '../../components/ui';
import { useDemoQuota } from '../../lib/demo-quota';
import { useAuthSession } from '../../lib/use-auth-session';
import { AvailabilityPanel } from '../../features/organizer/availability-panel';
import { CalendarsPanel } from '../../features/organizer/calendars-panel';
import { EventTypesPanel } from '../../features/organizer/event-types-panel';
import { NotificationRulesPanel } from '../../features/organizer/notification-rules-panel';
import { OrganizerHero, OrganizerSidebar, OrganizerSignedOutState } from '../../features/organizer/overview';
import { TeamsPanel } from '../../features/organizer/teams-panel';
import { TimeOffPanel } from '../../features/organizer/time-off-panel';
import { useBusyActions } from '../../features/organizer/use-busy-actions';
import { useNotificationRules } from '../../features/organizer/use-notification-rules';
import { useOrganizerBootstrap } from '../../features/organizer/use-organizer-bootstrap';
import { useOrganizerSession } from '../../features/organizer/use-organizer-session';
import { useTeamDetails } from '../../features/organizer/use-team-details';
import { WebhooksPanel } from '../../features/organizer/webhooks-panel';
import { WritebackPanel } from '../../features/organizer/writeback-panel';
import styles from './page.module.css';

type OrganizerConsolePageClientProps = {
  apiBaseUrl: string;
};

export default function OrganizerConsolePageClient({ apiBaseUrl }: OrganizerConsolePageClientProps) {
  const { session, ready, clear } = useAuthSession();
  const { signOut } = useClerk();
  const [panelMessage, setPanelMessage] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const { authChecking, authError, authedUser, handleSignOut } = useOrganizerSession({
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

  if (!ready || authChecking) {
    return (
      <PageShell
        eyebrow="Feature 12"
        title="Organizer Console"
        description="Manage event types, availability, teams, webhooks, and calendar status."
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
        title="Organizer Console"
        description="Sign in to manage event types, teams, webhooks, and calendars."
      >
        <Card>
          <OrganizerSignedOutState authError={authError} styles={styles} />
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Feature 12"
      title="Organizer Console"
      description="Manage all shipped organizer APIs from UI: event types, availability, teams, webhooks, calendar sync, and writeback queue controls."
    >
      <OrganizerHero
        apiBaseUrl={apiBaseUrl}
        session={session}
        authedUser={authedUser}
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
        styles={styles}
      />

      <div className={styles.consoleLayout}>
        <OrganizerSidebar organizerSummary={organizer.organizerSummary} styles={styles} />

        <div className={styles.consoleMain}>
          <section id="event-types" className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2>Event types</h2>
              <p>Create, list, and edit one-on-one event types.</p>
            </div>
            <EventTypesPanel
              apiBaseUrl={apiBaseUrl}
              session={session}
              eventTypes={organizer.state.eventTypes}
              isBusy={busy.isBusy}
              beginBusy={busy.beginBusy}
              endBusy={busy.endBusy}
              refreshOrganizerState={organizer.refreshOrganizerState}
              setPanelError={setPanelError}
              setPanelMessage={setPanelMessage}
              styles={styles}
            />
            <NotificationRulesPanel
              apiBaseUrl={apiBaseUrl}
              session={session}
              eventTypes={organizer.state.eventTypes}
              notificationRulesEventTypeId={notificationRules.notificationRulesEventTypeId}
              setNotificationRulesEventTypeId={notificationRules.setNotificationRulesEventTypeId}
              notificationRules={notificationRules.notificationRules}
              notificationRulesLoading={notificationRules.notificationRulesLoading}
              notificationRulesError={notificationRules.notificationRulesError}
              refreshNotificationRules={notificationRules.refreshNotificationRules}
              setNotificationRules={notificationRules.setNotificationRules}
              isBusy={busy.isBusy}
              beginBusy={busy.beginBusy}
              endBusy={busy.endBusy}
              setPanelError={setPanelError}
              setPanelMessage={setPanelMessage}
              styles={styles}
            />
          </section>

          <section id="availability" className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2>Availability rules + overrides</h2>
              <p>Read and replace organizer availability definitions used by slot computation.</p>
            </div>
            <AvailabilityPanel
              apiBaseUrl={apiBaseUrl}
              session={session}
              availabilityRules={organizer.state.availabilityRules}
              availabilityOverrides={organizer.state.availabilityOverrides}
              isBusy={busy.isBusy}
              beginBusy={busy.beginBusy}
              endBusy={busy.endBusy}
              refreshOrganizerState={organizer.refreshOrganizerState}
              setPanelError={setPanelError}
              setPanelMessage={setPanelMessage}
              styles={styles}
            />
          </section>

          <section id="time-off" className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2>Time off + holiday import</h2>
              <p>Create hard blocking windows and import yearly holiday presets.</p>
            </div>
            <TimeOffPanel
              apiBaseUrl={apiBaseUrl}
              session={session}
              timeOffBlocks={organizer.state.timeOffBlocks}
              isBusy={busy.isBusy}
              beginBusy={busy.beginBusy}
              endBusy={busy.endBusy}
              refreshOrganizerState={organizer.refreshOrganizerState}
              setPanelError={setPanelError}
              setPanelMessage={setPanelMessage}
              styles={styles}
            />
          </section>

          <section id="teams" className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2>Teams + members + team event types</h2>
              <p>Create teams, add members, and configure round-robin / collective event types.</p>
            </div>
            <TeamsPanel
              apiBaseUrl={apiBaseUrl}
              session={session}
              teams={organizer.state.teams}
              selectedTeamId={organizer.selectedTeamId}
              setSelectedTeamId={organizer.setSelectedTeamId}
              selectedTeam={organizer.selectedTeam}
              teamMembers={teamDetails.teamMembers}
              teamEventTypes={teamDetails.teamEventTypes}
              teamDetailsLoading={teamDetails.teamDetailsLoading}
              teamDetailsError={teamDetails.teamDetailsError}
              refreshTeamDetails={teamDetails.refreshTeamDetails}
              refreshOrganizerState={organizer.refreshOrganizerState}
              isBusy={busy.isBusy}
              beginBusy={busy.beginBusy}
              endBusy={busy.endBusy}
              setPanelError={setPanelError}
              setPanelMessage={setPanelMessage}
              styles={styles}
            />
          </section>

          <section id="webhooks" className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2>Webhooks + delivery runner</h2>
              <p>Create/list/update subscriptions and trigger delivery processing.</p>
            </div>
            <WebhooksPanel
              apiBaseUrl={apiBaseUrl}
              session={session}
              webhooks={organizer.state.webhooks}
              refreshOrganizerState={organizer.refreshOrganizerState}
              isBusy={busy.isBusy}
              beginBusy={busy.beginBusy}
              endBusy={busy.endBusy}
              setPanelError={setPanelError}
              setPanelMessage={setPanelMessage}
              styles={styles}
            />
          </section>

          <section id="calendars" className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2>Calendar integrations (Google + Microsoft)</h2>
              <p>Connect, sync, and disconnect provider calendars using the existing API contracts.</p>
            </div>
            <CalendarsPanel
              apiBaseUrl={apiBaseUrl}
              session={session}
              calendarStatuses={organizer.state.calendarStatuses}
              refreshOrganizerState={organizer.refreshOrganizerState}
              isBusy={busy.isBusy}
              beginBusy={busy.beginBusy}
              endBusy={busy.endBusy}
              setPanelError={setPanelError}
              setPanelMessage={setPanelMessage}
              styles={styles}
            />
          </section>

          <section id="writeback" className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2>Calendar writeback queue</h2>
              <p>Inspect pending/failed writebacks and trigger retry processing.</p>
            </div>
            <WritebackPanel
              apiBaseUrl={apiBaseUrl}
              session={session}
              writebackStatus={organizer.state.writebackStatus}
              refreshOrganizerState={organizer.refreshOrganizerState}
              isBusy={busy.isBusy}
              beginBusy={busy.beginBusy}
              endBusy={busy.endBusy}
              setPanelError={setPanelError}
              setPanelMessage={setPanelMessage}
              styles={styles}
            />
          </section>
        </div>
      </div>
    </PageShell>
  );
}
