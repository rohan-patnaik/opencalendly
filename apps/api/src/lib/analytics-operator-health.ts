export const OPERATOR_HEALTH_QUEUE_DEGRADED_THRESHOLD = 25;
export const OPERATOR_HEALTH_SYNC_STALE_GRACE_MINUTES = 30;

const summarizeQueueRows = (rows: Array<{ status: string; count?: number }>) => {
  const summary = { total: 0, pending: 0, succeeded: 0, failed: 0 };
  for (const row of rows) {
    const count = row.count ?? 1;
    summary.total += count;
    if (row.status === 'pending') {
      summary.pending += count;
    } else if (row.status === 'succeeded') {
      summary.succeeded += count;
    } else {
      summary.failed += count;
    }
  }

  return summary;
};

const resolveProviderHealthStatus = (input: {
  now: Date;
  createdAt: Date | null;
  lastSyncedAt: Date | null;
  nextSyncAt: Date | null;
  lastError: string | null;
}) => {
  if (input.lastError) {
    return { status: 'degraded' as const, stale: true };
  }

  if (input.nextSyncAt && input.nextSyncAt.getTime() < input.now.getTime()) {
    return { status: 'degraded' as const, stale: true };
  }

  if (
    !input.lastSyncedAt &&
    input.createdAt &&
    input.createdAt.getTime() + OPERATOR_HEALTH_SYNC_STALE_GRACE_MINUTES * 60_000 < input.now.getTime()
  ) {
    return { status: 'degraded' as const, stale: true };
  }

  return { status: 'ok' as const, stale: false };
};

export const summarizeOperatorHealth = (input: {
  webhookRows: Array<{ status: string; count?: number }>;
  webhookQueueRows: Array<{ status: string; count?: number }>;
  writebackRows: Array<{ status: string; count?: number }>;
  emailRows: Array<{ status: string; emailType: string; count?: number }>;
  calendarRows: Array<{
    provider: string;
    externalEmail: string | null;
    lastSyncedAt: Date | null;
    nextSyncAt: Date | null;
    lastError: string | null;
    createdAt: Date | null;
  }>;
  now?: Date;
}) => {
  const now = input.now ?? new Date();
  const webhookSummary = summarizeQueueRows(input.webhookRows);

  const emailSummary = { total: 0, succeeded: 0, failed: 0 };
  const byEmailType = new Map<string, { emailType: string; total: number; succeeded: number; failed: number }>();
  for (const row of input.emailRows) {
    const count = row.count ?? 1;
    emailSummary.total += count;
    if (row.status === 'succeeded') {
      emailSummary.succeeded += count;
    } else {
      emailSummary.failed += count;
    }

    const existing = byEmailType.get(row.emailType);
    if (existing) {
      existing.total += count;
      if (row.status === 'succeeded') {
        existing.succeeded += count;
      } else {
        existing.failed += count;
      }
      continue;
    }

    byEmailType.set(row.emailType, {
      emailType: row.emailType,
      total: count,
      succeeded: row.status === 'succeeded' ? count : 0,
      failed: row.status === 'succeeded' ? 0 : count,
    });
  }

  const webhookQueue = summarizeQueueRows(input.webhookQueueRows);
  const calendarWriteback = summarizeQueueRows(input.writebackRows);

  const providerRows = input.calendarRows.map((row) => {
    const connected = Boolean(row.externalEmail);
    if (!connected) {
      return {
        provider: row.provider,
        connected: false,
        externalEmail: row.externalEmail,
        lastSyncedAt: null,
        nextSyncAt: null,
        lastError: row.lastError,
        stale: false,
        status: 'disconnected' as const,
      };
    }

    const freshness = resolveProviderHealthStatus({
      now,
      createdAt: row.createdAt,
      lastSyncedAt: row.lastSyncedAt,
      nextSyncAt: row.nextSyncAt,
      lastError: row.lastError,
    });

    return {
      provider: row.provider,
      connected: true,
      externalEmail: row.externalEmail,
      lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
      nextSyncAt: row.nextSyncAt ? row.nextSyncAt.toISOString() : null,
      lastError: row.lastError,
      stale: freshness.stale,
      status: freshness.status,
    };
  });

  const providerSummary = providerRows.reduce(
    (acc, row) => {
      if (!row.connected) {
        acc.disconnected += 1;
      } else {
        acc.totalConnected += 1;
      }
      if (row.stale) {
        acc.stale += 1;
      }
      if (row.lastError) {
        acc.errored += 1;
      }
      return acc;
    },
    { totalConnected: 0, disconnected: 0, stale: 0, errored: 0 },
  );

  const alerts: string[] = [];
  if (webhookQueue.pending > OPERATOR_HEALTH_QUEUE_DEGRADED_THRESHOLD) {
    alerts.push('webhook_backlog_high');
  }
  if (webhookQueue.failed > 0) {
    alerts.push('webhook_failures_present');
  }
  if (calendarWriteback.pending > OPERATOR_HEALTH_QUEUE_DEGRADED_THRESHOLD) {
    alerts.push('writeback_backlog_high');
  }
  if (calendarWriteback.failed > 0) {
    alerts.push('writeback_failures_present');
  }
  if (providerSummary.stale > 0) {
    alerts.push('calendar_sync_stale');
  }
  if (providerSummary.errored > 0) {
    alerts.push('calendar_provider_errors');
  }

  return {
    status: alerts.length > 0 ? 'degraded' : 'ok',
    alerts,
    webhookDeliveries: webhookSummary,
    webhookQueue,
    calendarWriteback,
    calendarProviders: {
      ...providerSummary,
      byProvider: providerRows.sort((left, right) => left.provider.localeCompare(right.provider)),
    },
    emailDeliveries: {
      ...emailSummary,
      byType: Array.from(byEmailType.values()).sort((left, right) =>
        left.emailType.localeCompare(right.emailType),
      ),
    },
  };
};
