import { and, eq, isNull, isNotNull } from 'drizzle-orm';

import { createDb, webhookSubscriptions } from '@opencalendly/db';

import { createWebhookSecretValues } from '../apps/api/src/server/webhook-secret-storage';
import type { Bindings } from '../apps/api/src/server/types';

const main = async (): Promise<void> => {
  const { client, db } = createDb();
  const env = process.env as Bindings;

  try {
    await client.connect();

    const rows = await db
      .select({
        id: webhookSubscriptions.id,
        secret: webhookSubscriptions.secret,
      })
      .from(webhookSubscriptions)
      .where(and(isNotNull(webhookSubscriptions.secret), isNull(webhookSubscriptions.secretEncrypted)));

    if (rows.length === 0) {
      console.log('No plaintext webhook secrets found.');
      return;
    }

    for (const row of rows) {
      if (!row.secret) {
        continue;
      }

      await db
        .update(webhookSubscriptions)
        .set({
          ...createWebhookSecretValues(row.secret, env),
          updatedAt: new Date(),
        })
        .where(eq(webhookSubscriptions.id, row.id));
    }

    console.log(`Encrypted ${rows.length} webhook secret${rows.length === 1 ? '' : 's'}.`);
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Failed to encrypt webhook secrets.');
  process.exit(1);
});
