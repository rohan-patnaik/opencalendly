'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  AUTH_SESSION_EVENT,
  AUTH_SESSION_STORAGE_KEY,
  clearAuthSession,
  readAuthSession,
  type AuthSession,
  writeAuthSession,
} from './auth-session';

export const useAuthSession = () => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    setSession(readAuthSession());
  }, []);

  useEffect(() => {
    refresh();
    setReady(true);

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === AUTH_SESSION_STORAGE_KEY) {
        refresh();
      }
    };
    const onAuthEvent = () => refresh();

    window.addEventListener('storage', onStorage);
    window.addEventListener(AUTH_SESSION_EVENT, onAuthEvent);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(AUTH_SESSION_EVENT, onAuthEvent);
    };
  }, [refresh]);

  const save = useCallback((nextSession: AuthSession) => {
    writeAuthSession(nextSession);
    setSession(nextSession);
  }, []);

  const clear = useCallback(() => {
    clearAuthSession();
    setSession(null);
  }, []);

  return {
    session,
    ready,
    save,
    clear,
    refresh,
  };
};
