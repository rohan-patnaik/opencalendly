'use client';

import { Button, Card, LinkButton, Toast } from '../../components/ui';
import type {
  DashboardUser,
  FunnelResponse,
  OperatorHealthResponse,
  TeamResponse,
} from './types';

type DashboardStyles = Record<string, string>;

type SignedInHeaderProps = {
  authedUser: DashboardUser;
  signOutError: string | null;
  onSignOut: () => void;
  styles: DashboardStyles;
};

export const DashboardSignedInHeader = ({
  authedUser,
  signOutError,
  onSignOut,
  styles,
}: SignedInHeaderProps) => {
  return (
    <section className={styles.card}>
      <div className={styles.metaRow}>
        <span>
          Signed in as <strong>{authedUser.email}</strong>
        </span>
        <span>Timezone: {authedUser.timezone}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
      {signOutError ? <Toast variant="error">{signOutError}</Toast> : null}
    </section>
  );
};

export const DashboardQuickActions = ({ styles }: { styles: DashboardStyles }) => {
  return (
    <section className={styles.card}>
      <p className={styles.kicker}>Operations</p>
      <h2>Quick actions</h2>
      <div className={styles.quickLinks}>
        <LinkButton href="/organizer#event-types" variant="secondary">
          Manage event types
        </LinkButton>
        <LinkButton href="/organizer#teams" variant="secondary">
          Manage teams
        </LinkButton>
        <LinkButton href="/organizer#webhooks" variant="secondary">
          Run webhooks
        </LinkButton>
        <LinkButton href="/organizer#writeback" variant="secondary">
          Run writeback queue
        </LinkButton>
      </div>
    </section>
  );
};

type DashboardFiltersProps = {
  styles: DashboardStyles;
  startDate: string;
  endDate: string;
  eventTypeId: string;
  teamId: string;
  loading: boolean;
  error: string | null;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onEventTypeIdChange: (value: string) => void;
  onTeamIdChange: (value: string) => void;
  onLoad: () => void;
  onReset: () => void;
};

export const DashboardFilters = ({
  styles,
  startDate,
  endDate,
  eventTypeId,
  teamId,
  loading,
  error,
  onStartDateChange,
  onEndDateChange,
  onEventTypeIdChange,
  onTeamIdChange,
  onLoad,
  onReset,
}: DashboardFiltersProps) => {
  return (
    <section className={styles.card}>
      <h2>Filters</h2>
      <div className={styles.grid}>
        <label className={styles.label}>
          Start date
          <input
            className={styles.input}
            type="date"
            value={startDate}
            onChange={(event) => onStartDateChange(event.target.value)}
          />
        </label>
        <label className={styles.label}>
          End date
          <input
            className={styles.input}
            type="date"
            value={endDate}
            onChange={(event) => onEndDateChange(event.target.value)}
          />
        </label>
        <label className={styles.label}>
          Event type ID (optional)
          <input
            className={styles.input}
            value={eventTypeId}
            onChange={(event) => onEventTypeIdChange(event.target.value)}
            placeholder="UUID"
          />
        </label>
        <label className={styles.label}>
          Team ID (optional)
          <input
            className={styles.input}
            value={teamId}
            onChange={(event) => onTeamIdChange(event.target.value)}
            placeholder="UUID"
          />
        </label>
      </div>
      <div className={styles.actions}>
        <Button type="button" onClick={onLoad} disabled={loading}>
          {loading ? 'Loading...' : 'Load analytics'}
        </Button>
        <button type="button" className={styles.linkButton} onClick={onReset} disabled={loading}>
          Reset filters
        </button>
      </div>
      {error ? <Toast variant="error">{error}</Toast> : null}
    </section>
  );
};

export const DashboardFunnelSection = ({
  funnel,
  styles,
}: {
  funnel: FunnelResponse;
  styles: DashboardStyles;
}) => {
  return (
    <section className={styles.card}>
      <h2>Funnel Summary</h2>
      <div className={styles.statGrid}>
        <div>
          <strong>{funnel.summary.pageViews}</strong>
          <span>Page views</span>
        </div>
        <div>
          <strong>{funnel.summary.slotSelections}</strong>
          <span>Slot selections</span>
        </div>
        <div>
          <strong>{funnel.summary.bookingConfirmations}</strong>
          <span>Booking confirmations</span>
        </div>
        <div>
          <strong>{(funnel.summary.conversionRate * 100).toFixed(2)}%</strong>
          <span>Conversion</span>
        </div>
        <div>
          <strong>{funnel.summary.confirmed}</strong>
          <span>Confirmed</span>
        </div>
        <div>
          <strong>{funnel.summary.canceled}</strong>
          <span>Canceled</span>
        </div>
        <div>
          <strong>{funnel.summary.rescheduled}</strong>
          <span>Rescheduled</span>
        </div>
      </div>

      <h3>By Event Type</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Event</th>
              <th>Views</th>
              <th>Slots</th>
              <th>Booked</th>
              <th>Canceled</th>
            </tr>
          </thead>
          <tbody>
            {funnel.byEventType.map((row) => (
              <tr key={row.eventTypeId}>
                <td>{row.eventTypeName}</td>
                <td>{row.pageViews}</td>
                <td>{row.slotSelections}</td>
                <td>{row.bookingConfirmations}</td>
                <td>{row.canceled}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export const DashboardTeamSection = ({
  team,
  styles,
}: {
  team: TeamResponse;
  styles: DashboardStyles;
}) => {
  return (
    <section className={styles.card}>
      <h2>Team Scheduling Analytics</h2>
      <h3>Round-robin assignment distribution</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Team</th>
              <th>Event</th>
              <th>Member</th>
              <th>Assignments</th>
            </tr>
          </thead>
          <tbody>
            {team.roundRobinAssignments.map((row) => (
              <tr key={`${row.teamEventTypeId}-${row.memberUserId}`}>
                <td>{row.teamName}</td>
                <td>{row.eventTypeName}</td>
                <td>{row.memberDisplayName}</td>
                <td>{row.assignments}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Collective booking volume</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Team</th>
              <th>Event</th>
              <th>Bookings</th>
            </tr>
          </thead>
          <tbody>
            {team.collectiveBookings.map((row) => (
              <tr key={row.teamEventTypeId}>
                <td>{row.teamName}</td>
                <td>{row.eventTypeName}</td>
                <td>{row.bookings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export const DashboardOperatorHealthSection = ({
  operatorHealth,
  styles,
}: {
  operatorHealth: OperatorHealthResponse;
  styles: DashboardStyles;
}) => {
  return (
    <section className={styles.card}>
      <h2>Operator Health</h2>
      <div className={styles.statGrid}>
        <div>
          <strong>{operatorHealth.webhookDeliveries.total}</strong>
          <span>Webhook deliveries</span>
        </div>
        <div>
          <strong>{operatorHealth.webhookDeliveries.failed}</strong>
          <span>Webhook failed</span>
        </div>
        <div>
          <strong>{operatorHealth.emailDeliveries.total}</strong>
          <span>Email deliveries</span>
        </div>
        <div>
          <strong>{operatorHealth.emailDeliveries.failed}</strong>
          <span>Email failed</span>
        </div>
      </div>

      <h3>Email by type</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Email type</th>
              <th>Total</th>
              <th>Succeeded</th>
              <th>Failed</th>
            </tr>
          </thead>
          <tbody>
            {operatorHealth.emailDeliveries.byType.map((row) => (
              <tr key={row.emailType}>
                <td>{row.emailType}</td>
                <td>{row.total}</td>
                <td>{row.succeeded}</td>
                <td>{row.failed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export const DashboardSignedOutState = ({
  authError,
  styles,
}: {
  authError: string | null;
  styles: DashboardStyles;
}) => {
  return (
    <Card>
      {authError ? <Toast variant="error">{authError}</Toast> : null}
      <div className={styles.actions}>
        <LinkButton href="/auth/sign-in" variant="primary">
          Sign in
        </LinkButton>
        <LinkButton href="/demo/intro-call" variant="secondary">
          View booking demo
        </LinkButton>
      </div>
    </Card>
  );
};
