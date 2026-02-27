'use client';

import { useCallback, useMemo, useState } from 'react';

import styles from './page.module.css';

type DashboardPageClientProps = {
  apiBaseUrl: string;
};

type FunnelResponse = {
  ok: boolean;
  summary: {
    pageViews: number;
    slotSelections: number;
    bookingConfirmations: number;
    confirmed: number;
    canceled: number;
    rescheduled: number;
    conversionRate: number;
  };
  byEventType: Array<{
    eventTypeId: string;
    eventTypeName: string;
    pageViews: number;
    slotSelections: number;
    bookingConfirmations: number;
    confirmed: number;
    canceled: number;
    rescheduled: number;
  }>;
  daily: Array<{
    date: string;
    eventTypeId: string;
    eventTypeName: string;
    pageViews: number;
    slotSelections: number;
    bookingConfirmations: number;
    confirmed: number;
    canceled: number;
    rescheduled: number;
  }>;
  error?: string;
};

type TeamResponse = {
  ok: boolean;
  roundRobinAssignments: Array<{
    teamEventTypeId: string;
    teamId: string;
    teamName: string;
    eventTypeId: string;
    eventTypeName: string;
    memberUserId: string;
    memberDisplayName: string;
    assignments: number;
  }>;
  collectiveBookings: Array<{
    teamEventTypeId: string;
    teamId: string;
    teamName: string;
    eventTypeId: string;
    eventTypeName: string;
    bookings: number;
  }>;
  error?: string;
};

type OperatorHealthResponse = {
  ok: boolean;
  webhookDeliveries: {
    total: number;
    pending: number;
    succeeded: number;
    failed: number;
  };
  emailDeliveries: {
    total: number;
    succeeded: number;
    failed: number;
    byType: Array<{
      emailType: string;
      total: number;
      succeeded: number;
      failed: number;
    }>;
  };
  error?: string;
};

type ApiErrorResponse = {
  ok?: boolean;
  error?: string;
};

const toIsoDate = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function DashboardPageClient({ apiBaseUrl }: DashboardPageClientProps) {
  const defaultRange = useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 29);
    return {
      startDate: toIsoDate(start),
      endDate: toIsoDate(end),
    };
  }, []);

  const [sessionToken, setSessionToken] = useState('');
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [eventTypeId, setEventTypeId] = useState('');
  const [teamId, setTeamId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [funnel, setFunnel] = useState<FunnelResponse | null>(null);
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [operatorHealth, setOperatorHealth] = useState<OperatorHealthResponse | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) {
      params.set('startDate', startDate);
    }
    if (endDate) {
      params.set('endDate', endDate);
    }
    if (eventTypeId.trim()) {
      params.set('eventTypeId', eventTypeId.trim());
    }
    if (teamId.trim()) {
      params.set('teamId', teamId.trim());
    }
    return params.toString();
  }, [endDate, eventTypeId, startDate, teamId]);

  const loadDashboard = useCallback(async () => {
    if (!sessionToken.trim()) {
      setFunnel(null);
      setTeam(null);
      setOperatorHealth(null);
      setError('Session token is required. Generate one via /v0/auth/magic-link + /v0/auth/verify.');
      return;
    }

    if (startDate && endDate && startDate > endDate) {
      setFunnel(null);
      setTeam(null);
      setOperatorHealth(null);
      setError('Start date must be on or before end date.');
      return;
    }

    setLoading(true);
    setError(null);

    const headers = {
      Authorization: `Bearer ${sessionToken.trim()}`,
    };

    try {
      const [funnelResponse, teamResponse, operatorResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/v0/analytics/funnel?${queryString}`, {
          cache: 'no-store',
          headers,
        }),
        fetch(`${apiBaseUrl}/v0/analytics/team?${queryString}`, {
          cache: 'no-store',
          headers,
        }),
        fetch(`${apiBaseUrl}/v0/analytics/operator/health?${queryString}`, {
          cache: 'no-store',
          headers,
        }),
      ]);

      const [funnelPayload, teamPayload, operatorPayload] = (await Promise.all([
        funnelResponse.json(),
        teamResponse.json(),
        operatorResponse.json(),
      ])) as [FunnelResponse & ApiErrorResponse, TeamResponse & ApiErrorResponse, OperatorHealthResponse & ApiErrorResponse];

      if (!funnelResponse.ok || !funnelPayload.ok) {
        throw new Error(funnelPayload.error || 'Unable to load funnel analytics.');
      }
      if (!teamResponse.ok || !teamPayload.ok) {
        throw new Error(teamPayload.error || 'Unable to load team analytics.');
      }
      if (!operatorResponse.ok || !operatorPayload.ok) {
        throw new Error(operatorPayload.error || 'Unable to load operator health analytics.');
      }

      setFunnel(funnelPayload);
      setTeam(teamPayload);
      setOperatorHealth(operatorPayload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load analytics dashboard.');
      setFunnel(null);
      setTeam(null);
      setOperatorHealth(null);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, queryString, sessionToken]);

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.kicker}>Feature 8</p>
        <h1>Analytics Dashboard (v1)</h1>
        <p>Read-only organizer analytics for funnel, team scheduling distribution, and operator health.</p>
      </section>

      <section className={styles.card}>
        <h2>Filters</h2>
        <div className={styles.grid}>
          <label className={styles.label}>
            Session token
            <input
              className={styles.input}
              type="password"
              value={sessionToken}
              onChange={(event) => setSessionToken(event.target.value)}
              placeholder="Paste bearer session token"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <label className={styles.label}>
            Start date
            <input
              className={styles.input}
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label className={styles.label}>
            End date
            <input
              className={styles.input}
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
          <label className={styles.label}>
            Event type ID (optional)
            <input
              className={styles.input}
              value={eventTypeId}
              onChange={(event) => setEventTypeId(event.target.value)}
              placeholder="UUID"
            />
          </label>
          <label className={styles.label}>
            Team ID (optional)
            <input
              className={styles.input}
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
              placeholder="UUID"
            />
          </label>
        </div>
        <button className={styles.primaryButton} type="button" onClick={() => void loadDashboard()} disabled={loading}>
          {loading ? 'Loading...' : 'Load analytics'}
        </button>
        {error ? <p className={styles.error}>{error}</p> : null}
      </section>

      {funnel ? (
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
      ) : null}

      {team ? (
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
      ) : null}

      {operatorHealth ? (
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
      ) : null}
    </main>
  );
}
