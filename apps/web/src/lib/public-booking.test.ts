import { describe, expect, it, vi } from 'vitest';

import { createIdempotencyKey, groupSlotsByDay } from './public-booking';

describe('groupSlotsByDay', () => {
  it('groups slots with the same local date label together', () => {
    const result = groupSlotsByDay(
      [
        { startsAt: '2026-03-01T10:00:00.000Z', endsAt: '2026-03-01T10:30:00.000Z' },
        { startsAt: '2026-03-01T11:00:00.000Z', endsAt: '2026-03-01T11:30:00.000Z' },
      ],
      'UTC',
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.slots).toHaveLength(2);
  });
});

describe('createIdempotencyKey', () => {
  it('falls back when crypto.randomUUID is unavailable', () => {
    const originalCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', undefined);

    const key = createIdempotencyKey();
    expect(key.startsWith('fallback-')).toBe(true);

    vi.unstubAllGlobals();
    if (originalCrypto) {
      vi.stubGlobal('crypto', originalCrypto);
    }
  });
});
