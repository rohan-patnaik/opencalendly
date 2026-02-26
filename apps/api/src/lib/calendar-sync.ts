import { DateTime } from 'luxon';

import { decryptSecret } from './calendar-crypto';
import { fetchGoogleBusyWindows, refreshGoogleOAuthToken } from './google-calendar';

type FetchLike = typeof fetch;

export type GoogleConnectionSecretState = {
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  accessTokenExpiresAt: Date;
};

export type GoogleTokenResolution = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshed: boolean;
};

const REFRESH_SKEW_SECONDS = 60;

export const resolveGoogleSyncRange = (
  now: Date,
  requestedStartIso?: string,
  requestedEndIso?: string,
): { startIso: string; endIso: string } => {
  const defaultStart = DateTime.fromJSDate(now, { zone: 'utc' });
  const defaultEnd = defaultStart.plus({ days: 30 });

  const start = requestedStartIso
    ? DateTime.fromISO(requestedStartIso, { zone: 'utc' })
    : defaultStart;
  const end = requestedEndIso
    ? DateTime.fromISO(requestedEndIso, { zone: 'utc' })
    : defaultEnd;

  if (!start.isValid || !end.isValid) {
    throw new Error('Sync range start/end is invalid.');
  }

  if (end.toMillis() <= start.toMillis()) {
    throw new Error('Sync range end must be after start.');
  }

  const maxRangeDays = 90;
  if (end.diff(start, 'days').days > maxRangeDays) {
    throw new Error(`Sync range cannot exceed ${maxRangeDays} days.`);
  }

  const startIso = start.toUTC().toISO();
  const endIso = end.toUTC().toISO();
  if (!startIso || !endIso) {
    throw new Error('Failed to normalize sync range.');
  }

  return { startIso, endIso };
};

export const resolveGoogleAccessToken = async (
  input: {
    connection: GoogleConnectionSecretState;
    encryptionSecret: string;
    clientId: string;
    clientSecret: string;
    now: Date;
  },
  fetchImpl: FetchLike = fetch,
): Promise<GoogleTokenResolution> => {
  const accessToken = decryptSecret(input.connection.accessTokenEncrypted, input.encryptionSecret);
  const refreshToken = decryptSecret(input.connection.refreshTokenEncrypted, input.encryptionSecret);

  const shouldRefresh =
    input.connection.accessTokenExpiresAt.getTime() <=
    input.now.getTime() + REFRESH_SKEW_SECONDS * 1000;

  if (!shouldRefresh) {
    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: input.connection.accessTokenExpiresAt,
      refreshed: false,
    };
  }

  const refreshed = await refreshGoogleOAuthToken(
    {
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      refreshToken,
    },
    fetchImpl,
  );

  return {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? refreshToken,
    accessTokenExpiresAt: new Date(input.now.getTime() + refreshed.expires_in * 1000),
    refreshed: true,
  };
};

export const syncGoogleBusyWindows = async (
  input: {
    accessToken: string;
    startIso: string;
    endIso: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<Array<{ startsAt: Date; endsAt: Date }>> => {
  const windows = await fetchGoogleBusyWindows(
    {
      accessToken: input.accessToken,
      startIso: input.startIso,
      endIso: input.endIso,
    },
    fetchImpl,
  );

  return windows
    .map((window) => ({
      startsAt: DateTime.fromISO(window.start, { zone: 'utc' }),
      endsAt: DateTime.fromISO(window.end, { zone: 'utc' }),
    }))
    .filter((window) => window.startsAt.isValid && window.endsAt.isValid)
    .filter((window) => window.endsAt.toMillis() > window.startsAt.toMillis())
    .map((window) => ({
      startsAt: window.startsAt.toJSDate(),
      endsAt: window.endsAt.toJSDate(),
    }));
};
