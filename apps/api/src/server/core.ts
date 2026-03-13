import { DateTime } from 'luxon';

import type { ContextLike } from './types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const jsonError = (context: ContextLike, status: number, error: string): Response => {
  return context.json({ ok: false, error }, status);
};

export const logInternalError = (scope: string, error: unknown): void => {
  console.error(scope, error);
};

export const isUuid = (value: string): boolean => {
  return UUID_PATTERN.test(value);
};

export const normalizeTimezone = (timezone: string | undefined): string => {
  if (!timezone) {
    return 'UTC';
  }
  const parsed = DateTime.now().setZone(timezone);
  return parsed.isValid ? timezone : 'UTC';
};
