import { createHmac, timingSafeEqual } from 'node:crypto';

const STATE_VERSION = 'v1';

type CalendarOAuthStatePayload = {
  v: typeof STATE_VERSION;
  userId: string;
  provider: 'google';
  redirectUri: string;
  exp: number;
};

const toBase64Url = (value: string): string => {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const fromBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
};

const signPayload = (payload: string, secret: string): string => {
  return createHmac('sha256', secret).update(payload).digest('base64url');
};

export const createCalendarOAuthState = (input: {
  userId: string;
  provider: 'google';
  redirectUri: string;
  expiresAt: Date;
  secret: string;
}): string => {
  const payload: CalendarOAuthStatePayload = {
    v: STATE_VERSION,
    userId: input.userId,
    provider: input.provider,
    redirectUri: input.redirectUri,
    exp: Math.floor(input.expiresAt.getTime() / 1000),
  };

  const payloadEncoded = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(payloadEncoded, input.secret);
  return `${payloadEncoded}.${signature}`;
};

export const verifyCalendarOAuthState = (input: {
  token: string;
  secret: string;
  now: Date;
}): Omit<CalendarOAuthStatePayload, 'v'> | null => {
  const parts = input.token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const payloadEncoded = parts[0];
  const signature = parts[1];
  if (!payloadEncoded || !signature) {
    return null;
  }

  const expectedSignature = signPayload(payloadEncoded, input.secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(payloadEncoded)) as CalendarOAuthStatePayload;
    if (
      parsed.v !== STATE_VERSION ||
      parsed.provider !== 'google' ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.redirectUri !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }

    if (parsed.exp <= Math.floor(input.now.getTime() / 1000)) {
      return null;
    }

    return {
      userId: parsed.userId,
      provider: parsed.provider,
      redirectUri: parsed.redirectUri,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
};
