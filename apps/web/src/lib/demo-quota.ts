'use client';

import { useCallback, useEffect, useState } from 'react';

import { getAuthHeader, type AuthSession } from './auth-session';

export type DemoFeatureCostKey =
  | 'event_type_create'
  | 'event_type_update'
  | 'availability_save'
  | 'notification_rules_save'
  | 'notification_run'
  | 'team_create'
  | 'team_member_add'
  | 'team_event_type_create'
  | 'webhook_create'
  | 'webhook_update'
  | 'webhook_run'
  | 'calendar_connect'
  | 'calendar_sync'
  | 'writeback_run'
  | 'one_on_one_booking'
  | 'team_booking'
  | 'booking_cancel'
  | 'booking_reschedule';

export type DemoQuotaStatusResponse = {
  ok: boolean;
  date: string;
  resetAt: string;
  admissions: {
    date: string;
    dailyLimit: number;
    admittedCount: number;
    remaining: number;
    isExhausted: boolean;
  };
  account: {
    admitted: boolean;
    isBypass: boolean;
    creditsLimit: number | null;
    creditsUsed: number;
    remaining: number | null;
    isExhausted: boolean;
    admittedAt: string | null;
    lastActivityAt: string | null;
  } | null;
  featureCosts: Array<{
    key: DemoFeatureCostKey;
    label: string;
    cost: number;
  }>;
  error?: string;
};

type DemoQuotaApiError = {
  ok?: boolean;
  error?: string;
};

const readJsonSafely = async <T>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

export const fetchDemoQuotaStatus = async (input: {
  apiBaseUrl: string;
  session: AuthSession | null;
  signal?: AbortSignal;
}): Promise<DemoQuotaStatusResponse> => {
  const response = await fetch(`${input.apiBaseUrl}/v0/demo-credits/status`, {
    cache: 'no-store',
    headers: {
      ...getAuthHeader(input.session),
    },
    ...(input.signal ? { signal: input.signal } : {}),
  });
  const payload = await readJsonSafely<DemoQuotaStatusResponse & DemoQuotaApiError>(response);
  if (!response.ok || !payload || payload.ok !== true) {
    throw new Error(payload?.error || 'Unable to load demo quota status.');
  }
  return payload;
};

export const joinDemoWaitlist = async (input: {
  apiBaseUrl: string;
  email: string;
  source: string;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: boolean; joined: boolean }> => {
  const response = await fetch(`${input.apiBaseUrl}/v0/waitlist`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      source: input.source,
      metadata: input.metadata ?? {},
    }),
  });
  const payload = await readJsonSafely<{ ok?: boolean; joined?: boolean; error?: string }>(response);
  if (!response.ok || !payload || payload.ok !== true) {
    throw new Error(payload?.error || 'Unable to join the waitlist.');
  }
  return {
    ok: true,
    joined: Boolean(payload.joined),
  };
};

export const useDemoQuota = (input: {
  apiBaseUrl: string;
  session: AuthSession | null;
  enabled?: boolean;
}) => {
  const { apiBaseUrl, session, enabled = true } = input;
  const [status, setStatus] = useState<DemoQuotaStatusResponse | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      setStatus(null);
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const nextStatus = await fetchDemoQuotaStatus({
        apiBaseUrl,
        session,
      });
      setStatus(nextStatus);
      return nextStatus;
    } catch (refreshError) {
      const message =
        refreshError instanceof Error ? refreshError.message : 'Unable to load demo quota status.';
      setError(message);
      setStatus(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, enabled, session]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      setStatus(null);
      return;
    }

    const abortController = new AbortController();
    setLoading(true);
    setError(null);

    void fetchDemoQuotaStatus({
      apiBaseUrl,
      session,
      signal: abortController.signal,
    })
      .then((nextStatus) => {
        setStatus(nextStatus);
      })
      .catch((loadError) => {
        if (abortController.signal.aborted) {
          return;
        }
        const message =
          loadError instanceof Error ? loadError.message : 'Unable to load demo quota status.';
        setError(message);
        setStatus(null);
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [apiBaseUrl, enabled, session]);

  return {
    status,
    loading,
    error,
    refresh,
  };
};
