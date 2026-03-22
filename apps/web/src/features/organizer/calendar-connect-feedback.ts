import type { CalendarConnectionStatus, CalendarProvider } from '../../lib/organizer-api';

export type RecentCalendarConnection = {
  provider: CalendarProvider;
  email: string | null;
};

const STORAGE_KEY = 'opencalendly.recent-calendar-connection';

const toProviderLabel = (provider: CalendarProvider): string => {
  return provider === 'google' ? 'Google Calendar' : 'Microsoft Calendar';
};

const safeParseFeedback = (value: string | null): RecentCalendarConnection | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<RecentCalendarConnection>;
    if (parsed.provider !== 'google' && parsed.provider !== 'microsoft') {
      return null;
    }
    return {
      provider: parsed.provider,
      email: typeof parsed.email === 'string' && parsed.email.length > 0 ? parsed.email : null,
    };
  } catch {
    return null;
  }
};

export const rememberRecentCalendarConnection = (feedback: RecentCalendarConnection): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(feedback));
};

export const consumeRecentCalendarConnection = (): RecentCalendarConnection | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const parsed = safeParseFeedback(window.sessionStorage.getItem(STORAGE_KEY));
  window.sessionStorage.removeItem(STORAGE_KEY);
  return parsed;
};

export const buildCalendarConnectSuccessMessage = (
  feedback: RecentCalendarConnection,
): string => {
  const providerLabel = toProviderLabel(feedback.provider);
  if (feedback.email) {
    return `${providerLabel} connected for ${feedback.email}. Review sync and writeback settings below.`;
  }
  return `${providerLabel} connected successfully. Review sync and writeback settings below.`;
};

export const isRecentCalendarConnection = (
  status: CalendarConnectionStatus,
  feedback: RecentCalendarConnection | null,
): boolean => {
  if (!feedback || status.provider !== feedback.provider) {
    return false;
  }

  if (!feedback.email) {
    return true;
  }

  return status.externalEmail?.trim().toLowerCase() === feedback.email.trim().toLowerCase();
};
