import { describe, expect, it } from 'vitest';

import { hasRequiredMicrosoftCalendarScopes } from './microsoft-shared';

describe('hasRequiredMicrosoftCalendarScopes', () => {
  it('accepts grants with profile and calendar write scopes', () => {
    expect(
      hasRequiredMicrosoftCalendarScopes('openid email User.Read Calendars.ReadWrite'),
    ).toBe(true);
  });

  it('accepts graph-qualified and case-varied scopes', () => {
    expect(
      hasRequiredMicrosoftCalendarScopes(
        'https://graph.microsoft.com/User.Read https://graph.microsoft.com/Calendars.ReadWrite',
      ),
    ).toBe(true);
  });

  it('rejects incomplete grants', () => {
    expect(hasRequiredMicrosoftCalendarScopes('User.Read Calendars.Read')).toBe(false);
    expect(hasRequiredMicrosoftCalendarScopes('Calendars.ReadWrite')).toBe(false);
    expect(hasRequiredMicrosoftCalendarScopes(undefined)).toBe(false);
  });
});
