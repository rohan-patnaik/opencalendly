import { jsonError } from '../server/core';
import type { ApiApp } from '../server/types';

const LEGACY_MICROSOFT_MESSAGE =
  'This provider-level Microsoft calendar endpoint is deprecated. Use /v0/calendar/connections/:connectionId/sync or /v0/calendar/connections/:connectionId/disconnect.';

const logLegacyMicrosoftEndpoint = (request: Request, route: string): void => {
  console.warn('legacy_calendar_provider_endpoint_called', {
    provider: 'microsoft',
    route,
    method: request.method,
    requestId: request.headers.get('cf-ray') ?? request.headers.get('x-request-id') ?? null,
  });
};

export const registerMicrosoftCalendarSyncRoutes = (app: ApiApp): void => {
  app.post('/v0/calendar/microsoft/disconnect', (context) => {
    logLegacyMicrosoftEndpoint(context.req.raw, '/v0/calendar/microsoft/disconnect');
    return jsonError(context, 410, LEGACY_MICROSOFT_MESSAGE);
  });

  app.post('/v0/calendar/microsoft/sync', (context) => {
    logLegacyMicrosoftEndpoint(context.req.raw, '/v0/calendar/microsoft/sync');
    return jsonError(context, 410, LEGACY_MICROSOFT_MESSAGE);
  });
};
