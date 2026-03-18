import { and, eq, gt, lte, sql } from 'drizzle-orm';

import { sessions, users } from '@opencalendly/db';

import { SESSION_TTL_DAYS, createRawToken, getBearerToken, hashToken } from '../lib/auth';
import { normalizeTimezone } from './core';
import { SESSION_EXPIRED_CLEANUP_INTERVAL } from './env';
import type { AuthenticatedUser, Bindings, Database, SessionUserRecord } from './types';

let sessionCleanupRequestCounter = 0;
export const API_SESSION_COOKIE_NAME = 'opencalendly_session';
const SESSION_COOKIE_PATH = '/';

const parseCookieHeader = (request: Request): Map<string, string> => {
  const cookies = new Map<string, string>();
  const rawCookieHeader = request.headers.get('cookie');
  if (!rawCookieHeader) {
    return cookies;
  }

  for (const part of rawCookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!name || !value) {
      continue;
    }

    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      cookies.set(name, value);
    }
  }

  return cookies;
};

const isLocalHostname = (hostname: string): boolean => {
  const normalized = hostname.trim().toLowerCase().replace(/^\[(.*)\]$/, '$1');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
};

export const shouldUseSecureSessionCookie = (request: Request, env: Bindings): boolean => {
  const configuredAppUrl = env.APP_BASE_URL?.trim();
  if (configuredAppUrl) {
    try {
      const appUrl = new URL(configuredAppUrl);
      if (isLocalHostname(appUrl.hostname)) {
        return false;
      }
      return appUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }

  const requestUrl = new URL(request.url);
  if (isLocalHostname(requestUrl.hostname)) {
    return false;
  }
  return requestUrl.protocol === 'https:';
};

export const buildSessionCookieHeader = (input: {
  request: Request;
  env: Bindings;
  value: string;
  expiresAt: Date;
}): string => {
  const segments = [
    `${API_SESSION_COOKIE_NAME}=${encodeURIComponent(input.value)}`,
    `Path=${SESSION_COOKIE_PATH}`,
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${input.expiresAt.toUTCString()}`,
    `Max-Age=${Math.max(0, Math.floor((input.expiresAt.getTime() - Date.now()) / 1000))}`,
  ];

  if (shouldUseSecureSessionCookie(input.request, input.env)) {
    segments.push('Secure');
  }

  return segments.join('; ');
};

const appendSetCookieHeader = (response: Response, cookieValue: string): Response => {
  response.headers.append('Set-Cookie', cookieValue);
  return response;
};

const maybeCleanupExpiredSessions = async (db: Database, now: Date): Promise<void> => {
  sessionCleanupRequestCounter += 1;
  if (sessionCleanupRequestCounter % SESSION_EXPIRED_CLEANUP_INTERVAL !== 0) {
    return;
  }

  await db.delete(sessions).where(lte(sessions.expiresAt, now));
};

export const resolveSessionToken = (request: Request): string | null => {
  const bearerToken = getBearerToken(request);
  if (bearerToken) {
    return bearerToken;
  }

  return parseCookieHeader(request).get(API_SESSION_COOKIE_NAME) ?? null;
};

export const hasSessionCookie = (request: Request): boolean => {
  return parseCookieHeader(request).has(API_SESSION_COOKIE_NAME);
};

export const resolveAuthenticatedUser = async (
  db: Database,
  request: Request,
): Promise<AuthenticatedUser | null> => {
  const token = resolveSessionToken(request);
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

export const withIssuedSessionCookie = (
  response: Response,
  input: { request: Request; env: Bindings; sessionToken: string; expiresAt: Date },
): Response => {
  return appendSetCookieHeader(
    response,
    buildSessionCookieHeader({
      request: input.request,
      env: input.env,
      value: input.sessionToken,
      expiresAt: input.expiresAt,
    }),
  );
};

export const clearIssuedSessionCookie = (
  response: Response,
  input: { request: Request; env: Bindings },
): Response => {
  return appendSetCookieHeader(
    response,
    buildSessionCookieHeader({
      request: input.request,
      env: input.env,
      value: '',
      expiresAt: new Date(0),
    }),
  );
};

export const revokeSession = async (db: Database, request: Request): Promise<void> => {
  const token = resolveSessionToken(request);
  if (!token) {
    return;
  }

  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
};
