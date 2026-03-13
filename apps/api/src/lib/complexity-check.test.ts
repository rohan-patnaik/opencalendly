import { describe, expect, it } from 'vitest';

// @ts-expect-error Vitest exercises the runtime helper directly from the repo-root script module.
import { normalizeRepoPath } from '../../../../scripts/complexity-check-lib.mjs';

describe('normalizeRepoPath', () => {
  it('normalizes Windows path separators for threshold matching', () => {
    expect(normalizeRepoPath('apps\\api\\src\\index.ts')).toBe('apps/api/src/index.ts');
  });

  it('preserves POSIX paths', () => {
    expect(normalizeRepoPath('apps/web/src/app/page.client.tsx')).toBe('apps/web/src/app/page.client.tsx');
  });
});
