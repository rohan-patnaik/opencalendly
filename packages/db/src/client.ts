import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';

import * as schema from './schema';

export const getDatabaseUrl = (): string => {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('DATABASE_URL is required.');
  }
  return url;
};

export const createPgClient = (databaseUrl = getDatabaseUrl()): Client => {
  const isLocal =
    databaseUrl.includes('localhost') ||
    databaseUrl.includes('127.0.0.1') ||
    databaseUrl.includes('host=/');

  return new Client({
    connectionString: databaseUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
};

export const createDb = (databaseUrl = getDatabaseUrl()) => {
  const client = createPgClient(databaseUrl);
  const db = drizzle({ client, schema });
  return { client, db };
};
