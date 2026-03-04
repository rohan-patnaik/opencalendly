import type { AuthSession } from './auth-session';

export const resolveBrowserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export const buildClerkSyncKey = (input: {
  sessionId?: string | null | undefined;
  email: string;
}): string => {
  return `${input.sessionId ?? 'unknown'}:${input.email.trim().toLowerCase()}`;
};

export const shouldExchangeClerkSession = (input: {
  isLoaded: boolean;
  isSignedIn: boolean;
  primaryEmail: string;
  existingSession: AuthSession | null;
  lastSyncKey: string;
  sessionId?: string | null | undefined;
}): { shouldExchange: boolean; syncKey: string | null } => {
  if (!input.isLoaded || !input.isSignedIn) {
    return { shouldExchange: false, syncKey: null };
  }

  const email = input.primaryEmail.trim().toLowerCase();
  if (!email) {
    return { shouldExchange: false, syncKey: null };
  }

  if (input.existingSession?.user.email.trim().toLowerCase() === email) {
    return { shouldExchange: false, syncKey: null };
  }

  const syncKey = buildClerkSyncKey({ sessionId: input.sessionId, email });
  if (input.lastSyncKey === syncKey) {
    return { shouldExchange: false, syncKey };
  }

  return { shouldExchange: true, syncKey };
};
