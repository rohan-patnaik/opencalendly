export const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
] as const;

export const getBrowserTimezone = (): string => {
  if (typeof window === 'undefined') {
    return 'UTC';
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
};

export const formatSlot = (isoDate: string, timezone: string): string => {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(isoDate));
};

export const formatDayLabel = (isoDate: string, timezone: string): string => {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: timezone,
  }).format(new Date(isoDate));
};

export const createIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

export type SlotWindow = {
  startsAt: string;
  endsAt: string;
};

export const groupSlotsByDay = (slots: SlotWindow[], timezone: string) => {
  const sortedSlots = [...slots].sort((left, right) => {
    return new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
  });
  const grouped = new Map<string, SlotWindow[]>();

  for (const slot of sortedSlots) {
    const key = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone,
    }).format(new Date(slot.startsAt));

    const existing = grouped.get(key);
    if (existing) {
      existing.push(slot);
    } else {
      grouped.set(key, [slot]);
    }
  }

  return Array.from(grouped.entries()).map(([dateKey, daySlots]) => ({
    dateKey,
    label: formatDayLabel(daySlots[0]?.startsAt ?? new Date().toISOString(), timezone),
    slots: [...daySlots].sort((left, right) => {
      return new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
    }),
  }));
};
