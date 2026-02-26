import { describe, expect, it } from 'vitest';

import { decryptSecret, encryptSecret } from './calendar-crypto';

describe('calendar-crypto', () => {
  it('round-trips encrypted secrets', () => {
    const secret = 'open-calendly-secret-key-for-tests';
    const encrypted = encryptSecret('refresh-token-value', secret);
    const decrypted = decryptSecret(encrypted, secret);

    expect(encrypted).not.toContain('refresh-token-value');
    expect(decrypted).toBe('refresh-token-value');
  });

  it('fails to decrypt with wrong secret', () => {
    const encrypted = encryptSecret('access-token-value', 'correct-secret-value-1234');

    expect(() => decryptSecret(encrypted, 'wrong-secret-value-12345')).toThrow();
  });
});
