'use client';

import { useAuth, useUser } from '@clerk/nextjs';
import { useEffect, useRef } from 'react';

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

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      lastSyncKeyRef.current = '';
      clearAuthSession();
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
      existingSession: readAuthSession(),
      lastSyncKey: lastSyncKeyRef.current,
      sessionId,
    });
    if (!exchangeDecision.shouldExchange || !exchangeDecision.syncKey) {
      return;
    }
    lastSyncKeyRef.current = exchangeDecision.syncKey;

    let cancelled = false;
    const exchangeSession = async () => {
      const clerkToken = await getToken();
      if (!clerkToken || cancelled) {
        return;
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
    };

    void exchangeSession().catch((error) => {
      console.error('Clerk session exchange failed:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, sessionId, user]);

  return null;
}
