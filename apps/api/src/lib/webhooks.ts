import { createHmac, randomUUID } from 'node:crypto';

import {
  isSafeWebhookTargetUrl,
  webhookEventSchema,
  webhookEventTypeSchema,
  type WebhookEvent,
  type WebhookEventType,
} from '@opencalendly/shared';

export const WEBHOOK_DEFAULT_MAX_ATTEMPTS = 6;
export const WEBHOOK_RETRY_BASE_SECONDS = 30;
export const WEBHOOK_RETRY_MAX_SECONDS = 60 * 60;
const DNS_OVER_HTTPS_URL = 'https://cloudflare-dns.com/dns-query';

type DnsAnswer = {
  type?: number;
  data?: string;
};

type DnsJsonResponse = {
  Answer?: DnsAnswer[];
};

export type BuildWebhookEventInput = {
  type: WebhookEventType;
  payload: {
    bookingId: string;
    eventTypeId: string;
    organizerId: string;
    inviteeEmail: string;
    inviteeName: string;
    startsAt: string;
    endsAt: string;
    metadata?: Record<string, unknown>;
  };
  id?: string;
  createdAt?: string;
};

export const normalizeWebhookEvents = (events: WebhookEventType[]): WebhookEventType[] => {
  return Array.from(new Set(events));
};

export const parseWebhookEventTypes = (value: unknown): WebhookEventType[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsed = value
    .map((entry) => webhookEventTypeSchema.safeParse(entry))
    .filter((entry) => entry.success)
    .map((entry) => entry.data);

  return normalizeWebhookEvents(parsed);
};

export const buildWebhookEvent = (input: BuildWebhookEventInput): WebhookEvent => {
  return webhookEventSchema.parse({
    id: input.id ?? randomUUID(),
    type: input.type,
    createdAt: input.createdAt ?? new Date().toISOString(),
    payload: input.payload,
  });
};

export const createWebhookSignature = (
  secret: string,
  serializedPayload: string,
  timestampSeconds: number,
): string => {
  return createHmac('sha256', secret).update(`${timestampSeconds}.${serializedPayload}`).digest('hex');
};

export const buildWebhookSignatureHeader = (
  secret: string,
  serializedPayload: string,
  timestampSeconds: number,
): string => {
  return `t=${timestampSeconds},v1=${createWebhookSignature(secret, serializedPayload, timestampSeconds)}`;
};

export const computeWebhookRetryDelaySeconds = (attemptNumber: number): number => {
  const safeAttempt = Math.max(1, Math.floor(attemptNumber));
  const uncappedDelay = WEBHOOK_RETRY_BASE_SECONDS * 2 ** (safeAttempt - 1);
  return Math.min(WEBHOOK_RETRY_MAX_SECONDS, uncappedDelay);
};

export const computeNextWebhookAttemptAt = (attemptNumber: number, now: Date = new Date()): Date => {
  const delaySeconds = computeWebhookRetryDelaySeconds(attemptNumber);
  return new Date(now.getTime() + delaySeconds * 1000);
};

export const isWebhookDeliveryExhausted = (attemptCount: number, maxAttempts: number): boolean => {
  return attemptCount >= maxAttempts;
};

export const isAllowedWebhookTargetUrl = (value: string): boolean => {
  return isSafeWebhookTargetUrl(value);
};

const parseIpv4 = (value: string): number[] | null => {
  const parts = value.split('.');
  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }

  return octets;
};

const isUnsafeResolvedIpv4 = (value: string): boolean => {
  const octets = parseIpv4(value);
  if (!octets) {
    return false;
  }

  const a = octets[0]!;
  const b = octets[1]!;
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
};

const expandIpv6Segments = (value: string): number[] | null => {
  const normalized = value.toLowerCase();
  if (!normalized.includes(':')) {
    return null;
  }

  const [head, tail = ''] = normalized.split('::');
  if (normalized.split('::').length > 2) {
    return null;
  }

  const headSegments = head
    ? head.split(':').filter(Boolean).map((segment) => Number.parseInt(segment, 16))
    : [];
  const tailSegments = tail
    ? tail.split(':').filter(Boolean).map((segment) => Number.parseInt(segment, 16))
    : [];

  if (
    [...headSegments, ...tailSegments].some(
      (segment) => !Number.isInteger(segment) || segment < 0 || segment > 0xffff,
    )
  ) {
    return null;
  }

  if (headSegments.length + tailSegments.length > 8) {
    return null;
  }

  const fillerLength = 8 - headSegments.length - tailSegments.length;
  return [...headSegments, ...new Array(fillerLength).fill(0), ...tailSegments];
};

const isUnsafeResolvedIpv6 = (value: string): boolean => {
  const segments = expandIpv6Segments(value);
  if (!segments) {
    return false;
  }

  const [first = 0] = segments;
  const second = segments[1] ?? 0;

  return (
    segments.every((segment) => segment === 0) ||
    (first === 0 && second === 1) ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00
  );
};

const extractResolvedAddresses = (payload: DnsJsonResponse): string[] => {
  return (payload.Answer ?? [])
    .map((answer) => answer.data?.trim())
    .filter((answer): answer is string => Boolean(answer));
};

const resolveDnsJson = async (hostname: string, type: 'A' | 'AAAA'): Promise<string[]> => {
  const url = new URL(DNS_OVER_HTTPS_URL);
  url.searchParams.set('name', hostname);
  url.searchParams.set('type', type);

  const response = await fetch(url, {
    headers: {
      accept: 'application/dns-json',
    },
  });

  if (!response.ok) {
    throw new Error(`DNS resolution failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as DnsJsonResponse;
  return extractResolvedAddresses(payload);
};

export const resolveWebhookTargetSafety = async (
  value: string,
): Promise<{ ok: true } | { ok: false; retryable: boolean; reason: string }> => {
  if (!isAllowedWebhookTargetUrl(value)) {
    return {
      ok: false,
      retryable: false,
      reason: 'Webhook target URL is not allowed. Use an HTTPS URL with a public hostname.',
    };
  }

  let hostname: string;
  try {
    hostname = new URL(value).hostname;
  } catch {
    return {
      ok: false,
      retryable: false,
      reason: 'Webhook target URL is not allowed. Use an HTTPS URL with a public hostname.',
    };
  }

  try {
    const [ipv4Addresses, ipv6Addresses] = await Promise.all([
      resolveDnsJson(hostname, 'A'),
      resolveDnsJson(hostname, 'AAAA'),
    ]);
    const addresses = [...ipv4Addresses, ...ipv6Addresses];

    if (addresses.length === 0) {
      return {
        ok: false,
        retryable: true,
        reason: 'Unable to verify the webhook target address.',
      };
    }

    if (addresses.some((address) => isUnsafeResolvedIpv4(address) || isUnsafeResolvedIpv6(address))) {
      return {
        ok: false,
        retryable: false,
        reason: 'Webhook target resolves to a private or otherwise unsafe network address.',
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      reason: error instanceof Error ? error.message : 'Unable to verify the webhook target address.',
    };
  }
};
