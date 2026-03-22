import { resolveAppBaseUrl } from '../server/env';
import type { Bindings, CalendarProvider } from '../server/types';

const CALENDAR_CALLBACK_PATHS: Record<CalendarProvider, string> = {
  google: '/settings/calendar/google/callback',
  microsoft: '/settings/calendar/microsoft/callback',
};

const stripTrailingSlash = (value: string): string => {
  return value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value;
};

const normalizeRedirectUri = (value: string): string | null => {
  try {
    const url = new URL(value);
    if (url.search || url.hash) {
      return null;
    }
    return `${url.origin}${stripTrailingSlash(url.pathname)}`;
  } catch {
    return null;
  }
};

export const buildExpectedCalendarRedirectUri = (
  env: Bindings,
  request: Request,
  provider: CalendarProvider,
): string => {
  return `${resolveAppBaseUrl(env, request)}${CALENDAR_CALLBACK_PATHS[provider]}`;
};

export const isExpectedCalendarRedirectUri = (input: {
  env: Bindings;
  request: Request;
  provider: CalendarProvider;
  redirectUri: string;
}): boolean => {
  const expected = normalizeRedirectUri(
    buildExpectedCalendarRedirectUri(input.env, input.request, input.provider),
  );
  const actual = normalizeRedirectUri(input.redirectUri);
  return expected !== null && actual !== null && expected === actual;
};
