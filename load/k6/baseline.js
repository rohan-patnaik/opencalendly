/* global __ENV, __ITER */

import { group, sleep } from 'k6';

import {
  apiBaseUrl,
  availabilityUrl,
  buildAuthedHeaders,
  buildPublicHeaders,
  buildPublicIdempotentHeaders,
  expectStatus,
  getJson,
  oneOnOneBookingPayload,
  postJson,
  requireEnv,
  runWorker,
  shiftIsoByMinutes,
  teamBookingPayload,
} from './lib/config.js';

const SLOT_OFFSET_STEP_MINUTES = 15;

const scenarios = {
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
};

if (__ENV.AUTH_TOKEN) {
  scenarios.worker_batches = {
    executor: 'per-vu-iterations',
    vus: 1,
    iterations: 12,
    maxDuration: '1m',
    exec: 'workerBatches',
  };
}

export const options = {
  scenarios,
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
      {
        headers: buildPublicHeaders(),
        tags: { flow: 'availability', profile: 'baseline' },
        expectedStatuses: [200],
      },
    );
    expectStatus(response, [200], 'baseline availability responds');
  });
  sleep(0.5);
}

export function bookingCommits() {
  const oneOnOneStartsAt = shiftIsoByMinutes(
    __ENV.ONE_ON_ONE_STARTS_AT,
    (__ITER % 12) * SLOT_OFFSET_STEP_MINUTES,
  );
  const teamStartsAt = shiftIsoByMinutes(
    __ENV.TEAM_STARTS_AT,
    ((__ITER % 12) + 12) * SLOT_OFFSET_STEP_MINUTES,
  );

  const bookingResponse = postJson(
    `${apiBaseUrl}/v0/bookings`,
    oneOnOneBookingPayload({ startsAt: oneOnOneStartsAt }),
    {
      headers: buildPublicIdempotentHeaders('baseline-booking'),
      tags: { flow: 'booking', profile: 'baseline', kind: 'one_on_one' },
      expectedStatuses: [200, 409, 429],
    },
  );
  expectStatus(bookingResponse, [200, 409], 'baseline one-on-one booking explicit');

  const teamResponse = postJson(`${apiBaseUrl}/v0/team-bookings`, teamBookingPayload({ startsAt: teamStartsAt }), {
    headers: buildPublicIdempotentHeaders('baseline-team-booking'),
    tags: { flow: 'booking', profile: 'baseline', kind: 'team' },
    expectedStatuses: [200, 409, 429],
  });
  expectStatus(teamResponse, [200, 409], 'baseline team booking explicit');
}

export function workerBatches() {
  const webhookRun = runWorker(`${apiBaseUrl}/v0/webhooks/deliveries/run`, 25, {
    headers: buildAuthedHeaders(),
    tags: { flow: 'worker', profile: 'baseline', kind: 'webhooks' },
    expectedStatuses: [200],
  });
  expectStatus(webhookRun, [200], 'baseline webhook worker explicit');

  const writebackRun = runWorker(`${apiBaseUrl}/v0/calendar/writeback/run`, 25, {
    headers: buildAuthedHeaders(),
    tags: { flow: 'worker', profile: 'baseline', kind: 'writeback' },
    expectedStatuses: [200],
  });
  expectStatus(writebackRun, [200], 'baseline writeback worker explicit');
}
