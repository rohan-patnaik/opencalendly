import { eq } from 'drizzle-orm';

import { webhookSubscriptions } from '@opencalendly/db';

import { decryptSecret, encryptSecret } from '../lib/calendar-crypto';
import { resolveWebhookEncryptionSecret } from './env';
import type { Bindings, Database } from './types';

type StoredWebhookSecret = {
  id: string;
  secret: string | null;
  secretEncrypted: string | null;
};

const MISSING_SECRET_ERROR = 'Webhook subscription secret is missing.';
const ENCRYPTION_CONFIG_ERROR =
  'Webhook secret encryption is not configured. Set WEBHOOK_SECRET_ENCRYPTION_KEY or SESSION_SECRET.';
const DECRYPTION_ERROR =
  'Webhook subscription secret could not be decrypted with the configured encryption key.';

export const createWebhookSecretValues = (
  plaintext: string,
  env: Bindings,
): { secret: null; secretEncrypted: string } => {
  const encryptionSecret = resolveWebhookEncryptionSecret(env);
  if (!encryptionSecret) {
    throw new Error(ENCRYPTION_CONFIG_ERROR);
  }

  return {
    secret: null,
    secretEncrypted: encryptSecret(plaintext, encryptionSecret),
  };
};

export const resolveWebhookSigningSecret = (
  value: Omit<StoredWebhookSecret, 'id'>,
  env: Bindings,
): { secret: string; migratedEncrypted: string | null } => {
  if (value.secretEncrypted) {
    const encryptionSecret = resolveWebhookEncryptionSecret(env);
    if (!encryptionSecret) {
      throw new Error(ENCRYPTION_CONFIG_ERROR);
    }

    try {
      return {
        secret: decryptSecret(value.secretEncrypted, encryptionSecret),
        migratedEncrypted: null,
      };
    } catch {
      throw new Error(DECRYPTION_ERROR);
    }
  }

  if (!value.secret) {
    throw new Error(MISSING_SECRET_ERROR);
  }

  const encryptionSecret = resolveWebhookEncryptionSecret(env);
  return {
    secret: value.secret,
    migratedEncrypted: encryptionSecret ? encryptSecret(value.secret, encryptionSecret) : null,
  };
};

export const migrateWebhookSecretIfNeeded = async (
  db: Database,
  env: Bindings,
  value: StoredWebhookSecret,
): Promise<string> => {
  const resolved = resolveWebhookSigningSecret(
    {
      secret: value.secret,
      secretEncrypted: value.secretEncrypted,
    },
    env,
  );

  if (!resolved.migratedEncrypted) {
    return resolved.secret;
  }

  await db
    .update(webhookSubscriptions)
    .set({
      secret: null,
      secretEncrypted: resolved.migratedEncrypted,
      updatedAt: new Date(),
    })
    .where(eq(webhookSubscriptions.id, value.id));

  return resolved.secret;
};

export const webhookSecretStorageErrors = {
  missingSecret: MISSING_SECRET_ERROR,
  encryptionConfig: ENCRYPTION_CONFIG_ERROR,
  decryption: DECRYPTION_ERROR,
};
