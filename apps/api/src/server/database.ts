import { createDb } from '@opencalendly/db';

import { jsonError } from './core';
import { isNeonDatabaseUrl, resolveConnectionString } from './env';
import type { ContextLike, Database } from './types';

export const isUniqueViolation = (error: unknown, constraint?: string): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { code?: string; constraint?: string };
  if (maybeError.code !== '23505') {
    return false;
  }
  return constraint ? maybeError.constraint === constraint : true;
};

export const withDatabase = async (
  context: ContextLike,
  handler: (db: Database) => Promise<Response>,
): Promise<Response> => {
  const connection = resolveConnectionString(context.env);
  if (!connection) {
    return jsonError(
      context,
      500,
      'Missing database connection string. Configure Hyperdrive or a Neon DATABASE_URL.',
    );
  }

  if (connection.source === 'database_url' && !isNeonDatabaseUrl(connection.connectionString)) {
    return jsonError(context, 500, 'DATABASE_URL must point to Neon Postgres (*.neon.tech).');
  }

  const { client, db } = createDb(connection.connectionString, {
    enforceNeon: connection.source === 'database_url',
  });
  await client.connect();
  try {
    return await handler(db);
  } finally {
    await client.end().catch(() => undefined);
  }
};

export const withConnectedDatabase = async <T>(
  context: Pick<ContextLike, 'env'>,
  handler: (db: Database) => Promise<T>,
): Promise<T> => {
  const connection = resolveConnectionString(context.env);
  if (!connection) {
    throw new Error('Missing database connection string. Configure Hyperdrive or a Neon DATABASE_URL.');
  }
  if (connection.source === 'database_url' && !isNeonDatabaseUrl(connection.connectionString)) {
    throw new Error('DATABASE_URL must point to Neon Postgres (*.neon.tech).');
  }

  const { client, db } = createDb(connection.connectionString, {
    enforceNeon: connection.source === 'database_url',
  });
  await client.connect();
  try {
    return await handler(db);
  } finally {
    await client.end().catch(() => undefined);
  }
};
