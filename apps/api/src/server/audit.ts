export type AuditLevel = 'info' | 'warn' | 'error';

export type AuditEventName =
  | 'auth_exchange_rate_limited'
  | 'auth_exchange_upstream_failed'
  | 'auth_exchange_user_lookup_failed'
  | 'auth_exchange_username_resolution_failed'
  | 'availability_read_completed'
  | 'booking_commit_completed'
  | 'booking_action_misuse_detected'
  | 'calendar_connect_completed'
  | 'calendar_disconnect_completed'
  | 'calendar_sync_completed'
  | 'calendar_writeback_batch_completed'
  | 'calendar_writeback_failed_permanently'
  | 'webhook_delivery_batch_completed'
  | 'webhook_delivery_failed_permanently'
  | 'webhook_subscription_created'
  | 'webhook_subscription_updated'
  | 'webhook_subscription_toggled';

type AuditPayload = {
  event: AuditEventName;
  level: AuditLevel;
  actorUserId?: string;
  provider?: 'google' | 'microsoft';
  route?: string;
  statusCode?: number;
  durationMs?: number;
  retryable?: boolean;
  attempts?: number;
  [key: string]: unknown;
};

const resolveConsoleMethod = (level: AuditLevel): typeof console.info => {
  if (level === 'warn') {
    return console.warn;
  }
  if (level === 'error') {
    return console.error;
  }
  return console.info;
};

export const emitAuditEvent = (payload: AuditPayload): void => {
  resolveConsoleMethod(payload.level)(
    JSON.stringify({
      kind: 'audit',
      timestamp: new Date().toISOString(),
      ...payload,
    }),
  );
};
