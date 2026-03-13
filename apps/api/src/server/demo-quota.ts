import { and, eq, sql } from 'drizzle-orm';

import {
  demoAccountDailyUsage,
  demoAdmissionsDaily,
  demoCreditEvents,
} from '@opencalendly/db';

import {
  buildDemoAccountStatus,
  buildDemoAdmissionsStatus,
  buildDemoQuotaStatus,
  getDemoFeatureCost,
  isLaunchDemoTeamSlug,
  isLaunchDemoUsername,
  parseDemoBypassEmails,
  parseDemoDailyAccountLimit,
  parseDemoDailyCreditLimit,
  toUtcDateKey,
  type DemoFeatureKey,
  type DemoQuotaStatus,
} from '../lib/demo-credits';
import type {
  AuthenticatedUser,
  Bindings,
  ContextLike,
  DemoAccountDailyUsageRow,
  DemoAdmissionsDailyRow,
  DemoQuotaDb,
} from './types';
import { DemoQuotaAdmissionError, DemoQuotaCreditsError } from './types';

export const resolveDemoDailyAccountLimit = (env: Bindings): number => {
  return parseDemoDailyAccountLimit(env.DEMO_DAILY_ACCOUNT_LIMIT?.trim());
};

export const resolveDemoDailyCreditLimit = (env: Bindings): number => {
  return parseDemoDailyCreditLimit(env.DEMO_DAILY_CREDIT_LIMIT?.trim());
};

const resolveDemoBypassEmailSet = (env: Bindings): Set<string> => {
  return parseDemoBypassEmails(env.DEMO_CREDIT_BYPASS_EMAILS?.trim());
};

const isDemoQuotaBypassUser = (env: Bindings, authedUser: AuthenticatedUser): boolean => {
  return resolveDemoBypassEmailSet(env).has(authedUser.email.trim().toLowerCase());
};

export const requiresLaunchDemoAuthForUserRoute = (username: string): boolean => {
  return isLaunchDemoUsername(username);
};

export const requiresLaunchDemoAuthForTeamRoute = (teamSlug: string): boolean => {
  return isLaunchDemoTeamSlug(teamSlug);
};

export const isLaunchDemoBookingContext = (input: {
  organizerUsername?: string | null;
  teamSlug?: string | null;
}): boolean => {
  return (
    (input.organizerUsername ? requiresLaunchDemoAuthForUserRoute(input.organizerUsername) : false) ||
    (input.teamSlug ? requiresLaunchDemoAuthForTeamRoute(input.teamSlug) : false)
  );
};

const loadDemoAdmissionsRow = async (
  db: DemoQuotaDb,
  dateKey: string,
): Promise<DemoAdmissionsDailyRow | null> => {
  const row = await db.execute<DemoAdmissionsDailyRow>(sql`
    select date_key as "dateKey", admitted_count as "admittedCount", daily_limit as "dailyLimit"
    from demo_admissions_daily
    where date_key = ${dateKey}
    limit 1
  `);
  return row.rows[0] ?? null;
};

const loadDemoAccountDailyUsageRow = async (
  db: DemoQuotaDb,
  input: { dateKey: string; userId: string },
): Promise<DemoAccountDailyUsageRow | null> => {
  const row = await db.execute<DemoAccountDailyUsageRow>(sql`
    select
      id,
      date_key as "dateKey",
      user_id as "userId",
      credits_limit as "creditsLimit",
      credits_used as "creditsUsed",
      is_bypass as "isBypass",
      admitted_at as "admittedAt",
      last_activity_at as "lastActivityAt"
    from demo_account_daily_usage
    where date_key = ${input.dateKey} and user_id = ${input.userId}
    limit 1
  `);
  return row.rows[0] ?? null;
};

export const loadDemoQuotaStatus = async (
  db: DemoQuotaDb,
  env: Bindings,
  authedUser: AuthenticatedUser | null,
  now: Date = new Date(),
): Promise<DemoQuotaStatus> => {
  const dateKey = toUtcDateKey(now);
  const admissionsRow = await loadDemoAdmissionsRow(db, dateKey);
  const admissions = buildDemoAdmissionsStatus({
    date: dateKey,
    dailyLimit: admissionsRow?.dailyLimit ?? resolveDemoDailyAccountLimit(env),
    admittedCount: admissionsRow?.admittedCount ?? 0,
  });

  if (!authedUser) {
    return buildDemoQuotaStatus({ date: dateKey, admissions, account: null });
  }

  if (isDemoQuotaBypassUser(env, authedUser)) {
    return buildDemoQuotaStatus({
      date: dateKey,
      admissions,
      account: buildDemoAccountStatus({
        admitted: true,
        isBypass: true,
        creditsLimit: null,
        creditsUsed: 0,
      }),
    });
  }

  const usage = await loadDemoAccountDailyUsageRow(db, { dateKey, userId: authedUser.id });
  return buildDemoQuotaStatus({
    date: dateKey,
    admissions,
    account: buildDemoAccountStatus({
      admitted: usage !== null,
      isBypass: false,
      creditsLimit: usage?.creditsLimit ?? resolveDemoDailyCreditLimit(env),
      creditsUsed: usage?.creditsUsed ?? 0,
      admittedAt: usage?.admittedAt ?? null,
      lastActivityAt: usage?.lastActivityAt ?? null,
    }),
  });
};

export const assertDemoFeatureAvailable = async (
  db: DemoQuotaDb,
  env: Bindings,
  authedUser: AuthenticatedUser,
  featureKey: DemoFeatureKey,
  now: Date = new Date(),
): Promise<DemoQuotaStatus> => {
  const status = await loadDemoQuotaStatus(db, env, authedUser, now);
  const featureCost = getDemoFeatureCost(featureKey);

  if (!status.account || status.account.isBypass || featureCost <= 0) {
    return status;
  }
  if (!status.account.admitted && status.admissions.isExhausted) {
    throw new DemoQuotaAdmissionError(
      'Daily demo account pool is exhausted. Join the waitlist or try again tomorrow.',
    );
  }

  const remainingCredits = status.account.remaining ?? resolveDemoDailyCreditLimit(env);
  if (remainingCredits < featureCost) {
    throw new DemoQuotaCreditsError(
      `You have used all ${status.account.creditsLimit ?? resolveDemoDailyCreditLimit(env)} demo credits for today.`,
    );
  }

  return status;
};

export const consumeDemoFeatureCredits = async (
  db: DemoQuotaDb,
  env: Bindings,
  authedUser: AuthenticatedUser,
  input: { featureKey: DemoFeatureKey; sourceKey: string; metadata?: Record<string, unknown>; now?: Date },
): Promise<DemoQuotaStatus> => {
  const now = input.now ?? new Date();
  const dateKey = toUtcDateKey(now);
  const featureCost = getDemoFeatureCost(input.featureKey);

  if (featureCost <= 0 || isDemoQuotaBypassUser(env, authedUser)) {
    return loadDemoQuotaStatus(db, env, authedUser, now);
  }

  const dailyAccountLimit = resolveDemoDailyAccountLimit(env);
  const dailyCreditLimit = resolveDemoDailyCreditLimit(env);

  await db
    .insert(demoAdmissionsDaily)
    .values({
      dateKey,
      admittedCount: 0,
      dailyLimit: dailyAccountLimit,
      updatedAt: now,
      createdAt: now,
    })
    .onConflictDoNothing({ target: demoAdmissionsDaily.dateKey });

  const lockedAdmissions = await db.execute<DemoAdmissionsDailyRow>(sql`
    select date_key as "dateKey", admitted_count as "admittedCount", daily_limit as "dailyLimit"
    from demo_admissions_daily
    where date_key = ${dateKey}
    for update
  `);
  const admissionsRow = lockedAdmissions.rows[0];
  if (!admissionsRow) {
    throw new Error('Unable to resolve demo admissions row.');
  }

  const existingUsageRow = await db.execute<DemoAccountDailyUsageRow>(sql`
    select
      id,
      date_key as "dateKey",
      user_id as "userId",
      credits_limit as "creditsLimit",
      credits_used as "creditsUsed",
      is_bypass as "isBypass",
      admitted_at as "admittedAt",
      last_activity_at as "lastActivityAt"
    from demo_account_daily_usage
    where date_key = ${dateKey} and user_id = ${authedUser.id}
    for update
  `);

  let usageRow = existingUsageRow.rows[0] ?? null;
  if (!usageRow) {
    if (admissionsRow.admittedCount >= admissionsRow.dailyLimit) {
      throw new DemoQuotaAdmissionError(
        'Daily demo account pool is exhausted. Join the waitlist or try again tomorrow.',
      );
    }

    const [insertedUsage] = await db
      .insert(demoAccountDailyUsage)
      .values({
        dateKey,
        userId: authedUser.id,
        creditsLimit: dailyCreditLimit,
        creditsUsed: 0,
        isBypass: false,
        admittedAt: now,
        lastActivityAt: now,
        updatedAt: now,
        createdAt: now,
      })
      .returning({
        id: demoAccountDailyUsage.id,
        dateKey: demoAccountDailyUsage.dateKey,
        userId: demoAccountDailyUsage.userId,
        creditsLimit: demoAccountDailyUsage.creditsLimit,
        creditsUsed: demoAccountDailyUsage.creditsUsed,
        isBypass: demoAccountDailyUsage.isBypass,
        admittedAt: demoAccountDailyUsage.admittedAt,
        lastActivityAt: demoAccountDailyUsage.lastActivityAt,
      });

    if (!insertedUsage) {
      throw new Error('Unable to create demo usage row.');
    }
    usageRow = insertedUsage;

    await db
      .update(demoAdmissionsDaily)
      .set({
        admittedCount: admissionsRow.admittedCount + 1,
        dailyLimit: dailyAccountLimit,
        updatedAt: now,
      })
      .where(eq(demoAdmissionsDaily.dateKey, dateKey));
  }

  const [existingEvent] = await db
    .select({ id: demoCreditEvents.id })
    .from(demoCreditEvents)
    .where(
      and(
        eq(demoCreditEvents.dateKey, dateKey),
        eq(demoCreditEvents.userId, authedUser.id),
        eq(demoCreditEvents.sourceKey, input.sourceKey),
      ),
    )
    .limit(1);

  if (!existingEvent) {
    if (usageRow.creditsUsed + featureCost > usageRow.creditsLimit) {
      throw new DemoQuotaCreditsError(`You have used all ${usageRow.creditsLimit} demo credits for today.`);
    }

    await db.insert(demoCreditEvents).values({
      dateKey,
      userId: authedUser.id,
      featureKey: input.featureKey,
      cost: featureCost,
      sourceKey: input.sourceKey,
      metadata: input.metadata ?? {},
      createdAt: now,
    });

    await db
      .update(demoAccountDailyUsage)
      .set({
        creditsUsed: usageRow.creditsUsed + featureCost,
        lastActivityAt: now,
        updatedAt: now,
      })
      .where(eq(demoAccountDailyUsage.id, usageRow.id));
  }

  return loadDemoQuotaStatus(db, env, authedUser, now);
};

export const jsonDemoQuotaError = async (
  context: ContextLike,
  db: DemoQuotaDb,
  env: Bindings,
  authedUser: AuthenticatedUser | null,
  error: DemoQuotaAdmissionError | DemoQuotaCreditsError,
): Promise<Response> => {
  const status = await loadDemoQuotaStatus(db, env, authedUser, new Date());
  return context.json({ ok: false, error: error.message, demoQuota: status }, 429);
};
