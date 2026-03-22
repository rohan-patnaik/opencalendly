import { describe, expect, it } from 'vitest';

import type { Bindings } from '../server/types';
import {
  buildExpectedCalendarRedirectUri,
  isExpectedCalendarRedirectUri,
} from './calendar-oauth-redirect';

const createBindings = (overrides: Partial<Bindings> = {}): Bindings =>
  ({
    DATABASE_URL: 'postgresql://user:pass@branch.neon.tech/db',
    SESSION_SECRET: '0123456789abcdef0123456789abcdef',
    APP_BASE_URL: 'https://opencalendly.com',
    ...overrides,
  }) as Bindings;

describe('buildExpectedCalendarRedirectUri', () => {
  it('builds the canonical Google callback URL from APP_BASE_URL', () => {
    expect(
      buildExpectedCalendarRedirectUri(
        createBindings({ APP_BASE_URL: 'https://opencalendly.com/organizer?preview=true' }),
        new Request('https://api.opencalendly.com/v0/calendar/google/connect/start'),
        'google',
      ),
    ).toBe('https://opencalendly.com/settings/calendar/google/callback');
  });
});

describe('isExpectedCalendarRedirectUri', () => {
  it('accepts the canonical provider callback URL', () => {
    expect(
      isExpectedCalendarRedirectUri({
        env: createBindings(),
        request: new Request('https://api.opencalendly.com/v0/calendar/google/connect/start'),
        provider: 'google',
        redirectUri: 'https://opencalendly.com/settings/calendar/google/callback',
      }),
    ).toBe(true);
  });

  it('rejects alternate hosts for the same callback path', () => {
    expect(
      isExpectedCalendarRedirectUri({
        env: createBindings(),
        request: new Request('https://api.opencalendly.com/v0/calendar/google/connect/start'),
        provider: 'google',
        redirectUri: 'https://www.opencalendly.com/settings/calendar/google/callback',
      }),
    ).toBe(false);
  });

  it('rejects query-string variants of the callback URL', () => {
    expect(
      isExpectedCalendarRedirectUri({
        env: createBindings(),
        request: new Request('https://api.opencalendly.com/v0/calendar/microsoft/connect/start'),
        provider: 'microsoft',
        redirectUri: 'https://opencalendly.com/settings/calendar/microsoft/callback?foo=bar',
      }),
    ).toBe(false);
  });
});
