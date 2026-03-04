import { DateTime } from 'luxon';

export type HolidayLocale = 'IN' | 'US';

type FixedHoliday = {
  month: number;
  day: number;
  label: string;
};

const fixedHolidays: Record<HolidayLocale, FixedHoliday[]> = {
  IN: [
    { month: 1, day: 26, label: 'Republic Day' },
    { month: 5, day: 1, label: 'Labour Day' },
    { month: 8, day: 15, label: 'Independence Day' },
    { month: 10, day: 2, label: 'Gandhi Jayanti' },
    { month: 12, day: 25, label: 'Christmas Day' },
  ],
  US: [
    { month: 1, day: 1, label: "New Year's Day" },
    { month: 7, day: 4, label: 'Independence Day' },
    { month: 11, day: 11, label: 'Veterans Day' },
    { month: 12, day: 25, label: 'Christmas Day' },
  ],
};

const normalizeTimezone = (timezone: string): string => {
  const probe = DateTime.now().setZone(timezone);
  return probe.isValid ? timezone : 'UTC';
};

export const buildHolidayTimeOffWindows = (input: {
  locale: HolidayLocale;
  year: number;
  timezone: string;
}): Array<{ startAt: Date; endAt: Date; reason: string; sourceKey: string }> => {
  const timezone = normalizeTimezone(input.timezone);
  const holidays = fixedHolidays[input.locale] ?? [];

  return holidays
    .map((holiday) => {
      const startAtLocal = DateTime.fromObject(
        {
          year: input.year,
          month: holiday.month,
          day: holiday.day,
          hour: 0,
          minute: 0,
          second: 0,
          millisecond: 0,
        },
        { zone: timezone },
      );

      if (!startAtLocal.isValid) {
        return null;
      }

      const endAtLocal = startAtLocal.plus({ days: 1 });

      return {
        startAt: startAtLocal.toUTC().toJSDate(),
        endAt: endAtLocal.toUTC().toJSDate(),
        reason: holiday.label,
        sourceKey: `${input.locale}:${startAtLocal.toFormat('yyyy-MM-dd')}`,
      };
    })
    .filter((value): value is { startAt: Date; endAt: Date; reason: string; sourceKey: string } =>
      Boolean(value),
    );
};
