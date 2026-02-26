import { DateTime } from 'luxon';

const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MICROSOFT_USERINFO_URL = 'https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName';
const MICROSOFT_GET_SCHEDULE_URL = 'https://graph.microsoft.com/v1.0/me/calendar/getSchedule';
const MICROSOFT_EVENTS_URL = 'https://graph.microsoft.com/v1.0/me/events';

const DEFAULT_MICROSOFT_SCOPES = [
  'openid',
  'email',
  'offline_access',
  'User.Read',
  'Calendars.Read',
  'Calendars.ReadWrite',
];

type FetchLike = typeof fetch;

type MicrosoftTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type MicrosoftUserProfile = {
  id: string;
  mail?: string;
  userPrincipalName?: string;
};

type MicrosoftBusyWindow = {
  start: string;
  end: string;
};

const readErrorPayload = async (response: Response): Promise<string> => {
  const payload = await response.text();
  return payload.slice(0, 1000);
};

const toGraphDateTime = (isoValue: string): string => {
  const parsed = DateTime.fromISO(isoValue, { zone: 'utc' });
  if (!parsed.isValid) {
    throw new Error('Invalid ISO datetime for Microsoft event payload.');
  }
  return parsed.toFormat("yyyy-MM-dd'T'HH:mm:ss");
};

const parseGraphDateTimeToIso = (dateTime: string, timezone?: string): string | null => {
  const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/.test(dateTime);
  const parsed = hasOffset
    ? DateTime.fromISO(dateTime, { setZone: true })
    : DateTime.fromISO(dateTime, { zone: timezone || 'UTC' });
  if (!parsed.isValid) {
    return null;
  }
  return parsed.toUTC().toISO();
};

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

export const exchangeMicrosoftOAuthCode = async (
  input: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<MicrosoftTokenResponse> => {
  const response = await fetchImpl(MICROSOFT_TOKEN_URL, {
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
    throw new Error(`Microsoft token exchange failed: ${await readErrorPayload(response)}`);
  }

  const parsed = (await response.json()) as Partial<MicrosoftTokenResponse>;
  if (typeof parsed.access_token !== 'string' || typeof parsed.expires_in !== 'number') {
    throw new Error('Microsoft token exchange returned an invalid payload.');
  }

  return {
    access_token: parsed.access_token,
    expires_in: parsed.expires_in,
    ...(typeof parsed.refresh_token === 'string' ? { refresh_token: parsed.refresh_token } : {}),
    ...(typeof parsed.scope === 'string' ? { scope: parsed.scope } : {}),
    ...(typeof parsed.token_type === 'string' ? { token_type: parsed.token_type } : {}),
  };
};

export const refreshMicrosoftOAuthToken = async (
  input: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<MicrosoftTokenResponse> => {
  const response = await fetchImpl(MICROSOFT_TOKEN_URL, {
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
    throw new Error(`Microsoft token refresh failed: ${await readErrorPayload(response)}`);
  }

  const parsed = (await response.json()) as Partial<MicrosoftTokenResponse>;
  if (typeof parsed.access_token !== 'string' || typeof parsed.expires_in !== 'number') {
    throw new Error('Microsoft token refresh returned an invalid payload.');
  }

  return {
    access_token: parsed.access_token,
    expires_in: parsed.expires_in,
    ...(typeof parsed.refresh_token === 'string' ? { refresh_token: parsed.refresh_token } : {}),
    ...(typeof parsed.scope === 'string' ? { scope: parsed.scope } : {}),
    ...(typeof parsed.token_type === 'string' ? { token_type: parsed.token_type } : {}),
  };
};

export const fetchMicrosoftUserProfile = async (
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ sub: string; email?: string }> => {
  const response = await fetchImpl(MICROSOFT_USERINFO_URL, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
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
  input: {
    accessToken: string;
    startIso: string;
    endIso: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<MicrosoftBusyWindow[]> => {
  const response = await fetchImpl(MICROSOFT_GET_SCHEDULE_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      schedules: ['me'],
      startTime: {
        dateTime: toGraphDateTime(input.startIso),
        timeZone: 'UTC',
      },
      endTime: {
        dateTime: toGraphDateTime(input.endIso),
        timeZone: 'UTC',
      },
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

  const items = parsed.value?.[0]?.scheduleItems ?? [];
  return items
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
      return {
        start: startIso,
        end: endIso,
      };
    })
    .filter((window): window is MicrosoftBusyWindow => window !== null);
};

export const createMicrosoftCalendarEvent = async (
  input: {
    accessToken: string;
    idempotencyKey: string;
    eventName: string;
    inviteeName: string;
    inviteeEmail: string;
    startsAtIso: string;
    endsAtIso: string;
    locationValue: string | null;
  },
  fetchImpl: FetchLike = fetch,
): Promise<{ externalEventId: string }> => {
  const response = await fetchImpl(MICROSOFT_EVENTS_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      subject: input.eventName,
      body: {
        contentType: 'text',
        content: `OpenCalendly booking with ${input.inviteeName} (${input.inviteeEmail})`,
      },
      start: {
        dateTime: toGraphDateTime(input.startsAtIso),
        timeZone: 'UTC',
      },
      end: {
        dateTime: toGraphDateTime(input.endsAtIso),
        timeZone: 'UTC',
      },
      transactionId: input.idempotencyKey,
      attendees: [
        {
          emailAddress: {
            address: input.inviteeEmail,
            name: input.inviteeName,
          },
          type: 'required',
        },
      ],
      ...(input.locationValue
        ? {
            location: {
              displayName: input.locationValue,
            },
          }
        : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Microsoft calendar event create failed: ${await readErrorPayload(response)}`);
  }

  const parsed = (await response.json()) as { id?: string };
  if (typeof parsed.id !== 'string' || parsed.id.length === 0) {
    throw new Error('Microsoft calendar create response missing event id.');
  }

  return { externalEventId: parsed.id };
};

export const findMicrosoftCalendarEventByIdempotencyKey = async (
  input: {
    accessToken: string;
    idempotencyKey: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<{ externalEventId: string } | null> => {
  const url = new URL(MICROSOFT_EVENTS_URL);
  const escapedIdempotencyKey = input.idempotencyKey.replace(/'/g, "''");
  url.searchParams.set('$filter', `transactionId eq '${escapedIdempotencyKey}'`);
  url.searchParams.set('$select', 'id');
  url.searchParams.set('$top', '1');

  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Microsoft calendar event lookup failed: ${await readErrorPayload(response)}`);
  }

  const parsed = (await response.json()) as {
    value?: Array<{ id?: string }>;
  };
  const externalEventId = parsed.value?.[0]?.id;
  if (typeof externalEventId !== 'string' || externalEventId.length === 0) {
    return null;
  }

  return { externalEventId };
};

export const cancelMicrosoftCalendarEvent = async (
  input: {
    accessToken: string;
    externalEventId: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<void> => {
  const response = await fetchImpl(
    `${MICROSOFT_EVENTS_URL}/${encodeURIComponent(input.externalEventId)}`,
    {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${input.accessToken}`,
      },
    },
  );

  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    throw new Error(`Microsoft calendar event cancel failed: ${await readErrorPayload(response)}`);
  }
};

export const updateMicrosoftCalendarEvent = async (
  input: {
    accessToken: string;
    externalEventId: string;
    startsAtIso: string;
    endsAtIso: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<void> => {
  const response = await fetchImpl(
    `${MICROSOFT_EVENTS_URL}/${encodeURIComponent(input.externalEventId)}`,
    {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        start: {
          dateTime: toGraphDateTime(input.startsAtIso),
          timeZone: 'UTC',
        },
        end: {
          dateTime: toGraphDateTime(input.endsAtIso),
          timeZone: 'UTC',
        },
      }),
    },
  );

  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    throw new Error(`Microsoft calendar event update failed: ${await readErrorPayload(response)}`);
  }
};
