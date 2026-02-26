import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;

const toBase64Url = (value: Buffer): string => {
  return value
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const fromBase64Url = (value: string): Buffer => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
};

const deriveKey = (secret: string): Buffer => {
  if (!secret || secret.trim().length < 16) {
    throw new Error('Encryption secret must be at least 16 characters.');
  }
  return createHash('sha256').update(secret).digest();
};

export const encryptSecret = (plaintext: string, secret: string): string => {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, toBase64Url(iv), toBase64Url(tag), toBase64Url(encrypted)].join('.');
};

export const decryptSecret = (ciphertext: string, secret: string): string => {
  const [version, ivEncoded, tagEncoded, encryptedEncoded] = ciphertext.split('.');
  if (
    version !== VERSION ||
    !ivEncoded ||
    !tagEncoded ||
    !encryptedEncoded
  ) {
    throw new Error('Encrypted secret format is invalid.');
  }

  const key = deriveKey(secret);
  const iv = fromBase64Url(ivEncoded);
  const tag = fromBase64Url(tagEncoded);
  const encrypted = fromBase64Url(encryptedEncoded);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
};
