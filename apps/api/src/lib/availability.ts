import { DateTime } from 'luxon';

export type WeeklyAvailabilityRule = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
};

export type AvailabilityOverrideWindow = {
  startAt: Date;
  endAt: Date;
  isAvailable: boolean;
};

export type ExistingBooking = {
  startsAt: Date;
  endsAt: Date;
  status: string;
  metadata?: string | null;
};

export type AvailabilitySlot = {
  startsAt: string;
  endsAt: string;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
};

export type ComputeAvailabilityInput = {
  organizerTimezone: string;
  rangeStartIso: string;
  days: number;
  durationMinutes: number;
  rules: WeeklyAvailabilityRule[];
  overrides: AvailabilityOverrideWindow[];
  bookings: ExistingBooking[];
  slotIncrementMinutes?: number;
};

const DEFAULT_SLOT_INCREMENT_MINUTES = 15;

const overlaps = (aStartMs: number, aEndMs: number, bStartMs: number, bEndMs: number): boolean => {
  return aStartMs < bEndMs && bStartMs < aEndMs;
};

const toDayOfWeek = (value: DateTime): number => {
  return value.weekday % 7;
};

const normalizeZone = (timezone: string): string => {
  const probe = DateTime.now().setZone(timezone);
  return probe.isValid ? timezone : 'UTC';
};

const toIntervalMs = (value: { startAt: Date; endAt: Date }): { startMs: number; endMs: number } => {
  return {
    startMs: value.startAt.getTime(),
    endMs: value.endAt.getTime(),
  };
};

const buildMaxBuffer = (rules: WeeklyAvailabilityRule[]): { before: number; after: number } => {
  let before = 0;
  let after = 0;

  for (const rule of rules) {
    if (rule.bufferBeforeMinutes > before) {
      before = rule.bufferBeforeMinutes;
    }
    if (rule.bufferAfterMinutes > after) {
      after = rule.bufferAfterMinutes;
    }
  }

  return { before, after };
};

const hasBlockingOverride = (
  startsAtMs: number,
  endsAtMs: number,
  blockingOverrides: Array<{ startMs: number; endMs: number }>,
): boolean => {
  return blockingOverrides.some((overrideInterval) =>
    overlaps(startsAtMs, endsAtMs, overrideInterval.startMs, overrideInterval.endMs),
  );
};

const hasBookingConflict = (
  startsAtMs: number,
  endsAtMs: number,
  bufferBeforeMinutes: number,
  bufferAfterMinutes: number,
  confirmedBookings: ExistingBooking[],
): boolean => {
  const bufferedStartMs = startsAtMs - bufferBeforeMinutes * 60_000;
  const bufferedEndMs = endsAtMs + bufferAfterMinutes * 60_000;

  const readBookingBuffers = (
    metadata: ExistingBooking['metadata'],
  ): { beforeMinutes: number; afterMinutes: number } => {
    if (!metadata) {
      return { beforeMinutes: 0, afterMinutes: 0 };
    }

    try {
      const parsed = JSON.parse(metadata) as {
        bufferBeforeMinutes?: unknown;
        bufferAfterMinutes?: unknown;
      };
      const beforeMinutes =
        typeof parsed.bufferBeforeMinutes === 'number' && parsed.bufferBeforeMinutes >= 0
          ? parsed.bufferBeforeMinutes
          : 0;
      const afterMinutes =
        typeof parsed.bufferAfterMinutes === 'number' && parsed.bufferAfterMinutes >= 0
          ? parsed.bufferAfterMinutes
          : 0;

      return { beforeMinutes, afterMinutes };
    } catch {
      return { beforeMinutes: 0, afterMinutes: 0 };
    }
  };

  return confirmedBookings.some((booking) => {
    const existingBuffers = readBookingBuffers(booking.metadata);
    const existingStartMs = booking.startsAt.getTime() - existingBuffers.beforeMinutes * 60_000;
    const existingEndMs = booking.endsAt.getTime() + existingBuffers.afterMinutes * 60_000;

    return overlaps(
      bufferedStartMs,
      bufferedEndMs,
      existingStartMs,
      existingEndMs,
    );
  });
};

const addSlotIfOpen = (
  slots: Map<string, AvailabilitySlot>,
  startsAt: DateTime,
  endsAt: DateTime,
  bufferBeforeMinutes: number,
  bufferAfterMinutes: number,
  blockingOverrides: Array<{ startMs: number; endMs: number }>,
  confirmedBookings: ExistingBooking[],
): void => {
  const startsAtMs = startsAt.toMillis();
  const endsAtMs = endsAt.toMillis();

  if (hasBlockingOverride(startsAtMs, endsAtMs, blockingOverrides)) {
    return;
  }

  if (
    hasBookingConflict(
      startsAtMs,
      endsAtMs,
      bufferBeforeMinutes,
      bufferAfterMinutes,
      confirmedBookings,
    )
  ) {
    return;
  }

  const startsAtIso = startsAt.toUTC().toISO();
  const endsAtIso = endsAt.toUTC().toISO();

  if (!startsAtIso || !endsAtIso) {
    return;
  }

  const key = `${startsAtIso}|${endsAtIso}`;

  if (!slots.has(key)) {
    slots.set(key, {
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      bufferBeforeMinutes,
      bufferAfterMinutes,
    });
  }
};

export const computeAvailabilitySlots = (input: ComputeAvailabilityInput): AvailabilitySlot[] => {
  const organizerTimezone = normalizeZone(input.organizerTimezone);
  const rangeStart = DateTime.fromISO(input.rangeStartIso, { zone: 'utc' });

  if (!rangeStart.isValid) {
    return [];
  }

  const days = Math.max(1, Math.min(30, Math.trunc(input.days)));
  const slotIncrementMinutes = Math.max(
    5,
    Math.min(60, Math.trunc(input.slotIncrementMinutes ?? DEFAULT_SLOT_INCREMENT_MINUTES)),
  );
  const rangeEnd = rangeStart.plus({ days });
  const confirmedBookings = input.bookings.filter((booking) => booking.status === 'confirmed');

  const blockingOverrides = input.overrides
    .filter((override) => !override.isAvailable)
    .map((override) => toIntervalMs(override));

  const availableOverrides = input.overrides
    .filter((override) => override.isAvailable)
    .map((override) => toIntervalMs(override));

  const rulesByDay = new Map<number, WeeklyAvailabilityRule[]>();
  for (const rule of input.rules) {
    const entries = rulesByDay.get(rule.dayOfWeek) ?? [];
    entries.push(rule);
    rulesByDay.set(rule.dayOfWeek, entries);
  }

  const maxBuffer = buildMaxBuffer(input.rules);
  const slots = new Map<string, AvailabilitySlot>();

  let dayCursor = rangeStart.setZone(organizerTimezone).startOf('day');
  const endCursor = rangeEnd.setZone(organizerTimezone).endOf('day');

  while (dayCursor.toMillis() <= endCursor.toMillis()) {
    const dayRules = rulesByDay.get(toDayOfWeek(dayCursor)) ?? [];

    for (const rule of dayRules) {
      const windowStart = dayCursor.plus({ minutes: rule.startMinute });
      const windowEnd = dayCursor.plus({ minutes: rule.endMinute });
      const latestStart = windowEnd.minus({ minutes: input.durationMinutes });

      if (latestStart.toMillis() < windowStart.toMillis()) {
        continue;
      }

      for (
        let slotStart = windowStart;
        slotStart.toMillis() <= latestStart.toMillis();
        slotStart = slotStart.plus({ minutes: slotIncrementMinutes })
      ) {
        const slotEnd = slotStart.plus({ minutes: input.durationMinutes });
        const slotStartUtc = slotStart.toUTC();
        const slotEndUtc = slotEnd.toUTC();

        if (
          slotStartUtc.toMillis() < rangeStart.toMillis() ||
          slotEndUtc.toMillis() > rangeEnd.toMillis()
        ) {
          continue;
        }

        addSlotIfOpen(
          slots,
          slotStartUtc,
          slotEndUtc,
          rule.bufferBeforeMinutes,
          rule.bufferAfterMinutes,
          blockingOverrides,
          confirmedBookings,
        );
      }
    }

    dayCursor = dayCursor.plus({ days: 1 });
  }

  for (const overrideInterval of availableOverrides) {
    const overrideStart = DateTime.fromMillis(overrideInterval.startMs, { zone: 'utc' });
    const overrideEnd = DateTime.fromMillis(overrideInterval.endMs, { zone: 'utc' });
    const latestStart = overrideEnd.minus({ minutes: input.durationMinutes });

    if (latestStart.toMillis() < overrideStart.toMillis()) {
      continue;
    }

    for (
      let slotStart = overrideStart;
      slotStart.toMillis() <= latestStart.toMillis();
      slotStart = slotStart.plus({ minutes: slotIncrementMinutes })
    ) {
      const slotEnd = slotStart.plus({ minutes: input.durationMinutes });

      if (
        slotStart.toMillis() < rangeStart.toMillis() ||
        slotEnd.toMillis() > rangeEnd.toMillis()
      ) {
        continue;
      }

      addSlotIfOpen(
        slots,
        slotStart,
        slotEnd,
        maxBuffer.before,
        maxBuffer.after,
        blockingOverrides,
        confirmedBookings,
      );
    }
  }

  return Array.from(slots.values()).sort((left, right) => {
    return left.startsAt.localeCompare(right.startsAt);
  });
};
