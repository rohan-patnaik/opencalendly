'use client';

import { useAuth, useUser } from '@clerk/nextjs';
import { useEffect, useRef, useState } from 'react';

import { resolveApiBaseUrl } from '../lib/api-base-url';
import { clearAuthSession, readAuthSession, writeAuthSession } from '../lib/auth-session';
import { resolveBrowserTimezone, shouldExchangeClerkSession } from '../lib/clerk-session-bridge';

type ClerkExchangeResponse = {
  ok: boolean;
  sessionToken: string;
  expiresAt: string;
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    timezone: string;
  };
  error?: string;
};

const apiBaseUrl = resolveApiBaseUrl('Clerk session exchange');
const MAX_SESSION_EXCHANGE_RETRIES = 5;
const RETRYABLE_EXCHANGE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export default function AuthSessionBridge() {
  const { isLoaded, isSignedIn, getToken, sessionId } = useAuth();
  const { user } = useUser();
  const lastSyncKeyRef = useRef('');
  const inFlightSyncKeyRef = useRef<string | null>(null);
  const retryStateRef = useRef<{ syncKey: string; attempts: number }>({ syncKey: '', attempts: 0 });
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const existingSession = readAuthSession();
    if (!isSignedIn) {
      lastSyncKeyRef.current = '';
      inFlightSyncKeyRef.current = null;
      retryStateRef.current = { syncKey: '', attempts: 0 };
      if (!existingSession || existingSession.issuer !== 'legacy') {
        clearAuthSession();
      }
      return;
    }

    const primaryEmail = user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() ?? '';
    if (!primaryEmail) {
      return;
    }

    const exchangeDecision = shouldExchangeClerkSession({
      isLoaded,
      isSignedIn,
      primaryEmail,
      existingSession,
      lastSyncKey: lastSyncKeyRef.current,
      sessionId,
    });
    if (!exchangeDecision.shouldExchange || !exchangeDecision.syncKey) {
      return;
    }
    if (inFlightSyncKeyRef.current === exchangeDecision.syncKey) {
      return;
    }
    inFlightSyncKeyRef.current = exchangeDecision.syncKey;

    let cancelled = false;
    const syncKey = exchangeDecision.syncKey;
    if (retryStateRef.current.syncKey !== syncKey) {
      retryStateRef.current = { syncKey, attempts: 0 };
    }
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const exchangeSession = async () => {
      const clerkToken = await getToken();
      if (cancelled) {
        return;
      }
      if (!clerkToken) {
        throw new Error('Unable to obtain Clerk token for exchange.');
      }

      const response = await fetch(`${apiBaseUrl}/v0/auth/clerk/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          clerkToken,
          username: user?.username ?? undefined,
          displayName: user?.fullName ?? undefined,
          timezone: resolveBrowserTimezone(),
        }),
      });

      const payload = (await response.json().catch(() => null)) as ClerkExchangeResponse | null;
      if (!response.ok || !payload || !payload.ok) {
        const error = new Error(payload?.error || 'Unable to exchange Clerk session.') as Error & {
          status?: number;
          retryable?: boolean;
        };
        error.status = response.status;
        error.retryable = RETRYABLE_EXCHANGE_STATUS_CODES.has(response.status);
        throw error;
      }

      if (cancelled) {
        return;
      }

      writeAuthSession({
        sessionToken: payload.sessionToken,
        expiresAt: payload.expiresAt,
        issuer: 'clerk',
        user: payload.user,
      });
      lastSyncKeyRef.current = syncKey;
      retryStateRef.current = { syncKey: '', attempts: 0 };
    };

    void exchangeSession()
      .catch((error) => {
        const retryable =
          typeof error === 'object' &&
          error !== null &&
          'retryable' in error &&
          typeof (error as { retryable?: unknown }).retryable === 'boolean'
            ? ((error as { retryable: boolean }).retryable as boolean)
            : true;
        const status =
          typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          typeof (error as { status?: unknown }).status === 'number'
            ? ((error as { status: number }).status as number)
            : null;
        console.error('Clerk session exchange failed:', {
          status,
          retryable,
          attempts: retryStateRef.current.attempts,
          error: error instanceof Error ? error.message : 'unknown',
        });

        if (!cancelled && retryable && retryStateRef.current.attempts < MAX_SESSION_EXCHANGE_RETRIES) {
          retryStateRef.current = {
            syncKey,
            attempts: retryStateRef.current.attempts + 1,
          };
          const delayMs = Math.min(8_000, 2_000 * retryStateRef.current.attempts);
          retryTimer = setTimeout(() => {
            setRetryNonce((current) => current + 1);
          }, delayMs);
        }
      })
      .finally(() => {
        if (inFlightSyncKeyRef.current === syncKey) {
          inFlightSyncKeyRef.current = null;
        }
      });

    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [getToken, isLoaded, isSignedIn, retryNonce, sessionId, user]);

  return null;
}
