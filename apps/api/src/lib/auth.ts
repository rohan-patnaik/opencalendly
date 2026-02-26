import { createHash, createHmac, randomBytes } from 'node:crypto';

export const MAGIC_LINK_TTL_MINUTES = 15;
export const SESSION_TTL_DAYS = 30;

export const createRawToken = (): string => {
  return randomBytes(32).toString('hex');
};

export const hashToken = (token: string): string => {
  return createHash('sha256').update(token).digest('hex');
};

export const hmacToken = (token: string, secret: string): string => {
  return createHmac('sha256', secret).update(token).digest('hex');
};

export const getBearerToken = (request: Request): string | null => {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return null;
  }

  const [scheme, value] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) {
    return null;
  }

  return value.trim();
};
