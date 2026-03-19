import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_SESSION_STORAGE_KEY,
  isSessionExpired,
  readAuthSession,
  type AuthSession,
} from './auth-session';

const buildSession = (expiresAt: string): AuthSession => ({
  expiresAt,
  user: {
    id: 'user-id',
    email: 'user@example.com',
    username: 'user',
    displayName: 'User',
    timezone: 'Asia/Kolkata',
    onboardingCompleted: true,
  },
});

describe('isSessionExpired', () => {
  it('returns false for a future expiry', () => {
    const session = buildSession(new Date(Date.now() + 15 * 60 * 1000).toISOString());
    expect(isSessionExpired(session)).toBe(false);
  });

  it('returns true for a past expiry', () => {
    const session = buildSession(new Date(Date.now() - 15 * 60 * 1000).toISOString());
    expect(isSessionExpired(session)).toBe(true);
  });

  it('returns true for an invalid expiry timestamp', () => {
    const session = buildSession('invalid-timestamp');
    expect(isSessionExpired(session)).toBe(true);
  });
});

describe('readAuthSession', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
        clear: () => {
          storage.clear();
        },
      },
      dispatchEvent: () => true,
    });
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('returns null and clears storage when onboardingCompleted is missing', () => {
    window.localStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify({
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        user: {
          id: 'user-id',
          email: 'user@example.com',
          username: 'user',
          displayName: 'User',
          timezone: 'Asia/Kolkata',
        },
      }),
    );

    expect(readAuthSession()).toBeNull();
    expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('returns null and clears storage when onboardingCompleted is not a boolean', () => {
    window.localStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify({
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        user: {
          id: 'user-id',
          email: 'user@example.com',
          username: 'user',
          displayName: 'User',
          timezone: 'Asia/Kolkata',
          onboardingCompleted: 'true',
        },
      }),
    );

    expect(readAuthSession()).toBeNull();
    expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('returns the session when onboardingCompleted is a boolean', () => {
    const session = buildSession(new Date(Date.now() + 15 * 60 * 1000).toISOString());
    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));

    expect(readAuthSession()).toEqual(session);
  });
});
