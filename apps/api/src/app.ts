import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { resolveAllowedCorsOrigins, toCorsOrigin } from './lib/cors';
import { hasSessionCookie } from './server/auth-session';
import { jsonError, logInternalError } from './server/core';
import { API_SECURITY_HEADERS } from './server/security-headers';
import { captureApiException } from './server/sentry';
import type { Bindings } from './server/types';
import { registerAnalyticsFunnelRoutes } from './routes/analytics-funnel';
import { registerAnalyticsOperatorRoutes } from './routes/analytics-operator';
import { registerAnalyticsTeamRoutes } from './routes/analytics-team';
import { registerClerkAuthRoutes } from './routes/auth-clerk';
import { registerAuthRoutes } from './routes/auth';
import { registerBookingActionCancelRoutes } from './routes/booking-actions-cancel';
import { registerBookingActionRescheduleRoutes } from './routes/booking-actions-reschedule';
import { registerBookingActionViewRoutes } from './routes/booking-actions-view';
import { registerBookingCreateRoutes } from './routes/bookings-create';
import { registerGoogleCalendarConnectRoutes } from './routes/calendar-google-connect';
import { registerCalendarConnectionRoutes } from './routes/calendar-connections';
import { registerGoogleCalendarSyncRoutes } from './routes/calendar-google-sync';
import { registerMicrosoftCalendarConnectRoutes } from './routes/calendar-microsoft-connect';
import { registerMicrosoftCalendarSyncRoutes } from './routes/calendar-microsoft-sync';
import { registerCalendarStatusRoutes } from './routes/calendar-status';
import { registerCalendarWritebackRoutes } from './routes/calendar-writeback';
import { registerDemoRoutes } from './routes/demo';
import { registerEmbedRoutes } from './routes/embed';
import { registerHealthRoutes } from './routes/health';
import { registerNotificationRunRoutes } from './routes/notifications-run';
import { registerOrganizerAvailabilityRoutes } from './routes/organizer-availability';
import { registerOrganizerEventTypeRoutes } from './routes/organizer-event-types';
import { registerOrganizerNotificationRuleRoutes } from './routes/organizer-notification-rules';
import { registerOrganizerTeamReadRoutes } from './routes/organizer-teams-read';
import { registerOrganizerTeamWriteRoutes } from './routes/organizer-teams-write';
import { registerOrganizerTimeOffRoutes } from './routes/organizer-time-off';
import { registerProfileRoutes } from './routes/profile';
import { registerPublicAvailabilityRoutes } from './routes/public-availability';
import { registerPublicEventRoutes } from './routes/public-events';
import { registerTeamBookingCreateRoutes } from './routes/team-bookings-create';
import { registerWebhookDeliveryRoutes } from './routes/webhook-deliveries';
import { registerWebhookRoutes } from './routes/webhooks';

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', async (context, next) => {
  const allowedOrigins = resolveAllowedCorsOrigins(context.env.APP_BASE_URL);

  return cors({
    origin: (origin) => {
      if (!origin) {
        return undefined;
      }
      return allowedOrigins.has(origin) ? origin : undefined;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Idempotency-Key'],
    credentials: true,
    maxAge: 86_400,
  })(context, next);
});

app.use('*', async (context, next) => {
  try {
    await next();
  } finally {
    for (const [key, value] of Object.entries(API_SECURITY_HEADERS)) {
      context.header(key, value);
    }
  }
});

app.use('*', async (context, next) => {
  const method = context.req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }
  if (!hasSessionCookie(context.req.raw)) {
    return next();
  }

  const allowedOrigins = resolveAllowedCorsOrigins(context.env.APP_BASE_URL);
  const originCandidate = context.req.header('origin') ?? context.req.header('referer') ?? undefined;
  const requestOrigin = toCorsOrigin(originCandidate);
  if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
    return jsonError(context, 403, 'Cross-site authenticated requests are not allowed.');
  }

  return next();
});

registerHealthRoutes(app);
registerAuthRoutes(app);
registerClerkAuthRoutes(app);
registerProfileRoutes(app);

registerAnalyticsFunnelRoutes(app);
registerAnalyticsTeamRoutes(app);
registerAnalyticsOperatorRoutes(app);

registerCalendarStatusRoutes(app);
registerCalendarConnectionRoutes(app);
registerGoogleCalendarConnectRoutes(app);
registerGoogleCalendarSyncRoutes(app);
registerMicrosoftCalendarConnectRoutes(app);
registerMicrosoftCalendarSyncRoutes(app);
registerCalendarWritebackRoutes(app);
registerNotificationRunRoutes(app);

registerEmbedRoutes(app);
registerWebhookRoutes(app);
registerWebhookDeliveryRoutes(app);
registerDemoRoutes(app);

registerOrganizerNotificationRuleRoutes(app);
registerOrganizerAvailabilityRoutes(app);
registerOrganizerTimeOffRoutes(app);
registerOrganizerEventTypeRoutes(app);
registerOrganizerTeamReadRoutes(app);
registerOrganizerTeamWriteRoutes(app);

registerPublicEventRoutes(app);
registerPublicAvailabilityRoutes(app);
registerBookingCreateRoutes(app);
registerTeamBookingCreateRoutes(app);
registerBookingActionViewRoutes(app);
registerBookingActionCancelRoutes(app);
registerBookingActionRescheduleRoutes(app);

app.onError((error, context) => {
  logInternalError('api_unhandled_error', error);
  void captureApiException(context.env, error, {
    route: new URL(context.req.url).pathname,
    method: context.req.method.toUpperCase(),
    requestId: context.req.header('cf-ray') ?? context.req.header('x-request-id') ?? null,
    statusCode: 500,
  });
  const response = jsonError(context, 500, 'Unexpected server error.');
  for (const [key, value] of Object.entries(API_SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
});

export default app;
