/* global __ENV */

import { group, sleep } from 'k6';

import {
  apiBaseUrl,
  availabilityUrl,
  buildAuthedHeaders,
  buildIdempotentHeaders,
  expectStatus,
  getJson,
  oneOnOneBookingPayload,
  postJson,
  requireEnv,
  runWorker,
  teamBookingPayload,
} from './lib/config.js';

export const options = {
  scenarios: {
    availability_reads: {
      executor: 'constant-arrival-rate',
      rate: 12,
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 6,
      maxVUs: 20,
    },
    booking_commits: {
      executor: 'constant-arrival-rate',
      rate: 4,
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 4,
      maxVUs: 12,
      exec: 'bookingCommits',
    },
    worker_batches: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 12,
      maxDuration: '1m',
      exec: 'workerBatches',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.1'],
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    checks: ['rate>0.9'],
  },
};

requireEnv([
  'ONE_ON_ONE_USERNAME',
  'ONE_ON_ONE_EVENT_SLUG',
  'ONE_ON_ONE_STARTS_AT',
  'TEAM_SLUG',
  'TEAM_EVENT_SLUG',
  'TEAM_STARTS_AT',
]);

export default function availabilityReads() {
  group('baseline availability read', () => {
    const response = getJson(
      availabilityUrl({
        kind: 'user',
        username: __ENV.ONE_ON_ONE_USERNAME,
        eventSlug: __ENV.ONE_ON_ONE_EVENT_SLUG,
        start: __ENV.ONE_ON_ONE_STARTS_AT,
      }),
      { tags: { flow: 'availability', profile: 'baseline' } },
    );
    expectStatus(response, [200], 'baseline availability responds');
  });
  sleep(0.5);
}

export function bookingCommits() {
  const bookingResponse = postJson(`${apiBaseUrl}/v0/bookings`, oneOnOneBookingPayload(), {
    headers: buildIdempotentHeaders('baseline-booking'),
    tags: { flow: 'booking', profile: 'baseline', kind: 'one_on_one' },
  });
  expectStatus(bookingResponse, [200, 409], 'baseline one-on-one booking explicit');

  const teamResponse = postJson(`${apiBaseUrl}/v0/team-bookings`, teamBookingPayload(), {
    headers: buildIdempotentHeaders('baseline-team-booking'),
    tags: { flow: 'booking', profile: 'baseline', kind: 'team' },
  });
  expectStatus(teamResponse, [200, 409], 'baseline team booking explicit');
}

export function workerBatches() {
  if (!__ENV.AUTH_TOKEN) {
    return;
  }

  const webhookRun = runWorker(`${apiBaseUrl}/v0/webhooks/deliveries/run`, 25, {
    headers: buildAuthedHeaders(),
    tags: { flow: 'worker', profile: 'baseline', kind: 'webhooks' },
  });
  expectStatus(webhookRun, [200], 'baseline webhook worker explicit');

  const writebackRun = runWorker(`${apiBaseUrl}/v0/calendar/writeback/run`, 25, {
    headers: buildAuthedHeaders(),
    tags: { flow: 'worker', profile: 'baseline', kind: 'writeback' },
  });
  expectStatus(writebackRun, [200], 'baseline writeback worker explicit');
}
