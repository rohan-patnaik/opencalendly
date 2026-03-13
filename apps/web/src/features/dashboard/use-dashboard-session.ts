'use client';

import { useCallback, useEffect, useState } from 'react';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';

import { authedGetJson, revokeApiSession } from '../../lib/api-client';
import type { AuthSession } from '../../lib/auth-session';
import type { AuthMeResponse, DashboardUser } from './types';

type UseDashboardSessionInput = {
  apiBaseUrl: string;
  ready: boolean;
  session: AuthSession | null;
  clear: () => void;
  signOut: (options: { redirectUrl: string }) => Promise<void>;
};

export const useDashboardSession = ({
  apiBaseUrl,
  ready,
  session,
  clear,
  signOut,
}: UseDashboardSessionInput) => {
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authedUser, setAuthedUser] = useState<DashboardUser | null>(null);

  const handleSignOut = useCallback(async () => {
    setSignOutError(null);
    try {
      await revokeApiSession(apiBaseUrl);
      await signOut({ redirectUrl: '/auth/sign-in' });
      clear();
    } catch (error) {
      console.error('Clerk sign-out failed:', error);
      if (isClerkAPIResponseError(error)) {
        const detail = error.errors[0]?.longMessage ?? error.errors[0]?.message;
        setSignOutError(detail ?? 'Unable to sign out right now. Please try again.');
        return;
      }
      setSignOutError('Unable to sign out right now. Please try again.');
    }
  }, [apiBaseUrl, clear, signOut]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!session) {
      setAuthedUser(null);
      setAuthError(null);
      setAuthChecking(false);
      return;
    }

    const bootstrap = async () => {
      setAuthChecking(true);
      setAuthError(null);

      try {
        const payload = await authedGetJson<AuthMeResponse>({
          url: `${apiBaseUrl}/v0/auth/me`,
          session,
          fallbackError: 'Unable to restore session.',
        });
        setAuthedUser(payload.user);
      } catch (caught) {
        setAuthedUser(null);
        setAuthError(caught instanceof Error ? caught.message : 'Unable to restore session.');
        clear();
      } finally {
        setAuthChecking(false);
      }
    };

    void bootstrap();
  }, [apiBaseUrl, clear, ready, session]);

  return {
    authChecking,
    authError,
    authedUser,
    signOutError,
    handleSignOut,
  };
};
