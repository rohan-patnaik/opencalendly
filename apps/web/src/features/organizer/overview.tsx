'use client';

import Link from 'next/link';

import { DemoQuotaCard } from '../../components/demo-quota-card';
import { Button, LinkButton, Toast } from '../../components/ui';
import type { CalendarConnectionStatus, CalendarProvider } from '../../lib/organizer-api';
import type { AuthSession } from '../../lib/auth-session';
import type { DemoQuotaStatusResponse } from '../../lib/demo-quota';
import { CalendarConnectActions } from './calendar-connect-actions';
import { buildCalendarConnectionSummary } from './calendar-connect';
import { organizerSections } from './utils';

type OrganizerStyles = Record<string, string>;

export const OrganizerHero = ({
  apiBaseUrl,
  session,
  authedUser,
  isRefreshing,
  busyCount,
  globalError,
  panelError,
  panelMessage,
  handleSignOut,
  refreshOrganizerState,
  demoQuotaStatus,
  demoQuotaLoading,
  demoQuotaError,
  refreshDemoQuota,
  calendarStatuses,
  availableCalendarProviders,
  isBusy,
  beginBusy,
  endBusy,
  setPanelError,
  styles,
}: {
  apiBaseUrl: string;
  session: AuthSession | null;
  authedUser: { email: string; timezone: string };
  isRefreshing: boolean;
  busyCount: number;
  globalError: string | null;
  panelError: string | null;
  panelMessage: string | null;
  handleSignOut: () => void;
  refreshOrganizerState: () => void;
  demoQuotaStatus: DemoQuotaStatusResponse | null;
  demoQuotaLoading: boolean;
  demoQuotaError: string | null;
  refreshDemoQuota: () => Promise<unknown> | void;
  calendarStatuses: CalendarConnectionStatus[];
  availableCalendarProviders: CalendarProvider[];
  isBusy: (action: string) => boolean;
  beginBusy: (action: string) => void;
  endBusy: (action: string) => void;
  setPanelError: (message: string | null) => void;
  styles: OrganizerStyles;
}) => {
  const connectedCalendars = calendarStatuses.filter((status) => status.connected).length;
  const calendarSummary = buildCalendarConnectionSummary(calendarStatuses);
  const calendarCalloutHeading =
    availableCalendarProviders.length > 0
      ? 'Connect your configured calendars from here'
      : 'Calendar integrations are unavailable here';

  return (
    <>
      <section className={styles.heroCard}>
        <div className={styles.metaStrip}>
          <span>
            Signed in as <strong>{authedUser.email}</strong>
          </span>
          <span>Timezone: {authedUser.timezone}</span>
          <Button type="button" variant="ghost" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>

        <div className={styles.rowActions}>
          <Button
            type="button"
            variant="secondary"
            onClick={refreshOrganizerState}
            disabled={isRefreshing || busyCount > 0}
          >
            {isRefreshing ? 'Refreshing…' : 'Refresh console data'}
          </Button>
          <Link className={styles.secondaryButton} href="/dashboard">
            Open analytics dashboard
          </Link>
        </div>

        {globalError ? <Toast variant="error">{globalError}</Toast> : null}
        {panelError ? <Toast variant="error">{panelError}</Toast> : null}
        {panelMessage ? <Toast variant="success">{panelMessage}</Toast> : null}

        <div className={styles.integrationCallout}>
          <div className={styles.integrationCopy}>
            <p className={styles.kicker}>Calendar integrations</p>
            <h2>{calendarCalloutHeading}</h2>
            <p>{calendarSummary}</p>
            <p className={styles.helperText}>
              {availableCalendarProviders.length === 0
                ? 'Ask an operator to configure Google or Microsoft OAuth before adding new calendar connections.'
                : connectedCalendars === 0
                ? 'Start with one provider so busy time blocks bookings and new bookings can write back.'
                : 'Add more providers or open the dedicated integrations section to tune sync and writeback preferences.'}
            </p>
          </div>
          <CalendarConnectActions
            apiBaseUrl={apiBaseUrl}
            session={session}
            isBusy={isBusy}
            beginBusy={beginBusy}
            endBusy={endBusy}
            setPanelError={setPanelError}
            availableProviders={availableCalendarProviders}
            styles={styles}
            includeManageLink
          />
        </div>
      </section>

      <section className={styles.card}>
        <DemoQuotaCard
          apiBaseUrl={apiBaseUrl}
          session={session}
          status={demoQuotaStatus}
          loading={demoQuotaLoading}
          error={demoQuotaError}
          waitlistSource="organizer-console"
          title="Launch usage budget"
          description="Track the shared launch pool and your personal daily credits while operating the app."
          onStatusChange={refreshDemoQuota}
        />
      </section>
    </>
  );
};

export const OrganizerSidebar = ({
  organizerSummary,
  activeSection,
  styles,
}: {
  organizerSummary: Array<{ label: string; value: string }>;
  activeSection: string;
  styles: OrganizerStyles;
}) => {
  return (
    <aside className={styles.sideRail} aria-label="Organizer section navigation">
      <div className={styles.sectionNav}>
        <p className={styles.sectionNavTitle}>Console sections</p>
        {organizerSections.map((section) => (
          <Link
            key={section.id}
            className={`${styles.sectionNavLink} ${activeSection === section.id ? styles.sectionNavLinkActive : ''}`.trim()}
            href={section.id === 'event-types' ? '/organizer' : `/organizer/${section.id}`}
          >
            {section.label}
          </Link>
        ))}
        <Link
          className={`${styles.sectionNavLink} ${activeSection === 'analytics' ? styles.sectionNavLinkActive : ''}`.trim()}
          href="/dashboard"
        >
          Analytics
        </Link>
      </div>

      <div className={styles.summaryGrid}>
        {organizerSummary.map((item) => (
          <article key={item.label} className={styles.summaryCard}>
            <p>{item.label}</p>
            <strong>{item.value}</strong>
          </article>
        ))}
      </div>
    </aside>
  );
};

export const OrganizerSignedOutState = ({ authError, styles }: { authError: string | null; styles: OrganizerStyles }) => {
  return (
    <>
      {authError ? <Toast variant="error">{authError}</Toast> : null}
      <div className={styles.rowActions}>
        <LinkButton href="/auth/sign-in?redirect_url=%2Forganizer" variant="primary">
          Sign in
        </LinkButton>
        <LinkButton href="/demo/intro-call" variant="secondary">
          Booking demo
        </LinkButton>
      </div>
    </>
  );
};
