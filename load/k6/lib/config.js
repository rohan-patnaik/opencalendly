/* global __ENV, __VU, __ITER */

import http from 'k6/http';
import { check } from 'k6';

export const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
export const apiBaseUrl = __ENV.API_BASE_URL || 'http://localhost:8787';

const jsonHeaders = {
  'Content-Type': 'application/json',
};

export const buildAuthedHeaders = () => {
  if (!__ENV.AUTH_TOKEN) {
    return jsonHeaders;
  }

  return {
    ...jsonHeaders,
    Authorization: `Bearer ${__ENV.AUTH_TOKEN}`,
  };
};

export const buildIdempotentHeaders = (scope) => ({
  ...jsonHeaders,
  'Idempotency-Key': `${scope}-${__VU}-${__ITER}-${Date.now()}`,
});

export const shiftIsoByMinutes = (isoString, minutes) => {
  const base = new Date(isoString);
  return new Date(base.getTime() + minutes * 60_000).toISOString();
};

export const availabilityUrl = (input) => {
  const timezone = encodeURIComponent(__ENV.TIMEZONE || 'Asia/Kolkata');
  const start = encodeURIComponent(input.start);
  const days = encodeURIComponent(input.days || '7');

  if (input.kind === 'team') {
    return `${apiBaseUrl}/v0/teams/${encodeURIComponent(input.teamSlug)}/event-types/${encodeURIComponent(input.eventSlug)}/availability?timezone=${timezone}&start=${start}&days=${days}`;
  }

  return `${apiBaseUrl}/v0/users/${encodeURIComponent(input.username)}/event-types/${encodeURIComponent(input.eventSlug)}/availability?timezone=${timezone}&start=${start}&days=${days}`;
};

export const postJson = (url, payload, params = {}) =>
  http.post(url, JSON.stringify(payload), {
    headers: params.headers || jsonHeaders,
    tags: params.tags,
  });

export const getJson = (url, params = {}) =>
  http.get(url, {
    headers: params.headers,
    tags: params.tags,
  });

export const runWorker = (url, limit, params = {}) =>
  postJson(url, typeof limit === 'number' ? { limit } : {}, {
    headers: params.headers || buildAuthedHeaders(),
    tags: params.tags,
  });

export const expectStatus = (response, expected, label) =>
  check(response, {
    [label]: (value) => expected.includes(value.status),
  });

export const oneOnOneBookingPayload = (overrides = {}) => ({
  username: __ENV.ONE_ON_ONE_USERNAME,
  eventSlug: __ENV.ONE_ON_ONE_EVENT_SLUG,
  startsAt: __ENV.ONE_ON_ONE_STARTS_AT,
  timezone: __ENV.TIMEZONE || 'Asia/Kolkata',
  inviteeName: __ENV.INVITEE_NAME || 'Load Test Invitee',
  inviteeEmail: __ENV.INVITEE_EMAIL || `load-test+${Date.now()}@example.com`,
  answers: {},
  ...overrides,
});

export const teamBookingPayload = (overrides = {}) => ({
  teamSlug: __ENV.TEAM_SLUG,
  eventSlug: __ENV.TEAM_EVENT_SLUG,
  startsAt: __ENV.TEAM_STARTS_AT,
  timezone: __ENV.TIMEZONE || 'Asia/Kolkata',
  inviteeName: __ENV.INVITEE_NAME || 'Load Test Invitee',
  inviteeEmail: __ENV.INVITEE_EMAIL || `load-test+${Date.now()}@example.com`,
  answers: {},
  ...overrides,
});

export const reschedulePayload = () => ({
  startsAt: __ENV.RESCHEDULE_STARTS_AT,
  timezone: __ENV.TIMEZONE || 'Asia/Kolkata',
});

export const cancelPayload = () => ({
  reason: __ENV.CANCEL_REASON || 'load-test',
});

export const requireEnv = (keys) => {
  const missing = keys.filter((key) => !__ENV[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required k6 env vars: ${missing.join(', ')}`);
  }
};
