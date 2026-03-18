import { DateTime } from 'luxon';
import type { AnalyticsFunnelStage } from '@opencalendly/shared';

export type { AnalyticsFunnelStage } from '@opencalendly/shared';

type MetricBucket = {
  pageViews: number;
  slotSelections: number;
  bookingConfirmations: number;
  confirmed: number;
  canceled: number;
  rescheduled: number;
};

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

const createMetricBucket = (): MetricBucket => ({
  pageViews: 0,
  slotSelections: 0,
  bookingConfirmations: 0,
  confirmed: 0,
  canceled: 0,
  rescheduled: 0,
});

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
}) => {
  const summary = createMetricBucket();
  const byEventType = new Map<
    string,
    MetricBucket & { eventTypeId: string; eventTypeName: string }
  >();
  const byDayAndEventType = new Map<
    string,
    MetricBucket & { date: string; eventTypeId: string; eventTypeName: string }
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
    const date = resolveBucketDate({ date: row.date, occurredAt: row.occurredAt, createdAt: undefined });
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
    const date = resolveBucketDate({ date: row.date, occurredAt: undefined, createdAt: row.createdAt });
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
    summary: { ...summary, conversionRate },
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

export const summarizeTeamAnalytics = (input: {
  teamEventTypeRows: TeamEventTypeMeta[];
  roundRobinRows: RoundRobinRow[];
  collectiveRows: CollectiveRow[];
}) => {
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
