import { DateTime } from 'luxon';
import type { AnalyticsFunnelStage } from '@opencalendly/shared';
export type { AnalyticsFunnelStage } from '@opencalendly/shared';

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
  occurredAt?: Date;
  date?: string;
  count?: number;
};

type BookingRow = {
  eventTypeId: string;
  status: string;
  createdAt?: Date;
  date?: string;
  count?: number;
};

const resolveBucketDate = (input: {
  date: string | undefined;
  occurredAt: Date | undefined;
  createdAt: Date | undefined;
}): string => {
  if (input.date) {
    return input.date;
  }
  const referenceDate = input.occurredAt ?? input.createdAt;
  if (!referenceDate) {
    throw new Error('Analytics row missing date bucket.');
  }
  return DateTime.fromJSDate(referenceDate, { zone: 'utc' }).toFormat('yyyy-MM-dd');
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
    const date = resolveBucketDate({
      date: row.date,
      occurredAt: row.occurredAt,
      createdAt: undefined,
    });
    const count = row.count ?? 1;
    const eventBucket = getEventBucket(row.eventTypeId);
    const dayBucket = getDayBucket(row.eventTypeId, date);

    if (row.stage === 'page_view') {
      summary.pageViews += count;
      eventBucket.pageViews += count;
      dayBucket.pageViews += count;
    } else if (row.stage === 'slot_selection') {
      summary.slotSelections += count;
      eventBucket.slotSelections += count;
      dayBucket.slotSelections += count;
    } else {
      summary.bookingConfirmations += count;
      eventBucket.bookingConfirmations += count;
      dayBucket.bookingConfirmations += count;
    }
  }

  for (const row of input.bookingRows) {
    const date = resolveBucketDate({
      date: row.date,
      occurredAt: undefined,
      createdAt: row.createdAt,
    });
    const count = row.count ?? 1;
    const eventBucket = getEventBucket(row.eventTypeId);
    const dayBucket = getDayBucket(row.eventTypeId, date);

    if (row.status === 'confirmed') {
      summary.confirmed += count;
      eventBucket.confirmed += count;
      dayBucket.confirmed += count;
    } else if (row.status === 'canceled') {
      summary.canceled += count;
      eventBucket.canceled += count;
      dayBucket.canceled += count;
    } else if (row.status === 'rescheduled') {
      summary.rescheduled += count;
      eventBucket.rescheduled += count;
      dayBucket.rescheduled += count;
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
  webhookRows: Array<{ status: string; count?: number }>;
  emailRows: Array<{ status: string; emailType: string; count?: number }>;
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
    total: 0,
    pending: 0,
    succeeded: 0,
    failed: 0,
  };
  for (const row of input.webhookRows) {
    const count = row.count ?? 1;
    webhookSummary.total += count;
    if (row.status === 'pending') {
      webhookSummary.pending += count;
    } else if (row.status === 'succeeded') {
      webhookSummary.succeeded += count;
    } else {
      webhookSummary.failed += count;
    }
  }

  const emailSummary = {
    total: 0,
    succeeded: 0,
    failed: 0,
  };
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
