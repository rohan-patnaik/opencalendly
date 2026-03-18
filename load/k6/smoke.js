/* global __ENV */

import { group, sleep } from 'k6';

import {
  apiBaseUrl,
  availabilityUrl,
  buildAuthedHeaders,
  buildIdempotentHeaders,
  cancelPayload,
  expectStatus,
  getJson,
  oneOnOneBookingPayload,
  postJson,
  requireEnv,
  reschedulePayload,
  runWorker,
  teamBookingPayload,
} from './lib/config.js';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.95'],
  },
};

export default function smoke() {
  requireEnv([
    'ONE_ON_ONE_USERNAME',
    'ONE_ON_ONE_EVENT_SLUG',
    'ONE_ON_ONE_STARTS_AT',
    'TEAM_SLUG',
    'TEAM_EVENT_SLUG',
    'TEAM_STARTS_AT',
  ]);

  group('public availability', () => {
    const oneOnOneAvailability = getJson(
      availabilityUrl({
        kind: 'user',
        username: __ENV.ONE_ON_ONE_USERNAME,
        eventSlug: __ENV.ONE_ON_ONE_EVENT_SLUG,
        start: __ENV.ONE_ON_ONE_STARTS_AT,
      }),
      { tags: { flow: 'availability', kind: 'one_on_one' } },
    );
    expectStatus(oneOnOneAvailability, [200], 'one-on-one availability loads');

    const teamAvailability = getJson(
      availabilityUrl({
        kind: 'team',
        teamSlug: __ENV.TEAM_SLUG,
        eventSlug: __ENV.TEAM_EVENT_SLUG,
        start: __ENV.TEAM_STARTS_AT,
      }),
      { tags: { flow: 'availability', kind: 'team' } },
    );
    expectStatus(teamAvailability, [200], 'team availability loads');
  });

  group('booking create endpoints', () => {
    const bookingResponse = postJson(`${apiBaseUrl}/v0/bookings`, oneOnOneBookingPayload(), {
      headers: buildIdempotentHeaders('smoke-booking'),
      tags: { flow: 'booking', kind: 'one_on_one' },
    });
    expectStatus(bookingResponse, [200, 409], 'one-on-one booking returns success or conflict');

    const teamResponse = postJson(`${apiBaseUrl}/v0/team-bookings`, teamBookingPayload(), {
      headers: buildIdempotentHeaders('smoke-team-booking'),
      tags: { flow: 'booking', kind: 'team' },
    });
    expectStatus(teamResponse, [200, 409], 'team booking returns success or conflict');
  });

  if (__ENV.RESCHEDULE_TOKEN && __ENV.RESCHEDULE_STARTS_AT) {
    group('reschedule action', () => {
      const response = postJson(
        `${apiBaseUrl}/v0/bookings/actions/${__ENV.RESCHEDULE_TOKEN}/reschedule`,
        reschedulePayload(),
        {
          headers: buildIdempotentHeaders('smoke-reschedule'),
          tags: { flow: 'booking_action', kind: 'reschedule' },
        },
      );
      expectStatus(response, [200, 404, 409, 410], 'reschedule action responds explicitly');
    });
  }

  if (__ENV.CANCEL_TOKEN) {
    group('cancel action', () => {
      const response = postJson(
        `${apiBaseUrl}/v0/bookings/actions/${__ENV.CANCEL_TOKEN}/cancel`,
        cancelPayload(),
        {
          headers: buildAuthedHeaders(),
          tags: { flow: 'booking_action', kind: 'cancel' },
        },
      );
      expectStatus(response, [200, 404, 410], 'cancel action responds explicitly');
    });
  }

  if (__ENV.AUTH_TOKEN) {
    group('worker endpoints', () => {
      const webhookRun = runWorker(`${apiBaseUrl}/v0/webhooks/deliveries/run`, 10, {
        tags: { flow: 'worker', kind: 'webhooks' },
      });
      expectStatus(webhookRun, [200], 'webhook worker runs');

      const writebackRun = runWorker(`${apiBaseUrl}/v0/calendar/writeback/run`, 10, {
        tags: { flow: 'worker', kind: 'writeback' },
      });
      expectStatus(writebackRun, [200], 'writeback worker runs');
    });
  }

  sleep(1);
}
