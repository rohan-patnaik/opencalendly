// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authedGetJson } from '../lib/api-client';
import type { AuthSession } from '../lib/auth-session';
import { requestAuthSessionBridgeRetry } from '../lib/auth-session-bridge-retry';
import { useDashboardSession } from './dashboard/use-dashboard-session';
import { useOrganizerSession } from './organizer/use-organizer-session';

vi.mock('@clerk/nextjs/errors', () => ({
  isClerkAPIResponseError: vi.fn(() => false),
}));

vi.mock('../lib/api-client', () => ({
  authedGetJson: vi.fn(),
  revokeApiSession: vi.fn(),
}));

vi.mock('../lib/auth-session-bridge-retry', () => ({
  requestAuthSessionBridgeRetry: vi.fn(),
}));

type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const session: AuthSession = {
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  issuer: 'clerk',
  user: {
    id: 'user-id',
    email: 'demo@example.com',
    username: 'demo',
    displayName: 'Demo User',
    timezone: 'Asia/Kolkata',
    onboardingCompleted: true,
  },
};

const flushEffects = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('protected session repair', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;
    vi.mocked(authedGetJson).mockRejectedValue(new Error('Unauthorized'));
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    vi.clearAllMocks();
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('requests a bridge retry after organizer auth invalidates the app session', async () => {
    const clear = vi.fn();

    function Harness() {
      useOrganizerSession({
        apiBaseUrl: 'http://localhost:8787',
        ready: true,
        session,
        clear,
        signOut: vi.fn(),
        setPanelError: vi.fn(),
      });
      return null;
    }

    await act(async () => {
      root?.render(React.createElement(Harness));
    });
    await flushEffects();

    expect(clear).toHaveBeenCalledTimes(1);
    expect(requestAuthSessionBridgeRetry).toHaveBeenCalledTimes(1);
  });

  it('requests a bridge retry after dashboard auth invalidates the app session', async () => {
    const clear = vi.fn();

    function Harness() {
      useDashboardSession({
        apiBaseUrl: 'http://localhost:8787',
        ready: true,
        session,
        clear,
        signOut: vi.fn(),
      });
      return null;
    }

    await act(async () => {
      root?.render(React.createElement(Harness));
    });
    await flushEffects();

    expect(clear).toHaveBeenCalledTimes(1);
    expect(requestAuthSessionBridgeRetry).toHaveBeenCalledTimes(1);
  });
});
