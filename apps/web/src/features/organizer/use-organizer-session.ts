'use client';

import { useCallback, useEffect, useState } from 'react';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';

import { authedGetJson } from '../../lib/api-client';
import type { AuthSession } from '../../lib/auth-session';
import type { AuthMeResponse, OrganizerConsoleUser } from './types';

type UseOrganizerSessionInput = {
  apiBaseUrl: string;
  ready: boolean;
  session: AuthSession | null;
  clear: () => void;
  signOut: (options: { redirectUrl: string }) => Promise<void>;
  setPanelError: (message: string | null) => void;
};

export const useOrganizerSession = ({
  apiBaseUrl,
  ready,
  session,
  clear,
  signOut,
  setPanelError,
}: UseOrganizerSessionInput) => {
  const [authChecking, setAuthChecking] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authedUser, setAuthedUser] = useState<OrganizerConsoleUser | null>(null);

  const handleSignOut = useCallback(async () => {
    setPanelError(null);
    clear();
    try {
      await signOut({ redirectUrl: '/auth/sign-in' });
    } catch (error) {
      if (isClerkAPIResponseError(error)) {
        const detail = error.errors[0]?.longMessage ?? error.errors[0]?.message;
        setPanelError(detail ?? 'Unable to sign out right now. Please try again.');
        return;
      }
      console.error('Clerk sign-out failed:', error);
      setPanelError('Unable to sign out right now. Please try again.');
    }
  }, [clear, setPanelError, signOut]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!session) {
      setAuthedUser(null);
      setAuthChecking(false);
      setAuthError(null);
      return;
    }

    const bootstrap = async () => {
      setAuthChecking(true);
      setAuthError(null);

      try {
        const payload = await authedGetJson<AuthMeResponse>({
          url: `${apiBaseUrl}/v0/auth/me`,
          session,
          fallbackError: 'Unable to restore organizer session.',
        });
        setAuthedUser(payload.user);
      } catch (caught) {
        setAuthedUser(null);
        setAuthError(caught instanceof Error ? caught.message : 'Unable to restore organizer session.');
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
    handleSignOut,
  };
};
