import { DateTime } from 'luxon';

export type AnalyticsFunnelStage = 'page_view' | 'slot_selection' | 'booking_confirmed';

export const ANALYTICS_RANGE_DAYS_DEFAULT = 30;
export const ANALYTICS_RANGE_DAYS_MAX = 90;

const parseUtcDate = (rawDate: string): DateTime | null => {
  const parsed = DateTime.fromISO(rawDate, { zone: 'utc' });
  if (!parsed.isValid || parsed.toFormat('yyyy-MM-dd') !== rawDate) {
    return null;
  }
  return parsed;
};

export const resolveAnalyticsRange = (input: {
  startDate?: string | undefined;
  endDate?: string | undefined;
  now?: Date;
}): { start: Date; endExclusive: Date; startDate: string; endDate: string } => {
  const now = input.now ?? new Date();
  const todayUtc = DateTime.fromJSDate(now, { zone: 'utc' }).startOf('day');

  const endDate = input.endDate ? parseUtcDate(input.endDate) : todayUtc;
  if (!endDate) {
    throw new Error('Invalid endDate. Use YYYY-MM-DD.');
  }

  const startDate = input.startDate
    ? parseUtcDate(input.startDate)
    : endDate.minus({ days: ANALYTICS_RANGE_DAYS_DEFAULT - 1 });
  if (!startDate) {
    throw new Error('Invalid startDate. Use YYYY-MM-DD.');
  }

  if (endDate.toMillis() < startDate.toMillis()) {
    throw new Error('endDate must be on or after startDate.');
  }

  const daysInclusive = Math.floor(endDate.diff(startDate, 'days').days) + 1;
  if (daysInclusive > ANALYTICS_RANGE_DAYS_MAX) {
    throw new Error(`Analytics range cannot exceed ${ANALYTICS_RANGE_DAYS_MAX} days.`);
  }

  return {
    start: startDate.toJSDate(),
    endExclusive: endDate.plus({ days: 1 }).toJSDate(),
    startDate: startDate.toFormat('yyyy-MM-dd'),
    endDate: endDate.toFormat('yyyy-MM-dd'),
  };
};

type MetricBucket = {
  pageViews: number;
  slotSelections: number;
  bookingConfirmations: number;
  confirmed: number;
  canceled: number;
  rescheduled: number;
};

const createMetricBucket = (): MetricBucket => ({
  pageViews: 0,
  slotSelections: 0,
  bookingConfirmations: 0,
  confirmed: 0,
  canceled: 0,
  rescheduled: 0,
});

type FunnelRow = {
  stage: AnalyticsFunnelStage;
  eventTypeId: string;
  occurredAt: Date;
};

type BookingRow = {
  eventTypeId: string;
  status: string;
  createdAt: Date;
};

export const summarizeFunnelAnalytics = (input: {
  funnelRows: FunnelRow[];
  bookingRows: BookingRow[];
  eventTypeNameById: Map<string, string>;
}): {
  summary: MetricBucket & { conversionRate: number };
  byEventType: Array<MetricBucket & { eventTypeId: string; eventTypeName: string }>;
  daily: Array<MetricBucket & { date: string; eventTypeId: string; eventTypeName: string }>;
} => {
  const summary = createMetricBucket();
  const byEventType = new Map<
    string,
    MetricBucket & {
      eventTypeId: string;
      eventTypeName: string;
    }
  >();
  const byDayAndEventType = new Map<
    string,
    MetricBucket & {
      date: string;
      eventTypeId: string;
      eventTypeName: string;
    }
  >();

  const getEventBucket = (eventTypeId: string) => {
    const existing = byEventType.get(eventTypeId);
    if (existing) {
      return existing;
    }

    const created = {
      eventTypeId,
      eventTypeName: input.eventTypeNameById.get(eventTypeId) ?? 'Unknown Event',
      ...createMetricBucket(),
    };
    byEventType.set(eventTypeId, created);
    return created;
  };

  const getDayBucket = (eventTypeId: string, date: string) => {
    const key = `${date}|${eventTypeId}`;
    const existing = byDayAndEventType.get(key);
    if (existing) {
      return existing;
    }

    const created = {
      date,
      eventTypeId,
      eventTypeName: input.eventTypeNameById.get(eventTypeId) ?? 'Unknown Event',
      ...createMetricBucket(),
    };
    byDayAndEventType.set(key, created);
    return created;
  };

  for (const row of input.funnelRows) {
    const date = DateTime.fromJSDate(row.occurredAt, { zone: 'utc' }).toFormat('yyyy-MM-dd');
    const eventBucket = getEventBucket(row.eventTypeId);
    const dayBucket = getDayBucket(row.eventTypeId, date);

    if (row.stage === 'page_view') {
      summary.pageViews += 1;
      eventBucket.pageViews += 1;
      dayBucket.pageViews += 1;
    } else if (row.stage === 'slot_selection') {
      summary.slotSelections += 1;
      eventBucket.slotSelections += 1;
      dayBucket.slotSelections += 1;
    } else {
      summary.bookingConfirmations += 1;
      eventBucket.bookingConfirmations += 1;
      dayBucket.bookingConfirmations += 1;
    }
  }

  for (const row of input.bookingRows) {
    const date = DateTime.fromJSDate(row.createdAt, { zone: 'utc' }).toFormat('yyyy-MM-dd');
    const eventBucket = getEventBucket(row.eventTypeId);
    const dayBucket = getDayBucket(row.eventTypeId, date);

    if (row.status === 'confirmed') {
      summary.confirmed += 1;
      eventBucket.confirmed += 1;
      dayBucket.confirmed += 1;
    } else if (row.status === 'canceled') {
      summary.canceled += 1;
      eventBucket.canceled += 1;
      dayBucket.canceled += 1;
    } else if (row.status === 'rescheduled') {
      summary.rescheduled += 1;
      eventBucket.rescheduled += 1;
      dayBucket.rescheduled += 1;
    }
  }

  const conversionRate =
    summary.pageViews > 0 ? Number((summary.bookingConfirmations / summary.pageViews).toFixed(4)) : 0;

  return {
    summary: {
      ...summary,
      conversionRate,
    },
    byEventType: Array.from(byEventType.values()).sort((left, right) =>
      left.eventTypeName.localeCompare(right.eventTypeName),
    ),
    daily: Array.from(byDayAndEventType.values()).sort((left, right) =>
      left.date === right.date
        ? left.eventTypeName.localeCompare(right.eventTypeName)
        : left.date.localeCompare(right.date),
    ),
  };
};

type TeamEventTypeMeta = {
  teamEventTypeId: string;
  teamId: string;
  teamName: string;
  eventTypeId: string;
  eventTypeName: string;
};

type RoundRobinRow = {
  teamEventTypeId: string;
  memberUserId: string;
  memberDisplayName: string;
};

type CollectiveRow = {
  teamEventTypeId: string;
  bookingId: string;
};

export const summarizeTeamAnalytics = (input: {
  teamEventTypeRows: TeamEventTypeMeta[];
  roundRobinRows: RoundRobinRow[];
  collectiveRows: CollectiveRow[];
}): {
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
} => {
  const teamEventTypeMeta = new Map(
    input.teamEventTypeRows.map((row) => [
      row.teamEventTypeId,
      {
        teamId: row.teamId,
        teamName: row.teamName,
        eventTypeId: row.eventTypeId,
        eventTypeName: row.eventTypeName,
      },
    ]),
  );

  const roundRobinMap = new Map<
    string,
    {
      teamEventTypeId: string;
      teamId: string;
      teamName: string;
      eventTypeId: string;
      eventTypeName: string;
      memberUserId: string;
      memberDisplayName: string;
      assignments: number;
    }
  >();
  for (const row of input.roundRobinRows) {
    const meta = teamEventTypeMeta.get(row.teamEventTypeId);
    if (!meta) {
      continue;
    }

    const key = `${row.teamEventTypeId}|${row.memberUserId}`;
    const existing = roundRobinMap.get(key);
    if (existing) {
      existing.assignments += 1;
      continue;
    }

    roundRobinMap.set(key, {
      teamEventTypeId: row.teamEventTypeId,
      teamId: meta.teamId,
      teamName: meta.teamName,
      eventTypeId: meta.eventTypeId,
      eventTypeName: meta.eventTypeName,
      memberUserId: row.memberUserId,
      memberDisplayName: row.memberDisplayName,
      assignments: 1,
    });
  }

  const collectiveMap = new Map<
    string,
    {
      teamEventTypeId: string;
      teamId: string;
      teamName: string;
      eventTypeId: string;
      eventTypeName: string;
      bookings: number;
    }
  >();
  const seenCollectiveBookings = new Set<string>();
  for (const row of input.collectiveRows) {
    const bookingKey = `${row.teamEventTypeId}|${row.bookingId}`;
    if (seenCollectiveBookings.has(bookingKey)) {
      continue;
    }
    seenCollectiveBookings.add(bookingKey);

    const meta = teamEventTypeMeta.get(row.teamEventTypeId);
    if (!meta) {
      continue;
    }

    const existing = collectiveMap.get(row.teamEventTypeId);
    if (existing) {
      existing.bookings += 1;
      continue;
    }

    collectiveMap.set(row.teamEventTypeId, {
      teamEventTypeId: row.teamEventTypeId,
      teamId: meta.teamId,
      teamName: meta.teamName,
      eventTypeId: meta.eventTypeId,
      eventTypeName: meta.eventTypeName,
      bookings: 1,
    });
  }

  return {
    roundRobinAssignments: Array.from(roundRobinMap.values()).sort((left, right) =>
      left.eventTypeName === right.eventTypeName
        ? left.memberDisplayName.localeCompare(right.memberDisplayName)
        : left.eventTypeName.localeCompare(right.eventTypeName),
    ),
    collectiveBookings: Array.from(collectiveMap.values()).sort((left, right) =>
      left.eventTypeName.localeCompare(right.eventTypeName),
    ),
  };
};

export const summarizeOperatorHealth = (input: {
  webhookRows: Array<{ status: string }>;
  emailRows: Array<{ status: string; emailType: string }>;
}): {
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
    byType: Array<{ emailType: string; total: number; succeeded: number; failed: number }>;
  };
} => {
  const webhookSummary = {
    total: input.webhookRows.length,
    pending: 0,
    succeeded: 0,
    failed: 0,
  };
  for (const row of input.webhookRows) {
    if (row.status === 'pending') {
      webhookSummary.pending += 1;
    } else if (row.status === 'succeeded') {
      webhookSummary.succeeded += 1;
    } else if (row.status === 'failed') {
      webhookSummary.failed += 1;
    }
  }

  const emailSummary = {
    total: input.emailRows.length,
    succeeded: 0,
    failed: 0,
  };
  const byEmailType = new Map<string, { emailType: string; total: number; succeeded: number; failed: number }>();
  for (const row of input.emailRows) {
    if (row.status === 'succeeded') {
      emailSummary.succeeded += 1;
    } else if (row.status === 'failed') {
      emailSummary.failed += 1;
    }

    const existing = byEmailType.get(row.emailType);
    if (existing) {
      existing.total += 1;
      if (row.status === 'succeeded') {
        existing.succeeded += 1;
      } else if (row.status === 'failed') {
        existing.failed += 1;
      }
      continue;
    }

    byEmailType.set(row.emailType, {
      emailType: row.emailType,
      total: 1,
      succeeded: row.status === 'succeeded' ? 1 : 0,
      failed: row.status === 'failed' ? 1 : 0,
    });
  }

  return {
    webhookDeliveries: webhookSummary,
    emailDeliveries: {
      ...emailSummary,
      byType: Array.from(byEmailType.values()).sort((left, right) =>
        left.emailType.localeCompare(right.emailType),
      ),
    },
  };
};
