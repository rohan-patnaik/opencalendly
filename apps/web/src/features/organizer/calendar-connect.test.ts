import { describe, expect, it } from 'vitest';

import {
  buildCalendarConnectAvailabilityMessage,
  buildCalendarConnectionSummary,
} from './calendar-connect';

describe('buildCalendarConnectionSummary', () => {
  it('returns an onboarding prompt when no calendars are connected', () => {
    expect(buildCalendarConnectionSummary([])).toBe(
      'No calendars connected yet. Add one to block busy time and choose a writeback target.',
    );
  });

  it('describes a single connected provider', () => {
    expect(
      buildCalendarConnectionSummary([
        {
          id: 'conn_google',
          provider: 'google',
          connected: true,
          externalEmail: 'owner@example.com',
          useForConflictChecks: true,
          useForWriteback: false,
          lastSyncedAt: null,
          nextSyncAt: null,
          lastError: null,
        },
      ]),
    ).toBe('1 calendar connected: Google Calendar.');
  });

  it('describes multiple connected providers', () => {
    expect(
      buildCalendarConnectionSummary([
        {
          id: 'conn_google',
          provider: 'google',
          connected: true,
          externalEmail: 'owner@example.com',
          useForConflictChecks: true,
          useForWriteback: false,
          lastSyncedAt: null,
          nextSyncAt: null,
          lastError: null,
        },
        {
          id: 'conn_microsoft',
          provider: 'microsoft',
          connected: true,
          externalEmail: 'owner@outlook.com',
          useForConflictChecks: true,
          useForWriteback: true,
          lastSyncedAt: null,
          nextSyncAt: null,
          lastError: null,
        },
      ]),
    ).toBe('2 calendars connected: Google Calendar, Microsoft Calendar.');
  });
});

describe('buildCalendarConnectAvailabilityMessage', () => {
  it('reports when no calendar providers are configured', () => {
    expect(buildCalendarConnectAvailabilityMessage([])).toBe(
      'Calendar OAuth is not configured in this environment yet.',
    );
  });

  it('returns no warning when every provider is available', () => {
    expect(buildCalendarConnectAvailabilityMessage(['google', 'microsoft'])).toBeNull();
  });

  it('lists the unavailable providers for partial runtimes', () => {
    expect(buildCalendarConnectAvailabilityMessage(['google'])).toBe(
      'Unavailable here: Microsoft Calendar.',
    );
  });
});
