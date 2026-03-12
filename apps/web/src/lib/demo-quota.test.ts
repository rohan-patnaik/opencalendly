import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from './auth-session';
import { fetchDemoQuotaStatus, joinDemoWaitlist } from './demo-quota';

const originalFetch = globalThis.fetch;

const buildSession = (): AuthSession => ({
  sessionToken: 'session-token',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  user: {
    id: 'user-id',
    email: 'demo@example.com',
    username: 'demo',
    displayName: 'Demo User',
    timezone: 'Asia/Kolkata',
  },
});

const buildQuotaPayload = () => ({
  ok: true as const,
  date: '2026-03-12',
  resetAt: '2026-03-13T00:00:00.000Z',
  admissions: {
    date: '2026-03-12',
    dailyLimit: 15,
    admittedCount: 4,
    remaining: 11,
    isExhausted: false,
  },
  account: {
    admitted: true,
    isBypass: false,
    creditsLimit: 20,
    creditsUsed: 3,
    remaining: 17,
    isExhausted: false,
    admittedAt: '2026-03-12T05:00:00.000Z',
    lastActivityAt: '2026-03-12T05:05:00.000Z',
  },
  featureCosts: [
    {
      key: 'one_on_one_booking' as const,
      label: 'Book one-on-one demo',
      cost: 4,
    },
  ],
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe('demo quota client helpers', () => {
  it('loads quota status with bearer auth when a session exists', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.example.com/v0/demo-credits/status');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer session-token',
      });

      return new Response(JSON.stringify(buildQuotaPayload()), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const payload = await fetchDemoQuotaStatus({
      apiBaseUrl: 'https://api.example.com',
      session: buildSession(),
    });

    expect(payload.admissions.remaining).toBe(11);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces API errors when loading quota status fails', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Quota status unavailable.',
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    }) as typeof fetch;

    await expect(
      fetchDemoQuotaStatus({
        apiBaseUrl: 'https://api.example.com',
        session: null,
      }),
    ).rejects.toThrow('Quota status unavailable.');
  });

  it('posts waitlist joins with the expected payload', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/json',
      });
      expect(init?.body).toBe(
        JSON.stringify({
          email: 'demo@example.com',
          source: 'demo-booking',
          metadata: {
            page: 'intro-call',
          },
        }),
      );

      return new Response(JSON.stringify({ ok: true, joined: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await joinDemoWaitlist({
      apiBaseUrl: 'https://api.example.com',
      email: 'demo@example.com',
      source: 'demo-booking',
      metadata: {
        page: 'intro-call',
      },
    });

    expect(result).toEqual({ ok: true, joined: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces waitlist API errors', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Waitlist closed.',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    }) as typeof fetch;

    await expect(
      joinDemoWaitlist({
        apiBaseUrl: 'https://api.example.com',
        email: 'demo@example.com',
        source: 'demo-booking',
      }),
    ).rejects.toThrow('Waitlist closed.');
  });
});
