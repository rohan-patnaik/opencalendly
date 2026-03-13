import { and, eq, gt, lte, sql } from 'drizzle-orm';

import { sessions, users } from '@opencalendly/db';

import { SESSION_TTL_DAYS, createRawToken, getBearerToken, hashToken } from '../lib/auth';
import { normalizeTimezone } from './core';
import { SESSION_EXPIRED_CLEANUP_INTERVAL } from './env';
import type { AuthenticatedUser, Database, SessionUserRecord } from './types';

let sessionCleanupRequestCounter = 0;

const maybeCleanupExpiredSessions = async (db: Database, now: Date): Promise<void> => {
  sessionCleanupRequestCounter += 1;
  if (sessionCleanupRequestCounter % SESSION_EXPIRED_CLEANUP_INTERVAL !== 0) {
    return;
  }

  await db.delete(sessions).where(lte(sessions.expiresAt, now));
};

export const resolveAuthenticatedUser = async (
  db: Database,
  request: Request,
): Promise<AuthenticatedUser | null> => {
  const token = getBearerToken(request);
  if (!token) {
    return null;
  }

  const now = new Date();
  await maybeCleanupExpiredSessions(db, now);

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      timezone: users.timezone,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.displayName,
    timezone: normalizeTimezone(row.timezone),
  };
};

export const issueSessionForUser = async (
  db: Database,
  userRecord: SessionUserRecord,
): Promise<{ sessionToken: string; expiresAt: Date; user: SessionUserRecord } | null> => {
  const now = new Date();
  await maybeCleanupExpiredSessions(db, now);

  const sessionToken = createRawToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const insertedSession = await db.transaction(async (transaction) => {
    const lockedUser = await transaction.execute<{ id: string }>(
      sql`select id from users where id = ${userRecord.id} for update`,
    );
    if (!lockedUser.rows[0]) {
      return null;
    }

    await transaction.delete(sessions).where(eq(sessions.userId, userRecord.id));
    const [inserted] = await transaction
      .insert(sessions)
      .values({
        userId: userRecord.id,
        tokenHash: hashToken(sessionToken),
        expiresAt,
      })
      .returning({ id: sessions.id });

    return inserted ?? null;
  });

  return insertedSession
    ? {
        sessionToken,
        expiresAt,
        user: { ...userRecord, timezone: normalizeTimezone(userRecord.timezone) },
      }
    : null;
};
