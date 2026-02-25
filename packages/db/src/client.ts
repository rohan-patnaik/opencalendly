import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';

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

export const createDb = (databaseUrl = getDatabaseUrl(), options: CreatePgClientOptions = {}) => {
  const client = createPgClient(databaseUrl, options);
  const db = drizzle({ client, schema });
  return { client, db };
};
