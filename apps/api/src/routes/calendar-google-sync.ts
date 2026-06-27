import { jsonError } from '../server/core';
import type { ApiApp } from '../server/types';

const LEGACY_GOOGLE_MESSAGE =
  'This provider-level Google calendar endpoint is deprecated. Use /v0/calendar/connections/:connectionId/sync or /v0/calendar/connections/:connectionId/disconnect.';

const logLegacyGoogleEndpoint = (request: Request, route: string): void => {
  console.warn('legacy_calendar_provider_endpoint_called', {
    provider: 'google',
    route,
    method: request.method,
    requestId: request.headers.get('cf-ray') ?? request.headers.get('x-request-id') ?? null,
  });
};

export const registerGoogleCalendarSyncRoutes = (app: ApiApp): void => {
  app.post('/v0/calendar/google/disconnect', (context) => {
    logLegacyGoogleEndpoint(context.req.raw, '/v0/calendar/google/disconnect');
    return jsonError(context, 410, LEGACY_GOOGLE_MESSAGE);
  });

  app.post('/v0/calendar/google/sync', (context) => {
    logLegacyGoogleEndpoint(context.req.raw, '/v0/calendar/google/sync');
    return jsonError(context, 410, LEGACY_GOOGLE_MESSAGE);
  });
};
