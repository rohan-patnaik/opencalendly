import { describe, expect, it, vi } from 'vitest';

import { supportsTimerUnref } from './client';

describe('supportsTimerUnref', () => {
  it('returns true when timer handles expose unref', () => {
    const handle = { unref: vi.fn() };
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockReturnValue(handle as never);
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => undefined);

    expect(supportsTimerUnref()).toBe(true);

    expect(setTimeoutSpy).toHaveBeenCalledOnce();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(handle);
  });

  it('returns false when timer handles do not expose unref', () => {
    const handle = { hasRef: vi.fn() };
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockReturnValue(handle as never);
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => undefined);

    expect(supportsTimerUnref()).toBe(false);

    expect(setTimeoutSpy).toHaveBeenCalledOnce();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(handle);
  });
});
