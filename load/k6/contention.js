import { sleep } from 'k6';
import { Rate } from 'k6/metrics';

import {
  apiBaseUrl,
  buildPublicIdempotentHeaders,
  expectStatus,
  oneOnOneBookingPayload,
  postJson,
  requireEnv,
  teamBookingPayload,
} from './lib/config.js';

const bookingConflictRate = new Rate('booking_conflict_rate');
const bookingUnexpectedFailureRate = new Rate('booking_unexpected_failure_rate');

export const options = {
  scenarios: {
    one_on_one_same_slot: {
      executor: 'constant-vus',
      vus: 8,
      duration: '30s',
      exec: 'sameSlotOneOnOne',
    },
    team_same_slot: {
      executor: 'constant-vus',
      vus: 8,
      duration: '30s',
      exec: 'sameSlotTeam',
      startTime: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(95)<2000', 'p(99)<4000'],
    checks: ['rate>0.9'],
    booking_unexpected_failure_rate: ['rate==0'],
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

const recordBookingOutcome = (response) => {
  bookingConflictRate.add(response.status === 409);
  bookingUnexpectedFailureRate.add(![200, 409, 429].includes(response.status));
};

export function sameSlotOneOnOne() {
  const response = postJson(`${apiBaseUrl}/v0/bookings`, oneOnOneBookingPayload(), {
    headers: buildPublicIdempotentHeaders('contention-booking'),
    tags: { flow: 'booking', profile: 'contention', kind: 'one_on_one' },
    expectedStatuses: [200, 409, 429],
  });
  expectStatus(response, [200, 409], 'contention one-on-one returns success or conflict');
  recordBookingOutcome(response);
  sleep(0.2);
}

export function sameSlotTeam() {
  const response = postJson(`${apiBaseUrl}/v0/team-bookings`, teamBookingPayload(), {
    headers: buildPublicIdempotentHeaders('contention-team-booking'),
    tags: { flow: 'booking', profile: 'contention', kind: 'team' },
    expectedStatuses: [200, 409, 429],
  });
  expectStatus(response, [200, 409], 'contention team booking returns success or conflict');
  recordBookingOutcome(response);
  sleep(0.2);
}
