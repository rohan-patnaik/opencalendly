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

export default function AuthSessionBridge() {
  const { isLoaded, isSignedIn, getToken, sessionId } = useAuth();
  const { user } = useUser();
  const lastSyncKeyRef = useRef('');
  const inFlightSyncKeyRef = useRef<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const existingSession = readAuthSession();
    if (!isSignedIn) {
      lastSyncKeyRef.current = '';
      inFlightSyncKeyRef.current = null;
      if (!existingSession) {
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
        throw new Error(payload?.error || 'Unable to exchange Clerk session.');
      }

      if (cancelled) {
        return;
      }

      writeAuthSession({
        sessionToken: payload.sessionToken,
        expiresAt: payload.expiresAt,
        user: payload.user,
      });
      lastSyncKeyRef.current = syncKey;
    };

    void exchangeSession().catch((error) => {
      console.error('Clerk session exchange failed:', error);
      if (!cancelled) {
        retryTimer = setTimeout(() => {
          setRetryNonce((current) => current + 1);
        }, 2_000);
      }
    }).finally(() => {
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
