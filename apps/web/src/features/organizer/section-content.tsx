'use client';

import type { Dispatch, SetStateAction } from 'react';

import type { AuthSession } from '../../lib/auth-session';
import type {
  NotificationRule,
  TeamEventType,
  TeamMember,
} from '../../lib/organizer-api';
import { AvailabilityPanel } from './availability-panel';
import { CalendarsPanel } from './calendars-panel';
import { EventTypesPanel } from './event-types-panel';
import { NotificationRulesPanel } from './notification-rules-panel';
import { ProfilePanel } from './profile-panel';
import { TeamsPanel } from './teams-panel';
import { TimeOffPanel } from './time-off-panel';
import type { OrganizerConsoleUser, OrganizerSectionsState } from './types';
import type { OrganizerSectionId } from './utils';
import { WebhooksPanel } from './webhooks-panel';
import { WritebackPanel } from './writeback-panel';

type OrganizerSectionContentProps = {
  activeSection: OrganizerSectionId;
  apiBaseUrl: string;
  session: AuthSession | null;
  authedUser: OrganizerConsoleUser | null;
  organizer: {
    state: OrganizerSectionsState;
    selectedTeamId: string;
    selectedTeam: OrganizerSectionsState['teams'][number] | null;
    refreshOrganizerState: () => Promise<void>;
    setSelectedTeamId: Dispatch<SetStateAction<string>>;
  };
  teamDetails: {
    teamMembers: TeamMember[];
    teamEventTypes: TeamEventType[];
    teamDetailsLoading: boolean;
    teamDetailsError: string | null;
    refreshTeamDetails: (teamId: string) => Promise<void>;
  };
  notificationRules: {
    notificationRulesEventTypeId: string;
    setNotificationRulesEventTypeId: Dispatch<SetStateAction<string>>;
    notificationRules: NotificationRule[];
    notificationRulesLoading: boolean;
    notificationRulesError: string | null;
    refreshNotificationRules: (eventTypeId: string) => Promise<void>;
    setNotificationRules: Dispatch<SetStateAction<NotificationRule[]>>;
  };
  busy: {
    isBusy: (action: string) => boolean;
    beginBusy: (action: string) => void;
    endBusy: (action: string) => void;
  };
  setPanelError: (message: string | null) => void;
  setPanelMessage: (message: string | null) => void;
  onProfileUpdated: (user: OrganizerConsoleUser) => void;
  styles: Record<string, string>;
};

export function OrganizerSectionContent({
  activeSection,
  apiBaseUrl,
  session,
  authedUser,
  organizer,
  teamDetails,
  notificationRules,
  busy,
  setPanelError,
  setPanelMessage,
  onProfileUpdated,
  styles,
}: OrganizerSectionContentProps) {
  if (activeSection === 'event-types') {
    return (
      <section id="event-types" className={styles.card}>
        <div className={styles.sectionHeader}>
          <h2>Event types</h2>
          <p>Create and update one-on-one event types.</p>
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
    );
  }

  if (activeSection === 'availability') {
    return (
      <section id="availability" className={styles.card}>
        <div className={styles.sectionHeader}>
          <h2>Availability rules + overrides</h2>
          <p>Set the rules that shape bookable time.</p>
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
    );
  }

  if (activeSection === 'time-off') {
    return (
      <section id="time-off" className={styles.card}>
        <div className={styles.sectionHeader}>
          <h2>Time off + holiday import</h2>
          <p>Block time and pull in holiday presets.</p>
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
    );
  }

  if (activeSection === 'teams') {
    return (
      <section id="teams" className={styles.card}>
        <div className={styles.sectionHeader}>
          <h2>Teams + members + team event types</h2>
          <p>Set up teams, members, and shared event types.</p>
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
    );
  }

  if (activeSection === 'webhooks') {
    return (
      <section id="webhooks" className={styles.card}>
        <div className={styles.sectionHeader}>
          <h2>Webhooks + delivery runner</h2>
          <p>Manage subscriptions and run deliveries when needed.</p>
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
    );
  }

  if (activeSection === 'calendars') {
    return (
      <section id="calendars" className={styles.card}>
        <div className={styles.sectionHeader}>
          <h2>Calendar integrations</h2>
          <p>Connect multiple calendars, decide which ones block availability, and choose one writeback target.</p>
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
    );
  }

  if (activeSection === 'profile' && authedUser) {
    return (
      <section id="profile" className={styles.card}>
        <div className={styles.sectionHeader}>
          <h2>Profile</h2>
          <p>Edit your public username, display name, and timezone.</p>
        </div>
        <ProfilePanel
          apiBaseUrl={apiBaseUrl}
          session={session}
          user={authedUser}
          onProfileUpdated={onProfileUpdated}
          isBusy={busy.isBusy}
          beginBusy={busy.beginBusy}
          endBusy={busy.endBusy}
          setPanelError={setPanelError}
          setPanelMessage={setPanelMessage}
          styles={styles}
        />
      </section>
    );
  }

  return (
    <section id="writeback" className={styles.card}>
      <div className={styles.sectionHeader}>
        <h2>Calendar writeback queue</h2>
        <p>Review writebacks and retry anything that got stuck.</p>
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
  );
}
