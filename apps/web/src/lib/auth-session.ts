export type AuthUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  timezone: string;
};

export type AuthSession = {
  sessionToken: string;
  expiresAt: string;
  user: AuthUser;
};

export const AUTH_SESSION_STORAGE_KEY = 'opencalendly.auth.session';
export const AUTH_SESSION_EVENT = 'opencalendly:auth-session-changed';

const isBrowser = (): boolean => typeof window !== 'undefined';

export const isSessionExpired = (session: AuthSession): boolean => {
  return Date.now() >= new Date(session.expiresAt).getTime();
};

export const readAuthSession = (): AuthSession | null => {
  if (!isBrowser()) {
    return null;
  }

  const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (
      !parsed ||
      typeof parsed.sessionToken !== 'string' ||
      typeof parsed.expiresAt !== 'string' ||
      !parsed.user
    ) {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      return null;
    }

    const session = parsed as AuthSession;
    if (isSessionExpired(session)) {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      return null;
    }

    return session;
  } catch {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return null;
  }
};

const emitSessionChange = () => {
  if (!isBrowser()) {
    return;
  }
  window.dispatchEvent(new Event(AUTH_SESSION_EVENT));
};

export const writeAuthSession = (session: AuthSession): void => {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
  emitSessionChange();
};

export const clearAuthSession = (): void => {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  emitSessionChange();
};

export const getAuthHeader = (session: AuthSession | null): Record<string, string> => {
  if (!session) {
    return {};
  }
  return {
    Authorization: `Bearer ${session.sessionToken}`,
  };
};
