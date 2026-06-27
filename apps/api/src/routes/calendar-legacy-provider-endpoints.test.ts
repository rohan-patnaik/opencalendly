import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerGoogleCalendarSyncRoutes } from './calendar-google-sync';
import { registerMicrosoftCalendarSyncRoutes } from './calendar-microsoft-sync';

const createApp = () => {
  const app = new Hono();
  registerGoogleCalendarSyncRoutes(app as never);
  registerMicrosoftCalendarSyncRoutes(app as never);
  return app;
};

describe('legacy provider-level calendar endpoints', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['/v0/calendar/google/disconnect', 'Google'],
    ['/v0/calendar/google/sync', 'Google'],
    ['/v0/calendar/microsoft/disconnect', 'Microsoft'],
    ['/v0/calendar/microsoft/sync', 'Microsoft'],
  ])('returns 410 for %s', async (path, provider) => {
    const response = await createApp().request(`http://localhost${path}`, {
      method: 'POST',
      body: JSON.stringify({ start: '2026-03-01T00:00:00.000Z' }),
      headers: { 'content-type': 'application/json' },
    });
    const payload = await response.json();

    expect(response.status).toBe(410);
    expect(payload).toEqual({
      ok: false,
      error: `This provider-level ${provider} calendar endpoint is deprecated. Use /v0/calendar/connections/:connectionId/sync or /v0/calendar/connections/:connectionId/disconnect.`,
    });
    expect(console.warn).toHaveBeenCalledWith(
      'legacy_calendar_provider_endpoint_called',
      expect.objectContaining({
        route: path,
        method: 'POST',
      }),
    );
  });

  it.each(['/v0/calendar/google/sync', '/v0/calendar/microsoft/sync'])(
    'returns 410 before parsing malformed request bodies for %s',
    async (path) => {
      const response = await createApp().request(`http://localhost${path}`, {
        method: 'POST',
        body: '{',
        headers: { 'content-type': 'application/json' },
      });

      expect(response.status).toBe(410);
      expect(console.warn).toHaveBeenCalledWith(
        'legacy_calendar_provider_endpoint_called',
        expect.objectContaining({
          route: path,
          method: 'POST',
        }),
      );
    },
  );
});
