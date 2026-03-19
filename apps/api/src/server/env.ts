import type { Bindings, CalendarConnectionStatus, CalendarProvider, ConnectionConfig } from './types';

const MIN_CALENDAR_SECRET_LENGTH = 32;
const NEON_HOST_PATTERN = /\.neon\.tech(?::\d+)?(?:\/|$)/i;

export const WEBHOOK_DELIVERY_BATCH_LIMIT_DEFAULT = 25;
export const WEBHOOK_DELIVERY_BATCH_LIMIT_MAX = 100;
export const CALENDAR_OAUTH_STATE_TTL_MINUTES = 10;
export const CALENDAR_SYNC_NEXT_MINUTES = 15;
export const GOOGLE_CALENDAR_PROVIDER: CalendarProvider = 'google';
export const MICROSOFT_CALENDAR_PROVIDER: CalendarProvider = 'microsoft';
export const CALENDAR_WRITEBACK_DEFAULT_MAX_ATTEMPTS = 5;
export const CALENDAR_WRITEBACK_BATCH_LIMIT_DEFAULT = 25;
export const CALENDAR_WRITEBACK_BATCH_LIMIT_MAX = 100;
export const CALENDAR_WRITEBACK_LEASE_MINUTES = 3;
export const NOTIFICATION_RUN_BATCH_LIMIT_DEFAULT = 20;
export const NOTIFICATION_RUN_BATCH_LIMIT_MAX = 100;
export const NOTIFICATION_RUN_MAX_ATTEMPTS = 5;
export const NOTIFICATION_RUN_LEASE_MINUTES = 3;
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const IDEMPOTENCY_KEY_MIN_LENGTH = 16;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 200;
export const IDEMPOTENCY_IN_PROGRESS_TTL_MINUTES = 10;
export const IDEMPOTENCY_COMPLETED_TTL_HOURS = 24;
export const IDEMPOTENCY_EXPIRED_CLEANUP_INTERVAL = 50;
export const SESSION_EXPIRED_CLEANUP_INTERVAL = 50;
export const PUBLIC_ANALYTICS_RATE_LIMIT_WINDOW_MS = 60_000;
export const PUBLIC_ANALYTICS_RATE_LIMIT_MAX_REQUESTS_PER_SCOPE = 120;
export const PUBLIC_ANALYTICS_RATE_LIMIT_MAX_REQUESTS_PER_IP = 300;
export const PUBLIC_BOOKING_RATE_LIMIT_WINDOW_MS = 60_000;
export const PUBLIC_BOOKING_RATE_LIMIT_MAX_AVAILABILITY_REQUESTS_PER_SCOPE = 120;
export const PUBLIC_BOOKING_RATE_LIMIT_MAX_BOOKING_REQUESTS_PER_SCOPE = 30;
export const PUBLIC_BOOKING_RATE_LIMIT_MAX_REQUESTS_PER_IP = 180;
export const CLERK_EXCHANGE_RATE_LIMIT_WINDOW_MS = 60_000;
export const CLERK_EXCHANGE_RATE_LIMIT_MAX_REQUESTS_PER_IP = 40;

export const isNeonDatabaseUrl = (connectionString: string): boolean => {
  return NEON_HOST_PATTERN.test(connectionString);
};

export const resolveConnectionString = (env: Bindings): ConnectionConfig => {
  const rawDevBootstrap = env.ENABLE_DEV_AUTH_BOOTSTRAP?.trim();
  const preferDirectDatabaseUrl =
    rawDevBootstrap?.toLowerCase() === 'true' || rawDevBootstrap === '1';
  const databaseUrl = env.DATABASE_URL?.trim();

  if (preferDirectDatabaseUrl && databaseUrl) {
    return { source: 'database_url', connectionString: databaseUrl };
  }

  if (env.HYPERDRIVE?.connectionString) {
    return { source: 'hyperdrive', connectionString: env.HYPERDRIVE.connectionString };
  }

  if (databaseUrl) {
    return { source: 'database_url', connectionString: databaseUrl };
  }

  return null;
};

export const resolveCalendarEncryptionSecret = (env: Bindings): string | null => {
  const secret = env.SESSION_SECRET?.trim();
  return !secret || secret.length < MIN_CALENDAR_SECRET_LENGTH ? null : secret;
};

export const resolveWebhookEncryptionSecret = (env: Bindings): string | null => {
  const dedicated = env.WEBHOOK_SECRET_ENCRYPTION_KEY?.trim();
  if (dedicated) {
    return dedicated.length < MIN_CALENDAR_SECRET_LENGTH ? null : dedicated;
  }

  return resolveCalendarEncryptionSecret(env);
};

export const resolveTelemetryHmacKey = (env: Bindings): string | null => {
  const telemetryHmacKey = env.TELEMETRY_HMAC_KEY?.trim();
  return !telemetryHmacKey || telemetryHmacKey.length < MIN_CALENDAR_SECRET_LENGTH
    ? null
    : telemetryHmacKey;
};

export const resolveGoogleOAuthConfig = (env: Bindings) => {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
};

export const resolveMicrosoftOAuthConfig = (env: Bindings) => {
  const clientId = env.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = env.MICROSOFT_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
};

export const resolveClerkSecretKey = (env: Bindings): string | null => {
  const secretKey = env.CLERK_SECRET_KEY?.trim();
  return secretKey ? secretKey : null;
};

export const resolveClerkAuthorizedParties = (env: Bindings): string[] => {
  const values = new Set<string>();
  const configured = env.APP_BASE_URL?.trim();
  if (configured) {
    try {
      values.add(new URL(configured).origin);
    } catch {
      throw new Error('APP_BASE_URL must be a valid absolute URL when Clerk auth is enabled.');
    }
  }

  const shouldAllowLocalOrigins = Array.from(values).some((origin) => {
    try {
      const hostname = new URL(origin).hostname;
      return hostname === 'localhost' || hostname === '127.0.0.1';
    } catch {
      return false;
    }
  });
  if (shouldAllowLocalOrigins) {
    values.add('http://localhost:3000');
    values.add('http://127.0.0.1:3000');
  }

  if (values.size === 0) {
    throw new Error('APP_BASE_URL must be configured for Clerk token verification.');
  }
  return Array.from(values);
};

export const resolveClerkAllowedAudiences = (env: Bindings): string[] => {
  return (env.CLERK_ALLOWED_AUDIENCES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

export const toCalendarConnectionStatus = (input: {
  provider: CalendarProvider;
  externalEmail: string | null;
  lastSyncedAt: Date | null;
  nextSyncAt: Date | null;
  lastError: string | null;
}): CalendarConnectionStatus => {
  return {
    provider: input.provider,
    connected: true,
    externalEmail: input.externalEmail,
    lastSyncedAt: input.lastSyncedAt ? input.lastSyncedAt.toISOString() : null,
    nextSyncAt: input.nextSyncAt ? input.nextSyncAt.toISOString() : null,
    lastError: input.lastError,
  };
};

export const toCalendarProvider = (value: string): CalendarProvider | null => {
  return value === 'google' || value === 'microsoft' ? value : null;
};

export const clampWebhookDeliveryBatchLimit = (rawLimit: string | undefined): number => {
  const parsed = rawLimit ? Number.parseInt(rawLimit, 10) : Number.NaN;
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(WEBHOOK_DELIVERY_BATCH_LIMIT_MAX, parsed))
    : WEBHOOK_DELIVERY_BATCH_LIMIT_DEFAULT;
};

export const clampCalendarWritebackBatchLimit = (rawLimit: number | string | undefined): number => {
  const parsed =
    typeof rawLimit === 'number' ? rawLimit : rawLimit ? Number.parseInt(rawLimit, 10) : Number.NaN;
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(CALENDAR_WRITEBACK_BATCH_LIMIT_MAX, parsed))
    : CALENDAR_WRITEBACK_BATCH_LIMIT_DEFAULT;
};

export const clampNotificationRunBatchLimit = (rawLimit: number | string | undefined): number => {
  const parsed =
    typeof rawLimit === 'number' ? rawLimit : rawLimit ? Number.parseInt(rawLimit, 10) : Number.NaN;
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(NOTIFICATION_RUN_BATCH_LIMIT_MAX, parsed))
    : NOTIFICATION_RUN_BATCH_LIMIT_DEFAULT;
};

const stripTrailingSlash = (value: string): string => {
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

export const resolveAppBaseUrl = (env: Bindings, request: Request): string => {
  const configured = env.APP_BASE_URL?.trim();
  if (configured) {
    try {
      return stripTrailingSlash(new URL(configured).origin);
    } catch {
      throw new Error('APP_BASE_URL must be a valid absolute URL.');
    }
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }
  throw new Error('APP_BASE_URL is required for non-local environments.');
};
