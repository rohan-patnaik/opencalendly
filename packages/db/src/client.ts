import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';

import * as schema from './schema';

const NEON_HOST_PATTERN = /\.neon\.tech(?::\d+)?(?:\/|$)/i;

export const isNeonDatabaseUrl = (databaseUrl: string): boolean => {
  return NEON_HOST_PATTERN.test(databaseUrl);
};

export const assertNeonDatabaseUrl = (databaseUrl: string): void => {
  if (!isNeonDatabaseUrl(databaseUrl)) {
    throw new Error('DATABASE_URL must point to Neon Postgres (*.neon.tech).');
  }
};

export const getDatabaseUrl = (): string => {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('DATABASE_URL is required.');
  }
  assertNeonDatabaseUrl(url);
  return url;
};

type CreatePgClientOptions = {
  enforceNeon?: boolean;
};

type RuntimeDbEntry = {
  client: Pool;
  db: ReturnType<typeof drizzle<typeof schema>>;
};

export const supportsTimerUnref = (): boolean => {
  const timer = setTimeout(() => undefined, 0);
  clearTimeout(timer);
  return typeof timer === 'object' && timer !== null && typeof timer.unref === 'function';
};

const getRuntimeDbCache = (): Map<string, RuntimeDbEntry> => {
  const globalCache = globalThis as typeof globalThis & {
    __opencalendlyRuntimeDbCache__?: Map<string, RuntimeDbEntry>;
  };

  if (!globalCache.__opencalendlyRuntimeDbCache__) {
    globalCache.__opencalendlyRuntimeDbCache__ = new Map();
  }

  return globalCache.__opencalendlyRuntimeDbCache__;
};

export const createPgClient = (
  databaseUrl = getDatabaseUrl(),
  options: CreatePgClientOptions = {},
): Client => {
  const { enforceNeon = true } = options;
  if (enforceNeon) {
    assertNeonDatabaseUrl(databaseUrl);
  }

  return new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
};

export const createPgPool = (
  databaseUrl = getDatabaseUrl(),
  options: CreatePgClientOptions = {},
): Pool => {
  const { enforceNeon = true } = options;
  if (enforceNeon) {
    assertNeonDatabaseUrl(databaseUrl);
  }

  return new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: supportsTimerUnref(),
  });
};

export const createDb = (databaseUrl = getDatabaseUrl(), options: CreatePgClientOptions = {}) => {
  const client = createPgClient(databaseUrl, options);
  const db = drizzle({ client, schema });
  return { client, db };
};

export const createPooledDb = (databaseUrl = getDatabaseUrl(), options: CreatePgClientOptions = {}) => {
  const client = createPgPool(databaseUrl, options);
  const db = drizzle({ client, schema });
  return { client, db };
};

export const createRuntimeDb = (
  databaseUrl = getDatabaseUrl(),
  options: CreatePgClientOptions = {},
) => {
  const { enforceNeon = true } = options;
  if (enforceNeon) {
    assertNeonDatabaseUrl(databaseUrl);
  }

  const cacheKey = `${enforceNeon ? 'strict' : 'relaxed'}:${databaseUrl}`;
  const cache = getRuntimeDbCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const entry = createPooledDb(databaseUrl, { enforceNeon });
  cache.set(cacheKey, entry);
  return entry;
};

export const clearRuntimeDb = async (
  databaseUrl = getDatabaseUrl(),
  options: CreatePgClientOptions = {},
): Promise<void> => {
  const { enforceNeon = true } = options;
  const cacheKey = `${enforceNeon ? 'strict' : 'relaxed'}:${databaseUrl}`;
  const cache = getRuntimeDbCache();
  const cached = cache.get(cacheKey);
  if (!cached) {
    return;
  }

  cache.delete(cacheKey);
  await cached.client.end().catch(() => undefined);
};

export const clearAllRuntimeDbs = async (): Promise<void> => {
  const cache = getRuntimeDbCache();
  const entries = Array.from(cache.values());
  cache.clear();
  await Promise.all(entries.map((entry) => entry.client.end().catch(() => undefined)));
};
