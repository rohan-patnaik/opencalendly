import type { FetchLike } from './microsoft-shared';
import { MICROSOFT_EVENTS_URL, readErrorPayload, toGraphDateTime } from './microsoft-shared';

const MICROSOFT_IDEMPOTENCY_LOOKUP_LIMIT = 25;

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
      start: { dateTime: toGraphDateTime(input.startsAtIso), timeZone: 'UTC' },
      end: { dateTime: toGraphDateTime(input.endsAtIso), timeZone: 'UTC' },
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
        ? { location: { displayName: input.locationValue } }
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
  input: { accessToken: string; idempotencyKey: string },
  fetchImpl: FetchLike = fetch,
): Promise<{ externalEventId: string } | null> => {
  const url = new URL(MICROSOFT_EVENTS_URL);
  url.searchParams.set('$select', 'id,transactionId,createdDateTime');
  url.searchParams.set('$orderby', 'createdDateTime desc');
  url.searchParams.set('$top', String(MICROSOFT_IDEMPOTENCY_LOOKUP_LIMIT));

  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: { authorization: `Bearer ${input.accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Microsoft calendar event lookup failed: ${await readErrorPayload(response)}`);
  }

  const parsed = (await response.json()) as {
    value?: Array<{ id?: string; transactionId?: string | null }>;
  };
  const externalEventId = parsed.value?.find(
    (event) => event.transactionId === input.idempotencyKey,
  )?.id;
  if (typeof externalEventId !== 'string' || externalEventId.length === 0) {
    return null;
  }

  return { externalEventId };
};

export const cancelMicrosoftCalendarEvent = async (
  input: { accessToken: string; externalEventId: string },
  fetchImpl: FetchLike = fetch,
): Promise<void> => {
  const response = await fetchImpl(
    `${MICROSOFT_EVENTS_URL}/${encodeURIComponent(input.externalEventId)}`,
    {
      method: 'DELETE',
      headers: { authorization: `Bearer ${input.accessToken}` },
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
  input: { accessToken: string; externalEventId: string; startsAtIso: string; endsAtIso: string },
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
        start: { dateTime: toGraphDateTime(input.startsAtIso), timeZone: 'UTC' },
        end: { dateTime: toGraphDateTime(input.endsAtIso), timeZone: 'UTC' },
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
