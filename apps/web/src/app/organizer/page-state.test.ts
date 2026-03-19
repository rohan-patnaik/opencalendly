import { describe, expect, it } from 'vitest';
import { getOrganizerConsolePageState } from './page-state';

describe('getOrganizerConsolePageState', () => {
  const organizerSession = {
    expiresAt: '2099-01-01T00:00:00.000Z',
    user: {
      id: 'user_123',
      email: 'user_123@example.com',
      username: 'user-123',
      displayName: 'User 123',
      timezone: 'Asia/Kolkata',
      onboardingCompleted: true,
    },
  };

  const organizerUser = {
    id: 'user_123',
    email: 'user_123@example.com',
    username: 'user-123',
    displayName: 'User 123',
    timezone: 'Asia/Kolkata',
    onboardingCompleted: true,
  };

  it('shows auth loading until auth settles', () => {
    expect(
      getOrganizerConsolePageState({
        ready: false,
        authChecking: false,
        session: null,
        authedUser: null,
        hasResolvedInitialLoad: false,
      }),
    ).toBe('auth-loading');

    expect(
      getOrganizerConsolePageState({
        ready: true,
        authChecking: true,
        session: null,
        authedUser: null,
        hasResolvedInitialLoad: false,
      }),
    ).toBe('auth-loading');
  });

  it('shows signed-out state once auth is settled without a session', () => {
    expect(
      getOrganizerConsolePageState({
        ready: true,
        authChecking: false,
        session: null,
        authedUser: null,
        hasResolvedInitialLoad: false,
      }),
    ).toBe('signed-out');
  });

  it('shows signed-out state when auth settles without an organizer user', () => {
    expect(
      getOrganizerConsolePageState({
        ready: true,
        authChecking: false,
        session: organizerSession,
        authedUser: null,
        hasResolvedInitialLoad: false,
      }),
    ).toBe('signed-out');
  });

  it('shows data loading for signed-in users until organizer bootstrap resolves', () => {
    expect(
      getOrganizerConsolePageState({
        ready: true,
        authChecking: false,
        session: organizerSession,
        authedUser: organizerUser,
        hasResolvedInitialLoad: false,
      }),
    ).toBe('data-loading');
  });

  it('shows the organizer console once bootstrap data is ready', () => {
    expect(
      getOrganizerConsolePageState({
        ready: true,
        authChecking: false,
        session: organizerSession,
        authedUser: organizerUser,
        hasResolvedInitialLoad: true,
      }),
    ).toBe('ready');
  });
});
