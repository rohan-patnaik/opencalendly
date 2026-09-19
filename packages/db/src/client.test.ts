import { afterEach, describe, expect, it, vi } from 'vitest';

import { Pool } from 'pg';
import type * as Pg from 'pg';

import { createPgPool, supportsTimerUnref } from './client';

vi.mock('pg', async (importOriginal) => ({
  ...(await importOriginal<typeof Pg>()),
  Pool: vi.fn(function () {}),
}));

afterEach(() => vi.restoreAllMocks());

describe('createPgPool', () => {
  it.each([true, false])('uses timer capability %s for allowExitOnIdle', (hasUnref) => {
    const handle = hasUnref ? { unref: vi.fn() } : 1;
    vi.spyOn(globalThis, 'setTimeout').mockReturnValue(handle as never);
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => undefined);

    createPgPool('postgres://user:pass@test.neon.tech/db');

    expect(Pool).toHaveBeenLastCalledWith(expect.objectContaining({ allowExitOnIdle: hasUnref }));
  });
});

describe('supportsTimerUnref', () => {
  it('returns true when timer handles expose unref', () => {
    const handle = { unref: vi.fn() };
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockReturnValue(handle as never);
    const clearTimeoutSpy = vi
      .spyOn(globalThis, 'clearTimeout')
      .mockImplementation(() => undefined);

    expect(supportsTimerUnref()).toBe(true);

    expect(setTimeoutSpy).toHaveBeenCalledOnce();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(handle);
  });

  it('returns false when timer handles do not expose unref', () => {
    const handle = { hasRef: vi.fn() };
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockReturnValue(handle as never);
    const clearTimeoutSpy = vi
      .spyOn(globalThis, 'clearTimeout')
      .mockImplementation(() => undefined);

    expect(supportsTimerUnref()).toBe(false);

    expect(setTimeoutSpy).toHaveBeenCalledOnce();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(handle);
  });
});
