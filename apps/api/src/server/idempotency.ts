import { and, eq, lte } from 'drizzle-orm';

import { idempotencyRequests } from '@opencalendly/db';
import type { DemoFeatureKey } from '../lib/demo-credits';
import { hashToken } from '../lib/auth';
import { isUniqueViolation } from './database';
import {
  IDEMPOTENCY_COMPLETED_TTL_HOURS,
  IDEMPOTENCY_EXPIRED_CLEANUP_INTERVAL,
  IDEMPOTENCY_IN_PROGRESS_TTL_MINUTES,
} from './env';
import type { Database, IdempotencyScope } from './types';

let idempotencyCleanupRequestCounter = 0;

type IdempotencyClaimResult =
  | { state: 'claimed'; keyHash: string }
  | {
      state: 'replay';
      statusCode: 200 | 400 | 404 | 409 | 410 | 500;
      responseBody: Record<string, unknown>;
    }
  | { state: 'mismatch' }
  | { state: 'in_progress' };

export const toCanonicalJson = (value: unknown): string => {
  const normalize = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map(normalize);
    }
    if (node && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return node;
  };

  return JSON.stringify(normalize(value));
};

export const hashIdempotencyRequestPayload = (input: Record<string, unknown>): string => {
  return hashToken(toCanonicalJson(input));
};

export const buildDemoFeatureSourceKey = (
  featureKey: DemoFeatureKey,
  payload: Record<string, unknown>,
): string => {
  return `${featureKey}:${hashIdempotencyRequestPayload(payload)}`;
};

const buildInProgressIdempotencyExpiry = (from: Date): Date => {
  return new Date(from.getTime() + IDEMPOTENCY_IN_PROGRESS_TTL_MINUTES * 60_000);
};

const buildCompletedIdempotencyExpiry = (from: Date): Date => {
  return new Date(from.getTime() + IDEMPOTENCY_COMPLETED_TTL_HOURS * 60 * 60 * 1000);
};

const maybeCleanupExpiredIdempotencyRequests = async (
  db: Database,
  now: Date,
): Promise<void> => {
  idempotencyCleanupRequestCounter += 1;
  if (idempotencyCleanupRequestCounter % IDEMPOTENCY_EXPIRED_CLEANUP_INTERVAL !== 0) {
    return;
  }

  await db.delete(idempotencyRequests).where(lte(idempotencyRequests.expiresAt, now));
};

export const claimIdempotencyRequest = async (
  db: Database,
  input: {
    scope: IdempotencyScope;
    rawKey: string;
    requestHash: string;
    now?: Date;
  },
): Promise<IdempotencyClaimResult> => {
  const now = input.now ?? new Date();
  const keyHash = hashToken(input.rawKey);
  const expiresAt = buildInProgressIdempotencyExpiry(now);

  await maybeCleanupExpiredIdempotencyRequests(db, now);

  try {
    await db.insert(idempotencyRequests).values({
      scope: input.scope,
      idempotencyKeyHash: keyHash,
      requestHash: input.requestHash,
      status: 'in_progress',
      expiresAt,
    });
    return { state: 'claimed', keyHash };
  } catch (error) {
    if (!isUniqueViolation(error, 'idempotency_requests_scope_key_hash_unique')) {
      throw error;
    }
  }

  const [existing] = await db
    .select({
      requestHash: idempotencyRequests.requestHash,
      status: idempotencyRequests.status,
      responseStatusCode: idempotencyRequests.responseStatusCode,
      responseBody: idempotencyRequests.responseBody,
      expiresAt: idempotencyRequests.expiresAt,
    })
    .from(idempotencyRequests)
    .where(
      and(
        eq(idempotencyRequests.scope, input.scope),
        eq(idempotencyRequests.idempotencyKeyHash, keyHash),
      ),
    )
    .limit(1);

  if (!existing) {
    return { state: 'in_progress' };
  }

  if (existing.expiresAt.getTime() <= now.getTime()) {
    await db
      .delete(idempotencyRequests)
      .where(
        and(
          eq(idempotencyRequests.scope, input.scope),
          eq(idempotencyRequests.idempotencyKeyHash, keyHash),
          lte(idempotencyRequests.expiresAt, now),
        ),
      );

    try {
      await db.insert(idempotencyRequests).values({
        scope: input.scope,
        idempotencyKeyHash: keyHash,
        requestHash: input.requestHash,
        status: 'in_progress',
        expiresAt,
      });
      return { state: 'claimed', keyHash };
    } catch (error) {
      if (isUniqueViolation(error, 'idempotency_requests_scope_key_hash_unique')) {
        return { state: 'in_progress' };
      }
      throw error;
    }
  }

  if (existing.requestHash !== input.requestHash) {
    return { state: 'mismatch' };
  }

  const responseStatusCode = existing.responseStatusCode;
  const isReplayStatusCode =
    responseStatusCode === 200 ||
    responseStatusCode === 400 ||
    responseStatusCode === 404 ||
    responseStatusCode === 409 ||
    responseStatusCode === 410 ||
    responseStatusCode === 500;
  if (
    existing.status === 'completed' &&
    isReplayStatusCode &&
    existing.responseBody &&
    typeof existing.responseBody === 'object' &&
    !Array.isArray(existing.responseBody)
  ) {
    return {
      state: 'replay',
      statusCode: responseStatusCode,
      responseBody: existing.responseBody as Record<string, unknown>,
    };
  }

  return { state: 'in_progress' };
};

export const completeIdempotencyRequest = async (
  db: Database,
  input: {
    scope: IdempotencyScope;
    keyHash: string;
    statusCode: 200 | 400 | 404 | 409 | 410 | 500;
    responseBody: Record<string, unknown>;
    now?: Date;
  },
): Promise<void> => {
  const now = input.now ?? new Date();
  await db
    .update(idempotencyRequests)
    .set({
      status: 'completed',
      responseStatusCode: input.statusCode,
      responseBody: input.responseBody,
      completedAt: now,
      expiresAt: buildCompletedIdempotencyExpiry(now),
    })
    .where(
      and(
        eq(idempotencyRequests.scope, input.scope),
        eq(idempotencyRequests.idempotencyKeyHash, input.keyHash),
        eq(idempotencyRequests.status, 'in_progress'),
      ),
    );
};

export const releaseIdempotencyRequest = async (
  db: Database,
  input: { scope: IdempotencyScope; keyHash: string },
): Promise<void> => {
  await db
    .delete(idempotencyRequests)
    .where(
      and(
        eq(idempotencyRequests.scope, input.scope),
        eq(idempotencyRequests.idempotencyKeyHash, input.keyHash),
        eq(idempotencyRequests.status, 'in_progress'),
      ),
    );
};
