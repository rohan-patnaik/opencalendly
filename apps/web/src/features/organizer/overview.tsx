'use client';

import Link from 'next/link';

import { DemoQuotaCard } from '../../components/demo-quota-card';
import { Button, LinkButton, Toast } from '../../components/ui';
import type { AuthSession } from '../../lib/auth-session';
import type { DemoQuotaStatusResponse } from '../../lib/demo-quota';
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
  styles: OrganizerStyles;
}) => {
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
  styles,
}: {
  organizerSummary: Array<{ label: string; value: string }>;
  styles: OrganizerStyles;
}) => {
  return (
    <aside className={styles.sideRail} aria-label="Organizer section navigation">
      <div className={styles.sectionNav}>
        <p className={styles.sectionNavTitle}>Console sections</p>
        {organizerSections.map((section) => (
          <a key={section.id} className={styles.sectionNavLink} href={`#${section.id}`}>
            {section.label}
          </a>
        ))}
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
