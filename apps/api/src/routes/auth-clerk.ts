import { eq } from 'drizzle-orm';
import { createClerkClient, verifyToken } from '@clerk/backend';

import { users } from '@opencalendly/db';
import { clerkAuthExchangeRequestSchema } from '@opencalendly/shared';

import { createRawToken, hashToken } from '../lib/auth';
import {
  deriveUsernameSeedFromEmail,
  resolveDisplayName,
  resolveUniqueUsername,
} from '../lib/clerk-auth';
import { issueSessionForUser, withIssuedSessionCookie } from '../server/auth-session';
import { normalizeTimezone, jsonError } from '../server/core';
import { withDatabase, isUniqueViolation } from '../server/database';
import {
  resolveClerkAllowedAudiences,
  resolveClerkAuthorizedParties,
  resolveClerkSecretKey,
} from '../server/env';
import { isClerkExchangeRateLimited, resolveRateLimitClientKey } from '../server/rate-limit';
import type { ApiApp, SessionUserRecord } from '../server/types';

const CLERK_USER_LOOKUP_MAX_ATTEMPTS = 3;
const CLERK_USER_LOOKUP_RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

const resolveLookupErrorStatus = (error: unknown): number | null => {
  if (
    typeof error === 'object' &&
    error &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
  ) {
    return (error as { status: number }).status;
  }
  return null;
};

export const registerClerkAuthRoutes = (app: ApiApp): void => {
  app.post('/v0/auth/clerk/exchange', async (context) => {
    return withDatabase(context, async (db) => {
      const clientKey = resolveRateLimitClientKey(context.req.raw);
      if (await isClerkExchangeRateLimited(db, { clientKey })) {
        console.warn('clerk_exchange_rate_limited', { ipHash: hashToken(clientKey) });
        return jsonError(context, 429, 'Too many requests. Please retry shortly.');
      }

      const clerkSecretKey = resolveClerkSecretKey(context.env);
      if (!clerkSecretKey) {
        return jsonError(context, 503, 'Clerk is not configured on the API runtime.');
      }

      const body = await context.req.json().catch(() => null);
      const parsed = clerkAuthExchangeRequestSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
      }

      let clerkUserId = '';
      let authorizedParties: string[] = [];
      try {
        authorizedParties = resolveClerkAuthorizedParties(context.env);
      } catch (error) {
        return jsonError(
          context,
          500,
          error instanceof Error
            ? error.message
            : 'APP_BASE_URL must be a valid absolute URL when Clerk auth is enabled.',
        );
      }

      try {
        const audiences = resolveClerkAllowedAudiences(context.env);
        const tokenPayload = await verifyToken(parsed.data.clerkToken, {
          secretKey: clerkSecretKey,
          clockSkewInMs: 10_000,
          ...(audiences.length > 0 ? { audience: audiences } : {}),
          authorizedParties,
        });
        clerkUserId = tokenPayload.sub ?? '';
      } catch (error) {
        const reason =
          typeof error === 'object' &&
          error !== null &&
          'reason' in error &&
          typeof (error as { reason?: unknown }).reason === 'string'
            ? (error as { reason: string }).reason
            : null;
        const authFailureReasons = new Set([
          'TokenExpired',
          'TokenInvalid',
          'TokenInvalidAlgorithm',
          'TokenInvalidAuthorizedParties',
          'TokenInvalidSignature',
          'TokenNotActiveYet',
          'TokenIatInTheFuture',
        ]);
        const upstreamFailureReasons = new Set([
          'InvalidSecretKey',
          'RemoteJWKFailedToLoad',
          'RemoteJWKInvalid',
          'RemoteJWKMissing',
          'LocalJWKMissing',
          'JWKFailedToResolve',
          'JWKKidMismatch',
          'TokenVerificationFailed',
        ]);

        if (reason && upstreamFailureReasons.has(reason)) {
          console.error('clerk_token_verification_failed', {
            reason,
            error: error instanceof Error ? error.message : 'unknown',
          });
          return jsonError(context, 502, 'Unable to verify Clerk token due to upstream dependency error.');
        }

        if (!reason || authFailureReasons.has(reason)) {
          return jsonError(context, 401, 'Invalid or expired Clerk token.');
        }

        return jsonError(context, 401, 'Invalid Clerk token.');
      }

      if (!clerkUserId) {
        return jsonError(context, 401, 'Invalid Clerk token payload.');
      }

      const clerkClient = createClerkClient({ secretKey: clerkSecretKey });
      let clerkUser: Awaited<ReturnType<(typeof clerkClient.users)['getUser']>> | null = null;
      let clerkLookupError: unknown = null;

      for (let attempt = 1; attempt <= CLERK_USER_LOOKUP_MAX_ATTEMPTS; attempt += 1) {
        try {
          clerkUser = await clerkClient.users.getUser(clerkUserId);
          break;
        } catch (error) {
          clerkLookupError = error;
          const status = resolveLookupErrorStatus(error);
          if (status === 404) {
            return jsonError(context, 401, 'Unable to resolve Clerk user profile.');
          }

          const retryable = status ? CLERK_USER_LOOKUP_RETRYABLE_STATUS_CODES.has(status) : true;
          if (!retryable || attempt >= CLERK_USER_LOOKUP_MAX_ATTEMPTS) {
            break;
          }

          const baseDelayMs = 200;
          const maxDelayMs = 1_600;
          const backoffDelayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
          const jitterMs = Math.floor(Math.random() * 120);
          await new Promise<void>((resolve) => setTimeout(resolve, backoffDelayMs + jitterMs));
        }
      }

      if (!clerkUser && clerkLookupError) {
        const status = resolveLookupErrorStatus(clerkLookupError);
        console.error('clerk_user_lookup_failed', {
          clerkUserIdHash: hashToken(clerkUserId),
          attempts: CLERK_USER_LOOKUP_MAX_ATTEMPTS,
          status,
          error: clerkLookupError instanceof Error ? clerkLookupError.message : 'unknown',
        });
        return jsonError(context, 502, 'Upstream dependency error contacting Clerk.');
      }

      if (!clerkUser) {
        return jsonError(context, 401, 'Unable to resolve Clerk user profile.');
      }

      const primaryEmail =
        clerkUser.emailAddresses.find((emailAddress) => emailAddress.id === clerkUser.primaryEmailAddressId) ??
        clerkUser.emailAddresses.find((emailAddress) => Boolean(emailAddress.emailAddress?.trim()));
      const email = primaryEmail?.emailAddress?.trim().toLowerCase();
      if (!email) {
        return jsonError(context, 400, 'Clerk user is missing a primary email.');
      }
      if (primaryEmail?.verification?.status !== 'verified') {
        return jsonError(context, 403, 'Email must be verified to create a session.');
      }

      const requestedTimezone = parsed.data.timezone ? normalizeTimezone(parsed.data.timezone) : null;
      const preferredUsername =
        parsed.data.username?.trim().toLowerCase() ||
        clerkUser.username?.trim().toLowerCase() ||
        deriveUsernameSeedFromEmail(email);
      const resolvedDisplayName = resolveDisplayName({
        providedDisplayName: parsed.data.displayName,
        clerkFirstName: clerkUser.firstName,
        clerkLastName: clerkUser.lastName,
        email,
      });

      const [existing] = await db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          displayName: users.displayName,
          timezone: users.timezone,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      let userRecord: SessionUserRecord | null = null;
      if (existing) {
        const nextDisplayName = parsed.data.displayName ? resolvedDisplayName : existing.displayName;
        const nextTimezone = requestedTimezone ?? existing.timezone;
        if (nextDisplayName !== existing.displayName || nextTimezone !== existing.timezone) {
          await db
            .update(users)
            .set({ displayName: nextDisplayName, timezone: nextTimezone })
            .where(eq(users.id, existing.id));
        }
        userRecord = {
          id: existing.id,
          email: existing.email,
          username: existing.username,
          displayName: nextDisplayName,
          timezone: normalizeTimezone(nextTimezone),
        };
      } else {
        const timezone = requestedTimezone ?? 'UTC';
        for (let attempt = 0; attempt < 20 && !userRecord; attempt += 1) {
          const candidateSeed =
            attempt === 0 ? preferredUsername : `${preferredUsername}-${createRawToken().slice(0, 4)}`;
          let username = '';
          try {
            username = await resolveUniqueUsername({
              preferredCandidate: candidateSeed,
              email,
              isUsernameTaken: async (candidate) => {
                const [existingWithUsername] = await db
                  .select({ id: users.id })
                  .from(users)
                  .where(eq(users.username, candidate))
                  .limit(1);
                return Boolean(existingWithUsername);
              },
            });
          } catch (error) {
            console.error('clerk_username_resolution_failed', {
              preferredUsername,
              emailDomain: email.split('@')[1] ?? 'unknown',
              attempt,
              error: error instanceof Error ? error.message : 'unknown',
            });
            return jsonError(context, 503, 'Unable to provision account username. Please retry.');
          }

          try {
            const [inserted] = await db
              .insert(users)
              .values({ email, username, displayName: resolvedDisplayName, timezone })
              .returning({
                id: users.id,
                email: users.email,
                username: users.username,
                displayName: users.displayName,
                timezone: users.timezone,
              });

            if (inserted) {
              userRecord = { ...inserted, timezone: normalizeTimezone(inserted.timezone) };
            }
          } catch (error) {
            if (!isUniqueViolation(error)) {
              throw error;
            }

            if (isUniqueViolation(error, 'users_username_unique')) {
              continue;
            }

            const [retried] = await db
              .select({
                id: users.id,
                email: users.email,
                username: users.username,
                displayName: users.displayName,
                timezone: users.timezone,
              })
              .from(users)
              .where(eq(users.email, email))
              .limit(1);
            if (retried) {
              userRecord = { ...retried, timezone: normalizeTimezone(retried.timezone) };
              break;
            }
          }
        }
      }

      if (!userRecord) {
        return jsonError(context, 500, 'Unable to create or resolve user account.');
      }

      const issuedSession = await issueSessionForUser(db, userRecord);
      if (!issuedSession) {
        return jsonError(context, 500, 'Unable to create session.');
      }

      return withIssuedSessionCookie(
        context.json({
          ok: true,
          expiresAt: issuedSession.expiresAt.toISOString(),
          user: issuedSession.user,
        }),
        {
          request: context.req.raw,
          env: context.env,
          sessionToken: issuedSession.sessionToken,
          expiresAt: issuedSession.expiresAt,
        },
      );
    });
  });
};
