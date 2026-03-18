import { describe, expect, it, vi } from 'vitest';

import {
  findMicrosoftCalendarEventByIdempotencyKey,
  createMicrosoftCalendarEvent,
} from './microsoft-events';

describe('microsoft-events', () => {
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
      'https://graph.microsoft.com/v1.0/me/events?%24select=id%2CtransactionId%2CcreatedDateTime&%24orderby=createdDateTime+desc&%24top=25',
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
});
