import { lte, sql } from 'drizzle-orm';

import { createDb, requestRateLimits } from '@opencalendly/db';

import { hashToken } from './auth';

const createDbTypeAnchor = createDb;
void createDbTypeAnchor;

type Database = ReturnType<typeof createDbTypeAnchor>['db'];

export type RateLimitDb = Pick<Database, 'delete' | 'insert'>;

const DEFAULT_WINDOW_MS = 60_000;
const MIN_RETENTION_MS = 60 * 60_000;
const RATE_LIMIT_CLEANUP_INTERVAL = 50;

let cleanupRequestCounter = 0;

const parseHeaderIp = (value: string | null): string | null => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toLowerCase() === 'unknown') {
    return null;
  }
  return trimmed;
};

const parseForwardedForHeader = (value: string | null): string | null => {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }

  for (const part of raw.split(',')) {
    const candidate = part.trim();
    if (!candidate || candidate.toLowerCase() === 'unknown') {
      continue;
    }
    return candidate;
  }

  return null;
};

const parseForwardedHeader = (value: string | null): string | null => {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }

  const match = raw.match(/for=(?:"?\[?)([^;,\]"]+)/i);
  if (!match?.[1]) {
    return null;
  }

  const candidate = match[1].trim();
  if (!candidate || candidate.toLowerCase() === 'unknown') {
    return null;
  }

  return candidate;
};

export const resolveRateLimitClientKey = (request: Request): string => {
  const directHeaderIp =
    parseHeaderIp(request.headers.get('cf-connecting-ip')) ??
    parseHeaderIp(request.headers.get('true-client-ip')) ??
    parseHeaderIp(request.headers.get('x-real-ip'));

  if (directHeaderIp) {
    return directHeaderIp;
  }

  const forwardedIp =
    parseForwardedForHeader(request.headers.get('x-forwarded-for')) ??
    parseForwardedHeader(request.headers.get('forwarded'));

  if (forwardedIp) {
    return forwardedIp;
  }

  const userAgent = request.headers.get('user-agent')?.trim();
  if (userAgent) {
    return `ua:${hashToken(userAgent).slice(0, 16)}`;
  }

  return 'unknown';
};

const toWindowStartsAt = (now: Date, windowMs: number): Date => {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
};

const resolveRetentionMs = (windowMs: number): number => {
  return Math.max(MIN_RETENTION_MS, windowMs * 120);
};

const maybeCleanupExpiredRateLimits = async (
  db: RateLimitDb,
  now: Date,
  windowMs: number,
): Promise<void> => {
  cleanupRequestCounter += 1;
  if (cleanupRequestCounter % RATE_LIMIT_CLEANUP_INTERVAL !== 0) {
    return;
  }

  const retentionMs = resolveRetentionMs(windowMs);
  const cutoff = new Date(now.getTime() - retentionMs);

  await db.delete(requestRateLimits).where(lte(requestRateLimits.windowStartsAt, cutoff));
};

export const consumePersistedRateLimit = async (
  db: RateLimitDb,
  input: {
    scope: string;
    key: string;
    maxRequests: number;
    now?: Date;
    windowMs?: number;
  },
): Promise<{ limited: boolean; count: number }> => {
  const now = input.now ?? new Date();
  const windowMs = input.windowMs ?? DEFAULT_WINDOW_MS;
  const windowStartsAt = toWindowStartsAt(now, windowMs);
  const keyHash = hashToken(input.key);

  await maybeCleanupExpiredRateLimits(db, now, windowMs);

  const [result] = await db
    .insert(requestRateLimits)
    .values({
      scope: input.scope,
      keyHash,
      windowStartsAt,
      count: 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        requestRateLimits.scope,
        requestRateLimits.keyHash,
        requestRateLimits.windowStartsAt,
      ],
      set: {
        count: sql`${requestRateLimits.count} + 1`,
        updatedAt: now,
      },
    })
    .returning({
      count: requestRateLimits.count,
    });

  const count = result?.count ?? 1;

  return {
    limited: count > input.maxRequests,
    count,
  };
};
