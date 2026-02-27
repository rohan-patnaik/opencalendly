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
const removeSessionFromStorage = (): void => {
  if (!isBrowser()) {
    return;
  }
  try {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

export const isSessionExpired = (session: AuthSession): boolean => {
  return Date.now() >= new Date(session.expiresAt).getTime();
};

export const readAuthSession = (): AuthSession | null => {
  if (!isBrowser()) {
    return null;
  }

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (
      !parsed ||
      typeof parsed.sessionToken !== 'string' ||
      typeof parsed.expiresAt !== 'string' ||
      !parsed.user ||
      typeof parsed.user.id !== 'string' ||
      typeof parsed.user.email !== 'string' ||
      typeof parsed.user.username !== 'string' ||
      typeof parsed.user.displayName !== 'string' ||
      typeof parsed.user.timezone !== 'string'
    ) {
      removeSessionFromStorage();
      return null;
    }

    const session = parsed as AuthSession;
    if (isSessionExpired(session)) {
      removeSessionFromStorage();
      return null;
    }

    return session;
  } catch {
    removeSessionFromStorage();
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
  try {
    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage failures but still notify listeners with in-memory session state.
  }
  emitSessionChange();
};

export const clearAuthSession = (): void => {
  if (!isBrowser()) {
    return;
  }
  removeSessionFromStorage();
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
