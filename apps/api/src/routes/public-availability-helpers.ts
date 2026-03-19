import { DateTime } from 'luxon';

import { availabilityQuerySchema } from '@opencalendly/shared';

type AvailabilityInput = {
  timezone: string | undefined;
  start: string | undefined;
  days: string | undefined;
};

export type ParsedAvailabilityInput =
  | {
      ok: true;
      timezone: string | undefined;
      startIso: string;
      days: number;
      rangeStart: DateTime;
      rangeEnd: DateTime;
    }
  | {
      ok: false;
      message: string;
    };

export const parseAvailabilityInput = (input: AvailabilityInput): ParsedAvailabilityInput => {
  const query = availabilityQuerySchema.safeParse(input);
  if (!query.success) {
    return {
      ok: false,
      message: query.error.issues[0]?.message ?? 'Invalid query params.',
    };
  }

  const startIso = query.data.start ?? DateTime.utc().toISO();
  if (!startIso) {
    return { ok: false, message: 'Invalid range start.' };
  }

  const rangeStart = DateTime.fromISO(startIso, { zone: 'utc' });
  if (!rangeStart.isValid) {
    return { ok: false, message: 'Invalid range start.' };
  }

  const days = query.data.days ?? 7;
  return {
    ok: true,
    timezone: query.data.timezone,
    startIso,
    days,
    rangeStart,
    rangeEnd: rangeStart.plus({ days }),
  };
};
