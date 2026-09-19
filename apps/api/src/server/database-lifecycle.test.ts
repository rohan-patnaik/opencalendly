import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withConnectedDatabase, withDatabase } from './database';
import type { ContextLike } from './types';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  end: vi.fn(),
  db: {},
  createDb: vi.fn(),
}));

vi.mock('@opencalendly/db', () => ({ createDb: mocks.createDb }));

describe('request-scoped database lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue(undefined);
    mocks.end.mockResolvedValue(undefined);
    mocks.createDb.mockReturnValue({ client: mocks, db: mocks.db });
  });

  it.each([withDatabase, withConnectedDatabase])(
    'connects and closes the client after a successful handler',
    async (withDb) => {
      const context = {
        env: { DATABASE_URL: 'postgres://user:pass@local.neon.tech/db' },
      } as ContextLike;
      const response = new Response('ok');
      const handler = vi.fn().mockResolvedValue(response);
      expect(await withDb(context, handler)).toBe(response);
      expect(mocks.createDb).toHaveBeenCalledWith(context.env.DATABASE_URL, { enforceNeon: true });
      expect(mocks.connect).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(mocks.db);
      expect(mocks.end).toHaveBeenCalledOnce();
    },
  );

  it.each([withDatabase, withConnectedDatabase])(
    'closes a Hyperdrive client and preserves a handler failure',
    async (withDb) => {
      const context = {
        env: { HYPERDRIVE: { connectionString: 'postgres://localhost/db' } },
      } as ContextLike;
      const failure = new Error('handler failed');
      mocks.end.mockRejectedValue(new Error('cleanup failed'));
      await expect(withDb(context, vi.fn().mockRejectedValue(failure))).rejects.toBe(failure);
      expect(mocks.createDb).toHaveBeenCalledWith('postgres://localhost/db', {
        enforceNeon: false,
      });
      expect(mocks.end).toHaveBeenCalledOnce();
    },
  );
});
