import type { OrganizerEventType } from '../../lib/organizer-api';

export const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const organizerSections = [
  { id: 'event-types', label: 'Event types' },
  { id: 'availability', label: 'Availability' },
  { id: 'time-off', label: 'Time off + holidays' },
  { id: 'teams', label: 'Teams' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'calendars', label: 'Calendars' },
  { id: 'profile', label: 'Profile' },
  { id: 'writeback', label: 'Writeback queue' },
] as const;

export type OrganizerSectionId = (typeof organizerSections)[number]['id'];

export const toClockTime = (minuteOfDay: number): string => {
  const clamped = Math.max(0, Math.min(1439, minuteOfDay));
  const hour24 = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
};

export const toNullableString = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const parseIntegerOrUndefined = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

export type AvailabilityRuleInput = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
};

export const isAvailabilityRuleInput = (value: unknown): value is AvailabilityRuleInput => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.dayOfWeek === 'number' &&
    typeof value.startMinute === 'number' &&
    typeof value.endMinute === 'number' &&
    typeof value.bufferBeforeMinutes === 'number' &&
    typeof value.bufferAfterMinutes === 'number'
  );
};

export type AvailabilityOverrideInput = {
  startAt: string;
  endAt: string;
  isAvailable: boolean;
  reason?: string | null;
};

export const isAvailabilityOverrideInput = (value: unknown): value is AvailabilityOverrideInput => {
  if (!isRecord(value)) {
    return false;
  }

  const reason = value.reason;
  return (
    typeof value.startAt === 'string' &&
    typeof value.endAt === 'string' &&
    typeof value.isAvailable === 'boolean' &&
    (typeof reason === 'undefined' || typeof reason === 'string' || reason === null)
  );
};

export type NotificationRuleInput = {
  notificationType: 'reminder' | 'follow_up';
  offsetMinutes: number;
  isEnabled?: boolean;
};

export const isNotificationRuleInput = (value: unknown): value is NotificationRuleInput => {
  if (!isRecord(value)) {
    return false;
  }

  const notificationType = value.notificationType;
  const offsetMinutes = value.offsetMinutes;
  const isEnabled = value.isEnabled;

  return (
    (notificationType === 'reminder' || notificationType === 'follow_up') &&
    typeof offsetMinutes === 'number' &&
    Number.isInteger(offsetMinutes) &&
    offsetMinutes > 0 &&
    offsetMinutes <= 10080 &&
    (typeof isEnabled === 'undefined' || typeof isEnabled === 'boolean')
  );
};

export const parseJsonArray = <T,>(
  raw: string,
  label: string,
  isValidItem: (value: unknown) => value is T,
): T[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array.`);
  }

  for (let index = 0; index < parsed.length; index += 1) {
    if (!isValidItem(parsed[index])) {
      throw new Error(`${label} contains invalid item at index ${index}.`);
    }
  }

  return parsed;
};

export const formatDateTime = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Invalid date';
  }
  return parsed.toLocaleString();
};

export const buildDefaultEventTypeForm = () => ({
  name: '',
  slug: '',
  durationMinutes: '30',
  locationType: 'video' as OrganizerEventType['locationType'],
  locationValue: '',
  isActive: true,
});
