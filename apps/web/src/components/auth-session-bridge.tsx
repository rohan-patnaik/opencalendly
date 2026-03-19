'use client';

import { useAuth, useUser } from '@clerk/nextjs';
import { useEffect, useRef, useState } from 'react';

import { normalizeLocalBrowserUrl, resolveApiBaseUrl } from '../lib/api-base-url';
import {
  API_REQUEST_CREDENTIALS,
  clearAuthSession,
  readAuthSession,
  writeAuthSession,
} from '../lib/auth-session';
import {
  resolveBrowserTimezone,
  resolveClerkExchangeUsername,
  shouldExchangeClerkSession,
  shouldPreserveSignedOutSession,
} from '../lib/clerk-session-bridge';

type ClerkExchangeResponse = {
  ok: boolean;
  expiresAt: string;
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    timezone: string;
    onboardingCompleted: boolean;
  };
  error?: string;
};

const apiBaseUrl = resolveApiBaseUrl('Clerk session exchange');
const MAX_SESSION_EXCHANGE_RETRIES = 5;
const RETRYABLE_EXCHANGE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_SESSION_EXCHANGE_RETRY_DELAY_MS = 30_000;
const EXCHANGE_REQUEST_TIMEOUT_MS = 15_000;

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
      if (!shouldPreserveSignedOutSession(existingSession)) {
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
    let requestTimeout: ReturnType<typeof setTimeout> | null = null;
    const abortController = new AbortController();
    const exchangeSession = async () => {
      const clerkToken = await getToken();
      if (cancelled) {
        return;
      }
      if (!clerkToken) {
        throw new Error('Unable to obtain Clerk token for exchange.');
      }

      let response: Response;
      try {
        requestTimeout = setTimeout(() => {
          abortController.abort();
        }, EXCHANGE_REQUEST_TIMEOUT_MS);
        response = await fetch(normalizeLocalBrowserUrl(`${apiBaseUrl}/v0/auth/clerk/exchange`), {
          method: 'POST',
          credentials: API_REQUEST_CREDENTIALS,
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          signal: abortController.signal,
          body: JSON.stringify({
            clerkToken,
            username: resolveClerkExchangeUsername(user?.username),
            displayName: user?.fullName ?? undefined,
            timezone: resolveBrowserTimezone(),
          }),
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          const timeoutError = new Error('Clerk session exchange request timed out.') as Error & {
            status?: number;
            retryable?: boolean;
          };
          timeoutError.status = 408;
          timeoutError.retryable = true;
          throw timeoutError;
        }
        throw error;
      } finally {
        if (requestTimeout) {
          clearTimeout(requestTimeout);
          requestTimeout = null;
        }
      }

      const payload = (await response.json().catch(() => null)) as ClerkExchangeResponse | null;
      const maybeUser = payload?.user;
      const hasValidPayload =
        Boolean(payload) &&
        payload?.ok === true &&
        typeof payload.expiresAt === 'string' &&
        !Number.isNaN(new Date(payload.expiresAt).getTime()) &&
        maybeUser !== null &&
        typeof maybeUser === 'object' &&
        typeof maybeUser.id === 'string' &&
        typeof maybeUser.email === 'string' &&
        typeof maybeUser.username === 'string' &&
        typeof maybeUser.displayName === 'string' &&
        typeof maybeUser.timezone === 'string' &&
        typeof maybeUser.onboardingCompleted === 'boolean';

      if (!response.ok) {
        const error = new Error(payload?.error || 'Unable to exchange Clerk session.') as Error & {
          status?: number;
          retryable?: boolean;
        };
        error.status = response.status;
        error.retryable = RETRYABLE_EXCHANGE_STATUS_CODES.has(response.status);
        throw error;
      }

      if (!hasValidPayload) {
        const error = new Error('Invalid Clerk session exchange payload.') as Error & {
          status?: number;
          retryable?: boolean;
        };
        error.status = response.status;
        error.retryable = false;
        throw error;
      }

      if (cancelled) {
        return;
      }

      writeAuthSession({
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
          const baseDelayMs = Math.min(
            MAX_SESSION_EXCHANGE_RETRY_DELAY_MS,
            2_000 * 2 ** (retryStateRef.current.attempts - 1),
          );
          const jitterMs = Math.floor(Math.random() * 1_000);
          const delayMs = baseDelayMs + jitterMs;
          retryTimer = setTimeout(() => {
            setRetryNonce((current) => current + 1);
          }, delayMs);
          return;
        }

        lastSyncKeyRef.current = syncKey;
        retryStateRef.current = { syncKey: '', attempts: 0 };
      })
      .finally(() => {
        if (inFlightSyncKeyRef.current === syncKey) {
          inFlightSyncKeyRef.current = null;
        }
      });

    return () => {
      cancelled = true;
      abortController.abort();
      if (requestTimeout) {
        clearTimeout(requestTimeout);
      }
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [getToken, isLoaded, isSignedIn, retryNonce, sessionId, user]);

  return null;
}
