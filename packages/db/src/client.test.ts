import { afterEach, describe, expect, it, vi } from 'vitest';

import { runtimeSupportsTimerUnref } from './client';

describe('runtimeSupportsTimerUnref', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when timers expose unref', () => {
    const unref = vi.fn();
    const timer = { unref };
    const clearTimeoutMock = vi.fn();

    vi.stubGlobal('setTimeout', vi.fn(() => timer) as unknown as typeof setTimeout);
    vi.stubGlobal('clearTimeout', clearTimeoutMock as unknown as typeof clearTimeout);

    expect(runtimeSupportsTimerUnref()).toBe(true);
    expect(clearTimeoutMock).toHaveBeenCalledWith(timer);
  });

  it('returns false when timers do not expose unref', () => {
    const clearTimeoutMock = vi.fn();

    vi.stubGlobal('setTimeout', vi.fn(() => 1) as unknown as typeof setTimeout);
    vi.stubGlobal('clearTimeout', clearTimeoutMock as unknown as typeof clearTimeout);

    expect(runtimeSupportsTimerUnref()).toBe(false);
    expect(clearTimeoutMock).toHaveBeenCalledWith(1);
  });
});
