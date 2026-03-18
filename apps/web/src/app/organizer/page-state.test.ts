import { describe, expect, it } from 'vitest';
import { getOrganizerConsolePageState } from './page-state';

describe('getOrganizerConsolePageState', () => {
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

  it('shows data loading for signed-in users until organizer bootstrap resolves', () => {
    expect(
      getOrganizerConsolePageState({
        ready: true,
        authChecking: false,
        session: {
          expiresAt: '2099-01-01T00:00:00.000Z',
          user: {
            id: 'user_123',
            email: 'charlesmagey5@gmail.com',
            username: 'charlesmagey5',
            displayName: 'Charles Magey',
            timezone: 'Asia/Kolkata',
          },
        },
        authedUser: {
          id: 'user_123',
          email: 'charlesmagey5@gmail.com',
          username: 'charlesmagey5',
          displayName: 'Charles Magey',
          timezone: 'Asia/Kolkata',
        },
        hasResolvedInitialLoad: false,
      }),
    ).toBe('data-loading');
  });

  it('shows the organizer console once bootstrap data is ready', () => {
    expect(
      getOrganizerConsolePageState({
        ready: true,
        authChecking: false,
        session: {
          expiresAt: '2099-01-01T00:00:00.000Z',
          user: {
            id: 'user_123',
            email: 'charlesmagey5@gmail.com',
            username: 'charlesmagey5',
            displayName: 'Charles Magey',
            timezone: 'Asia/Kolkata',
          },
        },
        authedUser: {
          id: 'user_123',
          email: 'charlesmagey5@gmail.com',
          username: 'charlesmagey5',
          displayName: 'Charles Magey',
          timezone: 'Asia/Kolkata',
        },
        hasResolvedInitialLoad: true,
      }),
    ).toBe('ready');
  });
});
