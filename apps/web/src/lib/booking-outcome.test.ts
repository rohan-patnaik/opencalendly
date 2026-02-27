import { describe, expect, it } from 'vitest';

import { buildEmailDeliveryMessage } from './booking-outcome';

describe('buildEmailDeliveryMessage', () => {
  it('returns sent message when email delivery succeeds', () => {
    expect(
      buildEmailDeliveryMessage(
        {
          sent: true,
        },
        'invitee@example.com',
      ),
    ).toBe('Confirmation email sent to invitee@example.com.');
  });

  it('returns provider error when email delivery fails with an error', () => {
    expect(
      buildEmailDeliveryMessage(
        {
          sent: false,
          error: 'provider timeout',
        },
        'invitee@example.com',
      ),
    ).toBe('Booking confirmed, but email delivery failed: provider timeout');
  });

  it('returns unknown status message when payload is missing', () => {
    expect(buildEmailDeliveryMessage(undefined, 'invitee@example.com')).toBe(
      'Booking confirmed. Email delivery status unavailable.',
    );
  });
});
