import { consumePersistedRateLimit, resolveRateLimitClientKey } from '../lib/rate-limit';
import {
  CLERK_EXCHANGE_RATE_LIMIT_MAX_REQUESTS_PER_IP,
  CLERK_EXCHANGE_RATE_LIMIT_WINDOW_MS,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_MIN_LENGTH,
  PUBLIC_ANALYTICS_RATE_LIMIT_MAX_REQUESTS_PER_IP,
  PUBLIC_ANALYTICS_RATE_LIMIT_MAX_REQUESTS_PER_SCOPE,
  PUBLIC_ANALYTICS_RATE_LIMIT_WINDOW_MS,
  PUBLIC_BOOKING_RATE_LIMIT_MAX_REQUESTS_PER_IP,
  PUBLIC_BOOKING_RATE_LIMIT_WINDOW_MS,
} from './env';
import type { Database } from './types';

export { resolveRateLimitClientKey };

export const isPublicAnalyticsRateLimited = async (
  db: Pick<Database, 'delete' | 'insert'>,
  input: { clientKey: string; username: string; eventSlug: string },
): Promise<boolean> => {
  const ipBucket = await consumePersistedRateLimit(db, {
    scope: 'public_analytics_ip',
    key: input.clientKey,
    maxRequests: PUBLIC_ANALYTICS_RATE_LIMIT_MAX_REQUESTS_PER_IP,
    windowMs: PUBLIC_ANALYTICS_RATE_LIMIT_WINDOW_MS,
  });
  if (ipBucket.limited) {
    return true;
  }

  const scopedBucket = await consumePersistedRateLimit(db, {
    scope: 'public_analytics_scope',
    key: `${input.clientKey}|${input.username}|${input.eventSlug}`,
    maxRequests: PUBLIC_ANALYTICS_RATE_LIMIT_MAX_REQUESTS_PER_SCOPE,
    windowMs: PUBLIC_ANALYTICS_RATE_LIMIT_WINDOW_MS,
  });
  return scopedBucket.limited;
};

export const isPublicBookingRateLimited = async (
  db: Pick<Database, 'delete' | 'insert'>,
  input: { clientKey: string; scope: string; perScopeLimit: number },
): Promise<boolean> => {
  const ipBucket = await consumePersistedRateLimit(db, {
    scope: 'public_booking_ip',
    key: input.clientKey,
    maxRequests: PUBLIC_BOOKING_RATE_LIMIT_MAX_REQUESTS_PER_IP,
    windowMs: PUBLIC_BOOKING_RATE_LIMIT_WINDOW_MS,
  });
  if (ipBucket.limited) {
    return true;
  }

  const scopedBucket = await consumePersistedRateLimit(db, {
    scope: 'public_booking_scope',
    key: `${input.clientKey}|${input.scope}`,
    maxRequests: input.perScopeLimit,
    windowMs: PUBLIC_BOOKING_RATE_LIMIT_WINDOW_MS,
  });
  return scopedBucket.limited;
};

export const isClerkExchangeRateLimited = async (
  db: Pick<Database, 'delete' | 'insert'>,
  input: { clientKey: string },
): Promise<boolean> => {
  const ipBucket = await consumePersistedRateLimit(db, {
    scope: 'clerk_exchange_ip',
    key: input.clientKey,
    maxRequests: CLERK_EXCHANGE_RATE_LIMIT_MAX_REQUESTS_PER_IP,
    windowMs: CLERK_EXCHANGE_RATE_LIMIT_WINDOW_MS,
  });
  return ipBucket.limited;
};

export const parseIdempotencyKey = (request: Request): { key: string } | { error: string } => {
  const rawKey = request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim();
  if (!rawKey) {
    return { error: `${IDEMPOTENCY_KEY_HEADER} header is required.` };
  }
  if (rawKey.length < IDEMPOTENCY_KEY_MIN_LENGTH || rawKey.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    return {
      error: `${IDEMPOTENCY_KEY_HEADER} must be between ${IDEMPOTENCY_KEY_MIN_LENGTH} and ${IDEMPOTENCY_KEY_MAX_LENGTH} characters.`,
    };
  }
  return { key: rawKey };
};
