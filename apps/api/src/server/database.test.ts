import { describe, expect, it } from 'vitest';

import { isUniqueViolation } from './database';

describe('isUniqueViolation', () => {
  it('matches any expected unique constraint name', () => {
    expect(
      isUniqueViolation(
        { code: '23505', constraint: 'bookings_confirmed_unique_slot' },
        ['bookings_confirmed_unique_slot', 'bookings_unique_slot'],
      ),
    ).toBe(true);

    expect(
      isUniqueViolation(
        { code: '23505', constraint: 'bookings_unique_slot' },
        ['bookings_confirmed_unique_slot', 'bookings_unique_slot'],
      ),
    ).toBe(true);

    expect(
      isUniqueViolation(
        { code: '23505', constraint: 'team_booking_assignments_user_slot_unique' },
        ['bookings_confirmed_unique_slot', 'bookings_unique_slot'],
      ),
    ).toBe(false);
  });
});
