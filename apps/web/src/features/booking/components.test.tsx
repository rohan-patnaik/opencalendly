import { describe, expect, it } from 'vitest';

import { BookingActionLinks } from './components';

describe('BookingActionLinks', () => {
  it('opens action pages in the top window', () => {
    const element = BookingActionLinks({
      styles: {
        actionLinks: 'links',
        secondaryButton: 'button',
      } as never,
      actionLinks: {
        cancelPageUrl: 'https://opencalendly.com/bookings/actions/cancel-token',
        reschedulePageUrl: 'https://opencalendly.com/bookings/actions/reschedule-token',
      },
    });

    const children = Array.isArray(element?.props.children)
      ? element.props.children.filter(Boolean)
      : [];

    expect(children).toHaveLength(2);
    expect(children[0]?.props.target).toBe('_top');
    expect(children[1]?.props.target).toBe('_top');
  });
});
