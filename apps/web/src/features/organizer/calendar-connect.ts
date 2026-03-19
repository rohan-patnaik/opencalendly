import type { CalendarConnectionStatus } from '../../lib/organizer-api';

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
