import { DateTime } from 'luxon';

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
