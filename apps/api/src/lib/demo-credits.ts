export const DEFAULT_DEMO_DAILY_ACCOUNT_LIMIT = 15;
export const MIN_DEMO_DAILY_ACCOUNT_LIMIT = 1;
export const MAX_DEMO_DAILY_ACCOUNT_LIMIT = 10000;

export const DEFAULT_DEMO_DAILY_CREDIT_LIMIT = 20;
export const MIN_DEMO_DAILY_CREDIT_LIMIT = 1;
export const MAX_DEMO_DAILY_CREDIT_LIMIT = 1000;

export const DEFAULT_DEMO_BOOKING_USERNAME = 'demo';
export const DEFAULT_DEMO_TEAM_SLUG = 'demo-team';

export const DEMO_FEATURE_COSTS = [
  { key: 'event_type_create', label: 'Create event type', cost: 1 },
  { key: 'event_type_update', label: 'Update event type', cost: 1 },
  { key: 'availability_save', label: 'Save availability', cost: 1 },
  { key: 'notification_rules_save', label: 'Save notification rules', cost: 1 },
  { key: 'notification_run', label: 'Run notifications', cost: 2 },
  { key: 'team_create', label: 'Create team', cost: 2 },
  { key: 'team_member_add', label: 'Add team member', cost: 2 },
  { key: 'team_event_type_create', label: 'Create team event type', cost: 2 },
  { key: 'webhook_create', label: 'Create webhook', cost: 1 },
  { key: 'webhook_update', label: 'Update webhook', cost: 1 },
  { key: 'webhook_run', label: 'Run webhook deliveries', cost: 2 },
  { key: 'calendar_connect', label: 'Connect calendar', cost: 3 },
  { key: 'calendar_sync', label: 'Sync calendar', cost: 2 },
  { key: 'writeback_run', label: 'Run writeback queue', cost: 1 },
  { key: 'one_on_one_booking', label: 'Book one-on-one demo', cost: 4 },
  { key: 'team_booking', label: 'Book team demo', cost: 5 },
  { key: 'booking_cancel', label: 'Cancel demo booking', cost: 2 },
  { key: 'booking_reschedule', label: 'Reschedule demo booking', cost: 3 },
] as const;

export type DemoFeatureKey = (typeof DEMO_FEATURE_COSTS)[number]['key'];

export type DemoFeatureCost = {
  key: DemoFeatureKey;
  label: string;
  cost: number;
};

export type DemoAdmissionsStatus = {
  date: string;
  dailyLimit: number;
  admittedCount: number;
  remaining: number;
  isExhausted: boolean;
};

export type DemoAccountStatus = {
  admitted: boolean;
  isBypass: boolean;
  creditsLimit: number | null;
  creditsUsed: number;
  remaining: number | null;
  isExhausted: boolean;
  admittedAt: string | null;
  lastActivityAt: string | null;
};

export type DemoQuotaStatus = {
  date: string;
  resetAt: string;
  admissions: DemoAdmissionsStatus;
  account: DemoAccountStatus | null;
  featureCosts: DemoFeatureCost[];
};

const clampPositiveInteger = (input: {
  rawValue: string | undefined;
  fallback: number;
  min: number;
  max: number;
}): number => {
  const parsed = input.rawValue ? Number.parseInt(input.rawValue, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return input.fallback;
  }

  return Math.max(input.min, Math.min(input.max, parsed));
};

export const toUtcDateKey = (date: Date): string => {
  return date.toISOString().slice(0, 10);
};

export const buildDemoQuotaResetAt = (dateKey: string): string => {
  const startOfDay = new Date(`${dateKey}T00:00:00.000Z`);
  return new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000).toISOString();
};

export const parseDemoDailyAccountLimit = (rawValue: string | undefined): number => {
  return clampPositiveInteger({
    rawValue,
    fallback: DEFAULT_DEMO_DAILY_ACCOUNT_LIMIT,
    min: MIN_DEMO_DAILY_ACCOUNT_LIMIT,
    max: MAX_DEMO_DAILY_ACCOUNT_LIMIT,
  });
};

export const parseDemoDailyCreditLimit = (rawValue: string | undefined): number => {
  return clampPositiveInteger({
    rawValue,
    fallback: DEFAULT_DEMO_DAILY_CREDIT_LIMIT,
    min: MIN_DEMO_DAILY_CREDIT_LIMIT,
    max: MAX_DEMO_DAILY_CREDIT_LIMIT,
  });
};

export const parseDemoBypassEmails = (rawValue: string | undefined): Set<string> => {
  return new Set(
    (rawValue ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
  );
};

export const buildDemoAdmissionsStatus = (input: {
  date: string;
  dailyLimit: number;
  admittedCount: number;
}): DemoAdmissionsStatus => {
  const dailyLimit = Math.max(MIN_DEMO_DAILY_ACCOUNT_LIMIT, input.dailyLimit);
  const admittedCount = Math.max(0, input.admittedCount);
  const remaining = Math.max(0, dailyLimit - admittedCount);

  return {
    date: input.date,
    dailyLimit,
    admittedCount,
    remaining,
    isExhausted: remaining === 0,
  };
};

export const buildDemoAccountStatus = (input: {
  admitted: boolean;
  isBypass: boolean;
  creditsLimit: number | null;
  creditsUsed: number;
  admittedAt?: Date | null;
  lastActivityAt?: Date | null;
}): DemoAccountStatus => {
  const creditsUsed = Math.max(0, input.creditsUsed);
  const creditsLimit =
    typeof input.creditsLimit === 'number'
      ? Math.max(MIN_DEMO_DAILY_CREDIT_LIMIT, input.creditsLimit)
      : null;
  const remaining = creditsLimit === null ? null : Math.max(0, creditsLimit - creditsUsed);

  return {
    admitted: input.admitted,
    isBypass: input.isBypass,
    creditsLimit,
    creditsUsed,
    remaining,
    isExhausted: remaining === 0 && creditsLimit !== null,
    admittedAt: input.admittedAt ? input.admittedAt.toISOString() : null,
    lastActivityAt: input.lastActivityAt ? input.lastActivityAt.toISOString() : null,
  };
};

export const buildDemoQuotaStatus = (input: {
  date: string;
  admissions: DemoAdmissionsStatus;
  account: DemoAccountStatus | null;
}): DemoQuotaStatus => {
  return {
    date: input.date,
    resetAt: buildDemoQuotaResetAt(input.date),
    admissions: input.admissions,
    account: input.account,
    featureCosts: DEMO_FEATURE_COSTS.map((feature) => ({ ...feature })),
  };
};

export const getDemoFeatureCost = (featureKey: DemoFeatureKey): number => {
  const feature = DEMO_FEATURE_COSTS.find((candidate) => candidate.key === featureKey);
  return feature?.cost ?? 0;
};

export const isLaunchDemoUsername = (username: string): boolean => {
  return username.trim().toLowerCase() === DEFAULT_DEMO_BOOKING_USERNAME;
};

export const isLaunchDemoTeamSlug = (teamSlug: string): boolean => {
  return teamSlug.trim().toLowerCase() === DEFAULT_DEMO_TEAM_SLUG;
};
