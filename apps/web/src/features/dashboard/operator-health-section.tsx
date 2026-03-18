'use client';

import type { OperatorHealthResponse } from './types';

type DashboardStyles = Record<string, string>;

const formatAlertLabel = (value: string) => value.split('_').join(' ');

const renderHealthStatus = (
  status: 'ok' | 'degraded' | 'disconnected',
  styles: DashboardStyles,
) => {
  const label = status === 'ok' ? 'OK' : status === 'degraded' ? 'Degraded' : 'Disconnected';
  const tone =
    status === 'ok'
      ? styles.healthStatusOk
      : status === 'degraded'
        ? styles.healthStatusDegraded
        : styles.healthStatusDisconnected;

  return <span className={`${styles.healthStatus} ${tone}`}>{label}</span>;
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
      <div className={styles.metaRow}>
        {renderHealthStatus(operatorHealth.status, styles)}
        <span>
          Range: {operatorHealth.range.startDate} to {operatorHealth.range.endDate}
        </span>
      </div>
      {operatorHealth.alerts.length > 0 ? (
        <div className={styles.alertList}>
          {operatorHealth.alerts.map((alert) => (
            <span key={alert} className={styles.alertBadge}>
              {formatAlertLabel(alert)}
            </span>
          ))}
        </div>
      ) : null}
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
          <strong>{operatorHealth.webhookQueue.pending}</strong>
          <span>Webhook queue pending</span>
        </div>
        <div>
          <strong>{operatorHealth.calendarWriteback.failed}</strong>
          <span>Writeback failed</span>
        </div>
        <div>
          <strong>{operatorHealth.calendarWriteback.pending}</strong>
          <span>Writeback queue pending</span>
        </div>
        <div>
          <strong>{operatorHealth.calendarProviders.totalConnected}</strong>
          <span>Connected calendars</span>
        </div>
        <div>
          <strong>{operatorHealth.calendarProviders.stale}</strong>
          <span>Stale providers</span>
        </div>
        <div>
          <strong>{operatorHealth.calendarProviders.errored}</strong>
          <span>Provider errors</span>
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

      <h3>Calendar providers</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Status</th>
              <th>Account</th>
              <th>Last sync</th>
              <th>Next sync</th>
              <th>Last error</th>
            </tr>
          </thead>
          <tbody>
            {operatorHealth.calendarProviders.byProvider.map((row) => (
              <tr key={row.provider}>
                <td>{row.provider}</td>
                <td>{renderHealthStatus(row.status, styles)}</td>
                <td>{row.externalEmail ?? 'Not connected'}</td>
                <td>{row.lastSyncedAt ?? 'Not synced yet'}</td>
                <td>{row.nextSyncAt ?? 'Not scheduled'}</td>
                <td>{row.lastError ?? 'None'}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
