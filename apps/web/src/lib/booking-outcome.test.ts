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

  it('returns generic failure message when email delivery fails with an error', () => {
    expect(
      buildEmailDeliveryMessage(
        {
          sent: false,
          error: 'provider timeout',
        },
        'invitee@example.com',
      ),
    ).toBe('Booking confirmed, but we could not deliver the confirmation email.');
  });

  it('returns fallback failure message when delivery fails without error text', () => {
    expect(
      buildEmailDeliveryMessage(
        {
          sent: false,
        },
        'invitee@example.com',
      ),
    ).toBe('Booking confirmed, but email delivery failed.');
  });

  it('returns unknown status message when payload is missing', () => {
    expect(buildEmailDeliveryMessage(undefined, 'invitee@example.com')).toBe(
      'Booking confirmed. Email delivery status unavailable.',
    );
  });
});
