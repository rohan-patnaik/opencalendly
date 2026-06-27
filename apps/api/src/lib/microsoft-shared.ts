import { DateTime } from 'luxon';

export const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
export const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
export const MICROSOFT_USERINFO_URL =
  'https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName';
export const MICROSOFT_GET_SCHEDULE_URL = 'https://graph.microsoft.com/v1.0/me/calendar/getSchedule';
export const MICROSOFT_EVENTS_URL = 'https://graph.microsoft.com/v1.0/me/events';
export const DEFAULT_MICROSOFT_SCOPES = [
  'openid',
  'email',
  'offline_access',
  'User.Read',
  'Calendars.ReadWrite',
];

export const REQUIRED_MICROSOFT_CALENDAR_SCOPES = [
  'User.Read',
  'Calendars.ReadWrite',
] as const;

export type FetchLike = typeof fetch;

export type MicrosoftTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export type MicrosoftUserProfile = {
  id: string;
  mail?: string;
  userPrincipalName?: string;
};

export type MicrosoftBusyWindow = {
  start: string;
  end: string;
};

const normalizeMicrosoftScope = (scope: string): string => {
  const trimmed = scope.trim().toLowerCase();
  return trimmed.includes('/') ? trimmed.slice(trimmed.lastIndexOf('/') + 1) : trimmed;
};

export const hasRequiredMicrosoftCalendarScopes = (scope: string | undefined): boolean => {
  if (!scope) {
    return false;
  }

  const grantedScopes = new Set(
    scope
      .split(/\s+/)
      .filter((value) => value.length > 0)
      .map(normalizeMicrosoftScope),
  );

  return REQUIRED_MICROSOFT_CALENDAR_SCOPES.every((requiredScope) =>
    grantedScopes.has(normalizeMicrosoftScope(requiredScope)),
  );
};

export const readErrorPayload = async (response: Response): Promise<string> => {
  const payload = await response.text();
  return payload.slice(0, 1000);
};

export const toGraphDateTime = (isoValue: string): string => {
  const parsed = DateTime.fromISO(isoValue, { zone: 'utc' });
  if (!parsed.isValid) {
    throw new Error('Invalid ISO datetime for Microsoft event payload.');
  }
  return parsed.toFormat("yyyy-MM-dd'T'HH:mm:ss");
};

export const parseGraphDateTimeToIso = (dateTime: string, timezone?: string): string | null => {
  const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/.test(dateTime);
  const parsed = hasOffset
    ? DateTime.fromISO(dateTime, { setZone: true })
    : DateTime.fromISO(dateTime, { zone: timezone || 'UTC' });
  if (!parsed.isValid) {
    return null;
  }
  return parsed.toUTC().toISO();
};
