export const DEFAULT_DEMO_DAILY_PASS_LIMIT = 25;
export const MIN_DEMO_DAILY_PASS_LIMIT = 1;
export const MAX_DEMO_DAILY_PASS_LIMIT = 10000;

export type DemoCreditsStatus = {
  date: string;
  dailyLimit: number;
  used: number;
  remaining: number;
  isExhausted: boolean;
};

export const toUtcDateKey = (date: Date): string => {
  return date.toISOString().slice(0, 10);
};

export const parseDemoDailyPassLimit = (rawValue: string | undefined): number => {
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return DEFAULT_DEMO_DAILY_PASS_LIMIT;
  }

  return Math.max(MIN_DEMO_DAILY_PASS_LIMIT, Math.min(MAX_DEMO_DAILY_PASS_LIMIT, parsed));
};

export const buildDemoCreditsStatus = (input: {
  date: string;
  dailyLimit: number;
  used: number;
}): DemoCreditsStatus => {
  const used = Math.max(0, input.used);
  const dailyLimit = Math.max(MIN_DEMO_DAILY_PASS_LIMIT, input.dailyLimit);
  const remaining = Math.max(0, dailyLimit - used);

  return {
    date: input.date,
    dailyLimit,
    used,
    remaining,
    isExhausted: remaining === 0,
  };
};

export const consumeDemoCreditFromState = (input: {
  date: string;
  dailyLimit: number;
  used: number;
}): {
  consumed: boolean;
  status: DemoCreditsStatus;
} => {
  const status = buildDemoCreditsStatus(input);

  if (status.used >= status.dailyLimit) {
    return {
      consumed: false,
      status,
    };
  }

  return {
    consumed: true,
    status: buildDemoCreditsStatus({
      date: input.date,
      dailyLimit: status.dailyLimit,
      used: status.used + 1,
    }),
  };
};
