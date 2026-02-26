const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_FREE_BUSY_URL = 'https://www.googleapis.com/calendar/v3/freeBusy';

const DEFAULT_GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.readonly',
];

type FetchLike = typeof fetch;

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type GoogleUserProfile = {
  sub: string;
  email?: string;
};

type GoogleBusyWindow = {
  start: string;
  end: string;
};

const readErrorPayload = async (response: Response): Promise<string> => {
  const payload = await response.text();
  return payload.slice(0, 1000);
};

export const buildGoogleAuthorizationUrl = (input: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: string[];
}): string => {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    scope: (input.scopes ?? DEFAULT_GOOGLE_SCOPES).join(' '),
    state: input.state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
};

export const exchangeGoogleOAuthCode = async (
  input: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<GoogleTokenResponse> => {
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${await readErrorPayload(response)}`);
  }

  const parsed = (await response.json()) as Partial<GoogleTokenResponse>;
  if (
    typeof parsed.access_token !== 'string' ||
    typeof parsed.expires_in !== 'number'
  ) {
    throw new Error('Google token exchange returned an invalid payload.');
  }

  return {
    access_token: parsed.access_token,
    expires_in: parsed.expires_in,
    ...(typeof parsed.refresh_token === 'string'
      ? { refresh_token: parsed.refresh_token }
      : {}),
    ...(typeof parsed.scope === 'string' ? { scope: parsed.scope } : {}),
    ...(typeof parsed.token_type === 'string' ? { token_type: parsed.token_type } : {}),
  };
};

export const refreshGoogleOAuthToken = async (
  input: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<GoogleTokenResponse> => {
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${await readErrorPayload(response)}`);
  }

  const parsed = (await response.json()) as Partial<GoogleTokenResponse>;
  if (
    typeof parsed.access_token !== 'string' ||
    typeof parsed.expires_in !== 'number'
  ) {
    throw new Error('Google token refresh returned an invalid payload.');
  }

  return {
    access_token: parsed.access_token,
    expires_in: parsed.expires_in,
    ...(typeof parsed.refresh_token === 'string'
      ? { refresh_token: parsed.refresh_token }
      : {}),
    ...(typeof parsed.scope === 'string' ? { scope: parsed.scope } : {}),
    ...(typeof parsed.token_type === 'string' ? { token_type: parsed.token_type } : {}),
  };
};

export const fetchGoogleUserProfile = async (
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<GoogleUserProfile> => {
  const response = await fetchImpl(GOOGLE_USERINFO_URL, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Google user profile lookup failed: ${await readErrorPayload(response)}`);
  }

  const parsed = (await response.json()) as Partial<GoogleUserProfile>;
  if (typeof parsed.sub !== 'string') {
    throw new Error('Google user profile payload is missing sub.');
  }

  return {
    sub: parsed.sub,
    ...(typeof parsed.email === 'string' ? { email: parsed.email } : {}),
  };
};

export const fetchGoogleBusyWindows = async (
  input: {
    accessToken: string;
    startIso: string;
    endIso: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<GoogleBusyWindow[]> => {
  const response = await fetchImpl(GOOGLE_FREE_BUSY_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: input.startIso,
      timeMax: input.endIso,
      items: [{ id: 'primary' }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Google free/busy lookup failed: ${await readErrorPayload(response)}`);
  }

  const parsed = (await response.json()) as {
    calendars?: Record<string, { busy?: Array<{ start?: string; end?: string }> }>;
  };
  const busy = parsed.calendars?.primary?.busy ?? [];

  return busy
    .filter(
      (window): window is { start: string; end: string } =>
        typeof window.start === 'string' && typeof window.end === 'string',
    )
    .map((window) => ({
      start: window.start,
      end: window.end,
    }));
};
