import { DateTime } from 'luxon';

export type EventTypeBookingCaps = {
  dailyBookingLimit: number | null;
  weeklyBookingLimit: number | null;
  monthlyBookingLimit: number | null;
};

export type BookingCapPeriod = 'daily' | 'weekly' | 'monthly';

export type BookingCapWindow = {
  period: BookingCapPeriod;
  limit: number;
  startsAt: Date;
  endsAt: Date;
};

export type BookingCapUsage = {
  daily: Map<string, number>;
  weekly: Map<string, number>;
  monthly: Map<string, number>;
};

const toNonNegativeInt = (value: number | null | undefined): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const parsed = Math.trunc(value);
  return parsed > 0 ? parsed : null;
};

export const normalizeBookingCaps = (caps: EventTypeBookingCaps): EventTypeBookingCaps => {
  return {
    dailyBookingLimit: toNonNegativeInt(caps.dailyBookingLimit),
    weeklyBookingLimit: toNonNegativeInt(caps.weeklyBookingLimit),
    monthlyBookingLimit: toNonNegativeInt(caps.monthlyBookingLimit),
  };
};

export const hasBookingCaps = (caps: EventTypeBookingCaps): boolean => {
  const normalized = normalizeBookingCaps(caps);
  return Boolean(
    normalized.dailyBookingLimit ||
      normalized.weeklyBookingLimit ||
      normalized.monthlyBookingLimit,
  );
};

const toDayKey = (value: DateTime): string => value.toFormat('yyyy-MM-dd');
const toWeekKey = (value: DateTime): string =>
  `${value.weekYear}-W${String(value.weekNumber).padStart(2, '0')}`;
const toMonthKey = (value: DateTime): string => value.toFormat('yyyy-MM');

export const buildBookingCapUsage = (
  bookings: Array<{ startsAt: Date }>,
  timezone: string,
): BookingCapUsage => {
  const usage: BookingCapUsage = {
    daily: new Map<string, number>(),
    weekly: new Map<string, number>(),
    monthly: new Map<string, number>(),
  };

  for (const booking of bookings) {
    const local = DateTime.fromJSDate(booking.startsAt, { zone: 'utc' }).setZone(timezone);
    if (!local.isValid) {
      continue;
    }

    const dayKey = toDayKey(local);
    const weekKey = toWeekKey(local);
    const monthKey = toMonthKey(local);

    usage.daily.set(dayKey, (usage.daily.get(dayKey) ?? 0) + 1);
    usage.weekly.set(weekKey, (usage.weekly.get(weekKey) ?? 0) + 1);
    usage.monthly.set(monthKey, (usage.monthly.get(monthKey) ?? 0) + 1);
  }

  return usage;
};

export const isSlotAllowedByBookingCaps = (input: {
  startsAtIso: string;
  timezone: string;
  caps: EventTypeBookingCaps;
  usage: BookingCapUsage;
  incrementBy?: number;
}): boolean => {
  const normalizedCaps = normalizeBookingCaps(input.caps);
  if (!hasBookingCaps(normalizedCaps)) {
    return true;
  }

  const local = DateTime.fromISO(input.startsAtIso, { zone: 'utc' }).setZone(input.timezone);
  if (!local.isValid) {
    return false;
  }

  const incrementBy = Math.max(1, Math.trunc(input.incrementBy ?? 1));

  if (normalizedCaps.dailyBookingLimit) {
    const used = input.usage.daily.get(toDayKey(local)) ?? 0;
    if (used + incrementBy > normalizedCaps.dailyBookingLimit) {
      return false;
    }
  }

  if (normalizedCaps.weeklyBookingLimit) {
    const used = input.usage.weekly.get(toWeekKey(local)) ?? 0;
    if (used + incrementBy > normalizedCaps.weeklyBookingLimit) {
      return false;
    }
  }

  if (normalizedCaps.monthlyBookingLimit) {
    const used = input.usage.monthly.get(toMonthKey(local)) ?? 0;
    if (used + incrementBy > normalizedCaps.monthlyBookingLimit) {
      return false;
    }
  }

  return true;
};

export const filterSlotsByBookingCaps = <T extends { startsAt: string }>(input: {
  slots: T[];
  timezone: string;
  caps: EventTypeBookingCaps;
  usage: BookingCapUsage;
}): T[] => {
  if (!hasBookingCaps(input.caps)) {
    return input.slots;
  }

  return input.slots.filter((slot) =>
    isSlotAllowedByBookingCaps({
      startsAtIso: slot.startsAt,
      timezone: input.timezone,
      caps: input.caps,
      usage: input.usage,
    }),
  );
};

export const buildBookingCapWindowsForSlot = (input: {
  startsAtIso: string;
  timezone: string;
  caps: EventTypeBookingCaps;
}): BookingCapWindow[] => {
  const normalizedCaps = normalizeBookingCaps(input.caps);
  const local = DateTime.fromISO(input.startsAtIso, { zone: 'utc' }).setZone(input.timezone);
  if (!local.isValid || !hasBookingCaps(normalizedCaps)) {
    return [];
  }

  const windows: BookingCapWindow[] = [];

  if (normalizedCaps.dailyBookingLimit) {
    const startsAt = local.startOf('day');
    windows.push({
      period: 'daily',
      limit: normalizedCaps.dailyBookingLimit,
      startsAt: startsAt.toUTC().toJSDate(),
      endsAt: startsAt.plus({ days: 1 }).toUTC().toJSDate(),
    });
  }

  if (normalizedCaps.weeklyBookingLimit) {
    const startsAt = local.startOf('week');
    windows.push({
      period: 'weekly',
      limit: normalizedCaps.weeklyBookingLimit,
      startsAt: startsAt.toUTC().toJSDate(),
      endsAt: startsAt.plus({ weeks: 1 }).toUTC().toJSDate(),
    });
  }

  if (normalizedCaps.monthlyBookingLimit) {
    const startsAt = local.startOf('month');
    windows.push({
      period: 'monthly',
      limit: normalizedCaps.monthlyBookingLimit,
      startsAt: startsAt.toUTC().toJSDate(),
      endsAt: startsAt.plus({ months: 1 }).toUTC().toJSDate(),
    });
  }

  return windows;
};

export const resolveBookingCapUsageRange = (input: {
  rangeStartIso: string;
  days: number;
  timezone: string;
  caps: EventTypeBookingCaps;
}): { startsAt: Date; endsAt: Date } | null => {
  const normalizedCaps = normalizeBookingCaps(input.caps);
  if (!hasBookingCaps(normalizedCaps)) {
    return null;
  }

  const rangeStartUtc = DateTime.fromISO(input.rangeStartIso, { zone: 'utc' });
  if (!rangeStartUtc.isValid) {
    return null;
  }

  const normalizedDays = Math.max(1, Math.min(30, Math.trunc(input.days)));
  const localStart = rangeStartUtc.setZone(input.timezone);
  const localEndExclusive = rangeStartUtc.plus({ days: normalizedDays }).setZone(input.timezone);

  const startsAtCandidates: DateTime[] = [];
  const endsAtCandidates: DateTime[] = [];

  if (normalizedCaps.dailyBookingLimit) {
    startsAtCandidates.push(localStart.startOf('day'));
    endsAtCandidates.push(localEndExclusive.startOf('day').plus({ days: 1 }));
  }

  if (normalizedCaps.weeklyBookingLimit) {
    startsAtCandidates.push(localStart.startOf('week'));
    endsAtCandidates.push(localEndExclusive.startOf('week').plus({ weeks: 1 }));
  }

  if (normalizedCaps.monthlyBookingLimit) {
    startsAtCandidates.push(localStart.startOf('month'));
    endsAtCandidates.push(localEndExclusive.startOf('month').plus({ months: 1 }));
  }

  if (startsAtCandidates.length === 0 || endsAtCandidates.length === 0) {
    return null;
  }

  const startsAt = startsAtCandidates.reduce((earliest, current) =>
    current.toMillis() < earliest.toMillis() ? current : earliest,
  );
  const endsAt = endsAtCandidates.reduce((latest, current) =>
    current.toMillis() > latest.toMillis() ? current : latest,
  );

  return {
    startsAt: startsAt.toUTC().toJSDate(),
    endsAt: endsAt.toUTC().toJSDate(),
  };
};
