import { Hono } from 'hono';
import { Client } from 'pg';

import { healthCheckSchema } from '@opencalendly/shared';

type HyperdriveBinding = {
  connectionString: string;
};

type Bindings = {
  HYPERDRIVE?: HyperdriveBinding;
  DATABASE_URL?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get('/health', (context) => {
  return context.json(healthCheckSchema.parse({ status: 'ok' }));
});

app.get('/v0/db/ping', async (context) => {
  const connectionString =
    context.env.HYPERDRIVE?.connectionString ?? context.env.DATABASE_URL?.trim() ?? '';

  if (!connectionString) {
    return context.json(
      {
        ok: false,
        error: 'Missing database connection string. Configure Hyperdrive or DATABASE_URL.',
      },
      500,
    );
  }

  const isLocal =
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1') ||
    connectionString.includes('host=/');

  const client = new Client({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const result = await client.query<{ now: string }>('select now()::text as now');
    return context.json({ ok: true, now: result.rows[0]?.now ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown database error';
    return context.json({ ok: false, error: message }, 500);
  } finally {
    await client.end();
  }
});

export default app;
