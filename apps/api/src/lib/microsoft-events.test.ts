import { describe, expect, it, vi } from 'vitest';

import {
  findMicrosoftCalendarEventByIdempotencyKey,
  createMicrosoftCalendarEvent,
  getMicrosoftIdempotencyLookupLimit,
} from './microsoft-events';

const restoreLookupLimitEnv = (value: string | undefined) => {
  if (typeof value === 'string') {
    process.env.MICROSOFT_IDEMPOTENCY_LOOKUP_LIMIT = value;
    return;
  }
  delete process.env.MICROSOFT_IDEMPOTENCY_LOOKUP_LIMIT;
};

describe('microsoft-events', () => {
  it('uses the default recent-event lookup limit when env is unset', () => {
    const original = process.env.MICROSOFT_IDEMPOTENCY_LOOKUP_LIMIT;
    delete process.env.MICROSOFT_IDEMPOTENCY_LOOKUP_LIMIT;

    expect(getMicrosoftIdempotencyLookupLimit()).toBe(100);

    restoreLookupLimitEnv(original);
  });

  it('uses the configured recent-event lookup limit when env is set', () => {
    const original = process.env.MICROSOFT_IDEMPOTENCY_LOOKUP_LIMIT;
    process.env.MICROSOFT_IDEMPOTENCY_LOOKUP_LIMIT = '250';

    expect(getMicrosoftIdempotencyLookupLimit()).toBe(250);

    restoreLookupLimitEnv(original);
  });

  it('looks up events by transactionId via client-side filtering', async () => {
    const calls: Array<{ url: string | URL | Request; init: RequestInit | undefined }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          value: [
            { id: 'other-event', transactionId: 'microsoft:other-booking' },
            { id: 'target-event', transactionId: 'microsoft:booking-1' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const result = await findMicrosoftCalendarEventByIdempotencyKey(
      {
        accessToken: 'microsoft-access-token',
        idempotencyKey: 'microsoft:booking-1',
      },
      fetchImpl,
    );

    expect(result).toEqual({ externalEventId: 'target-event' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(calls[0]?.url)).toBe(
      'https://graph.microsoft.com/v1.0/me/events?%24select=id%2CtransactionId%2CcreatedDateTime&%24orderby=createdDateTime+desc&%24top=100',
    );
  });

  it('returns null when the recent event window does not include the idempotency key', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ value: [{ id: 'other-event', transactionId: 'microsoft:other' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const result = await findMicrosoftCalendarEventByIdempotencyKey(
      {
        accessToken: 'microsoft-access-token',
        idempotencyKey: 'microsoft:booking-1',
      },
      fetchImpl,
    );

    expect(result).toBeNull();
  });

  it('returns null when Microsoft returns an empty recent-event window', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ value: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const result = await findMicrosoftCalendarEventByIdempotencyKey(
      {
        accessToken: 'microsoft-access-token',
        idempotencyKey: 'microsoft:booking-1',
      },
      fetchImpl,
    );

    expect(result).toBeNull();
  });

  it('ignores events with null transactionIds during the recent-event lookup', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          value: [{ id: 'missing-transaction', transactionId: null }],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });

    const result = await findMicrosoftCalendarEventByIdempotencyKey(
      {
        accessToken: 'microsoft-access-token',
        idempotencyKey: 'microsoft:booking-1',
      },
      fetchImpl,
    );

    expect(result).toBeNull();
  });

  it('surfaces Microsoft lookup failures', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: { message: 'forbidden' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    });

    await expect(
      findMicrosoftCalendarEventByIdempotencyKey(
        {
          accessToken: 'microsoft-access-token',
          idempotencyKey: 'microsoft:booking-1',
        },
        fetchImpl,
      ),
    ).rejects.toThrow(/Microsoft calendar event lookup failed/);
  });

  it('creates Microsoft events with transactionId for idempotency', async () => {
    const calls: Array<{ url: string | URL | Request; init: RequestInit | undefined }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: 'new-event-id' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    });

    const result = await createMicrosoftCalendarEvent(
      {
        accessToken: 'microsoft-access-token',
        idempotencyKey: 'microsoft:booking-1',
        eventName: 'Intro Call',
        inviteeName: 'Pat Lee',
        inviteeEmail: 'pat@example.com',
        startsAtIso: '2026-03-10T10:00:00.000Z',
        endsAtIso: '2026-03-10T10:30:00.000Z',
        locationValue: 'https://meet.example.com/intro',
      },
      fetchImpl,
    );

    expect(result).toEqual({ externalEventId: 'new-event-id' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(calls[0]?.url)).toBe('https://graph.microsoft.com/v1.0/me/events');
    expect(calls[0]?.init).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer microsoft-access-token',
        'content-type': 'application/json',
      },
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      transactionId: 'microsoft:booking-1',
      subject: 'Intro Call',
    });
  });

  it('surfaces Microsoft create failures', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: { message: 'upstream failed' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    });

    await expect(
      createMicrosoftCalendarEvent(
        {
          accessToken: 'microsoft-access-token',
          idempotencyKey: 'microsoft:booking-1',
          eventName: 'Intro Call',
          inviteeName: 'Pat Lee',
          inviteeEmail: 'pat@example.com',
          startsAtIso: '2026-03-10T10:00:00.000Z',
          endsAtIso: '2026-03-10T10:30:00.000Z',
          locationValue: null,
        },
        fetchImpl,
      ),
    ).rejects.toThrow(/Microsoft calendar event create failed/);
  });
});
