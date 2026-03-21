import type { CalendarConnectionStatus, CalendarProvider } from '../../lib/organizer-api';

const providerLabelById = {
  google: 'Google Calendar',
  microsoft: 'Microsoft Calendar',
} satisfies Record<CalendarProvider, string>;

export const toCalendarProviderLabel = (provider: CalendarProvider): string => {
  return providerLabelById[provider];
};

export const buildCalendarConnectionSummary = (
  calendarStatuses: CalendarConnectionStatus[],
): string => {
  const connected = calendarStatuses.filter((status) => status.connected);
  if (connected.length === 0) {
    return 'No calendars connected yet. Add one to block busy time and choose a writeback target.';
  }

  const labels = connected.map((status) =>
    status.provider === 'google' ? 'Google Calendar' : 'Microsoft Calendar',
  );

  if (labels.length === 1) {
    return `1 calendar connected: ${labels[0]}.`;
  }

  return `${labels.length} calendars connected: ${labels.join(', ')}.`;
};

export const buildCalendarConnectAvailabilityMessage = (
  availableProviders: CalendarProvider[],
): string | null => {
  if (availableProviders.length === 0) {
    return 'Calendar OAuth is not configured in this environment yet.';
  }

  if (availableProviders.length === Object.keys(providerLabelById).length) {
    return null;
  }

  const unavailableProviders = (Object.keys(providerLabelById) as CalendarProvider[])
    .filter((provider) => !availableProviders.includes(provider))
    .map(toCalendarProviderLabel);

  return `Unavailable here: ${unavailableProviders.join(', ')}.`;
};
