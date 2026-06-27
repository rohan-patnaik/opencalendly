import { describe, expect, it } from 'vitest';

import { hasRequiredMicrosoftCalendarScopes } from './microsoft-shared';

describe('hasRequiredMicrosoftCalendarScopes', () => {
  it('accepts grants with the required Microsoft calendar scopes', () => {
    expect(
      hasRequiredMicrosoftCalendarScopes(
        'Calendars.ReadWrite User.Read offline_access email openid Calendars.Read',
      ),
    ).toBe(true);
  });

  it('does not require redundant read-only calendar access', () => {
    expect(
      hasRequiredMicrosoftCalendarScopes('offline_access User.Read Calendars.ReadWrite'),
    ).toBe(true);
  });

  it('tolerates repeated whitespace and scope casing', () => {
    expect(
      hasRequiredMicrosoftCalendarScopes(
        '  OPENID   email offline_access user.read calendars.readwrite  ',
      ),
    ).toBe(true);
  });

  it('accepts Microsoft Graph resource-prefixed scopes', () => {
    const scopes = [
      'offline_access',
      'https%3A%2F%2Fgraph.microsoft.com%2FUser.Read',
      'https://graph.microsoft.com/Calendars.ReadWrite',
    ].join(' ');

    expect(hasRequiredMicrosoftCalendarScopes(scopes)).toBe(true);
  });

  it('rejects grants missing calendar write access', () => {
    expect(
      hasRequiredMicrosoftCalendarScopes('openid email offline_access User.Read Calendars.Read'),
    ).toBe(false);
  });

  it('rejects grants missing offline access', () => {
    expect(
      hasRequiredMicrosoftCalendarScopes('openid email User.Read Calendars.ReadWrite'),
    ).toBe(false);
  });

  it('rejects empty or absent grants', () => {
    expect(hasRequiredMicrosoftCalendarScopes('')).toBe(false);
    expect(hasRequiredMicrosoftCalendarScopes(undefined)).toBe(false);
  });
});
