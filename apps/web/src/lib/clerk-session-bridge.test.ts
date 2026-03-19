import { describe, expect, it } from 'vitest';

import type { AuthSession } from './auth-session';
import {
  buildClerkSyncKey,
  resolveClerkExchangeUsername,
  shouldExchangeClerkSession,
  shouldPreserveSignedOutSession,
} from './clerk-session-bridge';

const buildSession = (email: string): AuthSession => ({
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  user: {
    id: 'user-id',
    email,
    username: 'demo',
    displayName: 'Demo User',
    timezone: 'Asia/Kolkata',
    onboardingCompleted: true,
  },
});

describe('clerk session bridge helpers', () => {
  it('keeps app-compatible clerk usernames for exchange', () => {
    expect(resolveClerkExchangeUsername('Demo-User')).toBe('demo-user');
  });

  it('drops clerk usernames that do not match the app username contract', () => {
    expect(resolveClerkExchangeUsername('john.doe')).toBeUndefined();
    expect(resolveClerkExchangeUsername('john_doe')).toBeUndefined();
    expect(resolveClerkExchangeUsername('')).toBeUndefined();
  });

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

  it('preserves manually bootstrapped sessions while clerk is signed out', () => {
    expect(shouldPreserveSignedOutSession({ ...buildSession('demo@example.com'), issuer: 'legacy' })).toBe(true);
    expect(shouldPreserveSignedOutSession({ ...buildSession('demo@example.com'), issuer: 'dev' })).toBe(true);
    expect(shouldPreserveSignedOutSession({ ...buildSession('demo@example.com'), issuer: 'clerk' })).toBe(false);
    expect(shouldPreserveSignedOutSession(null)).toBe(false);
  });
});
