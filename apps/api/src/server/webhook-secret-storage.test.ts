import { describe, expect, it } from 'vitest';

import type { Bindings } from './types';
import {
  createWebhookSecretValues,
  resolveWebhookSigningSecret,
  webhookSecretStorageErrors,
} from './webhook-secret-storage';

const createBindings = (overrides: Partial<Bindings> = {}): Bindings =>
  ({
    SESSION_SECRET: '0123456789abcdef0123456789abcdef',
    ...overrides,
  }) as Bindings;

describe('webhook secret storage', () => {
  it('encrypts newly stored webhook secrets', () => {
    const stored = createWebhookSecretValues('whsec_super_secret', createBindings());

    expect(stored.secret).toBeNull();
    expect(stored.secretEncrypted).toContain('v1.');
  });

  it('decrypts encrypted webhook secrets for delivery', () => {
    const env = createBindings();
    const stored = createWebhookSecretValues('whsec_super_secret', env);

    expect(
      resolveWebhookSigningSecret(
        {
          secret: null,
          secretEncrypted: stored.secretEncrypted,
        },
        env,
      ),
    ).toEqual({
      secret: 'whsec_super_secret',
      migratedEncrypted: null,
    });
  });

  it('returns plaintext secrets and flags them for migration', () => {
    const env = createBindings();
    const resolved = resolveWebhookSigningSecret(
      {
        secret: 'whsec_legacy_secret',
        secretEncrypted: null,
      },
      env,
    );

    expect(resolved.secret).toBe('whsec_legacy_secret');
    expect(resolved.migratedEncrypted).toContain('v1.');
  });

  it('rejects encrypted secrets when no encryption key is configured', () => {
    const encrypted = createWebhookSecretValues('whsec_super_secret', createBindings());

    expect(() =>
      resolveWebhookSigningSecret(
        {
          secret: null,
          secretEncrypted: encrypted.secretEncrypted,
        },
        {} as Bindings,
      ),
    ).toThrow(webhookSecretStorageErrors.encryptionConfig);
  });
});
