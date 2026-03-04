import { describe, expect, it } from 'vitest';

import type { AuthSession } from './auth-session';
import { buildClerkSyncKey, shouldExchangeClerkSession } from './clerk-session-bridge';

const buildSession = (email: string): AuthSession => ({
  sessionToken: 'session-token',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  user: {
    id: 'user-id',
    email,
    username: 'demo',
    displayName: 'Demo User',
    timezone: 'Asia/Kolkata',
  },
});

describe('clerk session bridge helpers', () => {
  it('builds sync key using session id and normalized email', () => {
    expect(
      buildClerkSyncKey({
        sessionId: 'sess_123',
        email: 'Demo@Example.com',
      }),
    ).toBe('sess_123:demo@example.com');
  });

  it('skips exchange when local session already matches clerk email', () => {
    const decision = shouldExchangeClerkSession({
      isLoaded: true,
      isSignedIn: true,
      primaryEmail: 'demo@example.com',
      existingSession: buildSession('demo@example.com'),
      lastSyncKey: '',
      sessionId: 'sess_123',
    });

    expect(decision.shouldExchange).toBe(false);
    expect(decision.syncKey).toBeNull();
  });

  it('requests exchange when signed in and local session is absent', () => {
    const decision = shouldExchangeClerkSession({
      isLoaded: true,
      isSignedIn: true,
      primaryEmail: 'demo@example.com',
      existingSession: null,
      lastSyncKey: '',
      sessionId: 'sess_123',
    });

    expect(decision.shouldExchange).toBe(true);
    expect(decision.syncKey).toBe('sess_123:demo@example.com');
  });
});
