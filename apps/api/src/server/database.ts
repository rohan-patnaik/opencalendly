import { createDb, createRuntimeDb } from '@opencalendly/db';

import { jsonError } from './core';
import { isNeonDatabaseUrl, resolveConnectionString } from './env';
import type { ContextLike, Database } from './types';

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const normalizeHostname = (value: string): string => {
  return value.trim().toLowerCase().replace(/^\[(.*)\]$/, '$1');
};

export const shouldUsePerRequestDatabase = (context: Pick<ContextLike, 'env'> & { req?: { url: string } }): boolean => {
  if (context.req?.url) {
    try {
      const requestUrl = new URL(context.req.url);
      if (LOCAL_DATABASE_HOSTS.has(normalizeHostname(requestUrl.hostname))) {
        return true;
      }
    } catch {
      // Ignore malformed request URLs and fall back to APP_BASE_URL detection.
    }
  }

  const configuredAppUrl = context.env.APP_BASE_URL?.trim();
  if (!configuredAppUrl) {
    return false;
  }

  try {
    return LOCAL_DATABASE_HOSTS.has(normalizeHostname(new URL(configuredAppUrl).hostname));
  } catch {
    return false;
  }
};

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

  if (shouldUsePerRequestDatabase(context)) {
    // Wrangler/workerd local dev can hang retained pg pools after auth/session requests.
    // Use a short-lived client for localhost flows and keep pooled reuse for deployed runtimes.
    const { client, db } = createDb(connection.connectionString, {
      enforceNeon: connection.source === 'database_url',
    });
    await client.connect();
    try {
      return await handler(db);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  const { db } = createRuntimeDb(connection.connectionString, {
    enforceNeon: connection.source === 'database_url',
  });
  return handler(db);
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

  const { db } = createRuntimeDb(connection.connectionString, {
    enforceNeon: connection.source === 'database_url',
  });
  return handler(db);
};
