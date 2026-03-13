import type {
  FetchLike,
  MicrosoftBusyWindow,
  MicrosoftTokenResponse,
  MicrosoftUserProfile,
} from './microsoft-shared';
import {
  DEFAULT_MICROSOFT_SCOPES,
  MICROSOFT_AUTH_URL,
  MICROSOFT_GET_SCHEDULE_URL,
  MICROSOFT_TOKEN_URL,
  MICROSOFT_USERINFO_URL,
  parseGraphDateTimeToIso,
  readErrorPayload,
  toGraphDateTime,
} from './microsoft-shared';

export const buildMicrosoftAuthorizationUrl = (input: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: string[];
}): string => {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    response_mode: 'query',
    prompt: 'select_account',
    scope: (input.scopes ?? DEFAULT_MICROSOFT_SCOPES).join(' '),
    state: input.state,
  });

  return `${MICROSOFT_AUTH_URL}?${params.toString()}`;
};

const parseTokenResponse = (parsed: Partial<MicrosoftTokenResponse>, label: string): MicrosoftTokenResponse => {
  if (typeof parsed.access_token !== 'string' || typeof parsed.expires_in !== 'number') {
    throw new Error(`${label} returned an invalid payload.`);
  }

  return {
    access_token: parsed.access_token,
    expires_in: parsed.expires_in,
    ...(typeof parsed.refresh_token === 'string' ? { refresh_token: parsed.refresh_token } : {}),
    ...(typeof parsed.scope === 'string' ? { scope: parsed.scope } : {}),
    ...(typeof parsed.token_type === 'string' ? { token_type: parsed.token_type } : {}),
  };
};

export const exchangeMicrosoftOAuthCode = async (
  input: { clientId: string; clientSecret: string; code: string; redirectUri: string },
  fetchImpl: FetchLike = fetch,
): Promise<MicrosoftTokenResponse> => {
  const response = await fetchImpl(MICROSOFT_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    throw new Error(`Microsoft token exchange failed: ${await readErrorPayload(response)}`);
  }

  return parseTokenResponse((await response.json()) as Partial<MicrosoftTokenResponse>, 'Microsoft token exchange');
};

export const refreshMicrosoftOAuthToken = async (
  input: { clientId: string; clientSecret: string; refreshToken: string },
  fetchImpl: FetchLike = fetch,
): Promise<MicrosoftTokenResponse> => {
  const response = await fetchImpl(MICROSOFT_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error(`Microsoft token refresh failed: ${await readErrorPayload(response)}`);
  }

  return parseTokenResponse((await response.json()) as Partial<MicrosoftTokenResponse>, 'Microsoft token refresh');
};

export const fetchMicrosoftUserProfile = async (
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ sub: string; email?: string }> => {
  const response = await fetchImpl(MICROSOFT_USERINFO_URL, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Microsoft user profile lookup failed: ${await readErrorPayload(response)}`);
  }

  const parsed = (await response.json()) as Partial<MicrosoftUserProfile>;
  if (typeof parsed.id !== 'string') {
    throw new Error('Microsoft user profile payload is missing id.');
  }

  const normalizedEmail =
    typeof parsed.mail === 'string' && parsed.mail.length > 0
      ? parsed.mail
      : typeof parsed.userPrincipalName === 'string'
        ? parsed.userPrincipalName
        : undefined;

  return {
    sub: parsed.id,
    ...(normalizedEmail ? { email: normalizedEmail } : {}),
  };
};

export const fetchMicrosoftBusyWindows = async (
  input: { accessToken: string; scheduleSmtp: string; startIso: string; endIso: string },
  fetchImpl: FetchLike = fetch,
): Promise<MicrosoftBusyWindow[]> => {
  const scheduleSmtp = input.scheduleSmtp.trim();
  if (!scheduleSmtp) {
    throw new Error('Microsoft schedule SMTP address is required.');
  }

  const response = await fetchImpl(MICROSOFT_GET_SCHEDULE_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      schedules: [scheduleSmtp],
      startTime: { dateTime: toGraphDateTime(input.startIso), timeZone: 'UTC' },
      endTime: { dateTime: toGraphDateTime(input.endIso), timeZone: 'UTC' },
      availabilityViewInterval: 30,
    }),
  });

  if (!response.ok) {
    throw new Error(`Microsoft free/busy lookup failed: ${await readErrorPayload(response)}`);
  }

  const parsed = (await response.json()) as {
    value?: Array<{
      scheduleItems?: Array<{
        start?: { dateTime?: string; timeZone?: string };
        end?: { dateTime?: string; timeZone?: string };
      }>;
    }>;
  };

  return (parsed.value?.[0]?.scheduleItems ?? [])
    .map((item) => {
      const rawStart = item.start?.dateTime;
      const rawEnd = item.end?.dateTime;
      if (typeof rawStart !== 'string' || typeof rawEnd !== 'string') {
        return null;
      }
      const startIso = parseGraphDateTimeToIso(rawStart, item.start?.timeZone);
      const endIso = parseGraphDateTimeToIso(rawEnd, item.end?.timeZone);
      if (!startIso || !endIso) {
        return null;
      }
      return { start: startIso, end: endIso };
    })
    .filter((window): window is MicrosoftBusyWindow => window !== null);
};
