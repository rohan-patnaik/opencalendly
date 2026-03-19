/* global __ENV */

import { group, sleep } from 'k6';

import {
  apiBaseUrl,
  availabilityUrl,
  buildPublicHeaders,
  buildPublicAuthedHeaders,
  buildPublicIdempotentHeaders,
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
      {
        headers: buildPublicHeaders(),
        tags: { flow: 'availability', kind: 'one_on_one' },
        expectedStatuses: [200],
      },
    );
    expectStatus(oneOnOneAvailability, [200], 'one-on-one availability loads');

    const teamAvailability = getJson(
      availabilityUrl({
        kind: 'team',
        teamSlug: __ENV.TEAM_SLUG,
        eventSlug: __ENV.TEAM_EVENT_SLUG,
        start: __ENV.TEAM_STARTS_AT,
      }),
      {
        headers: buildPublicHeaders(),
        tags: { flow: 'availability', kind: 'team' },
        expectedStatuses: [200],
      },
    );
    expectStatus(teamAvailability, [200], 'team availability loads');
  });

  group('booking create endpoints', () => {
    const bookingResponse = postJson(`${apiBaseUrl}/v0/bookings`, oneOnOneBookingPayload(), {
      headers: buildPublicIdempotentHeaders('smoke-booking'),
      tags: { flow: 'booking', kind: 'one_on_one' },
      expectedStatuses: [200, 409, 429],
    });
    expectStatus(bookingResponse, [200, 409], 'one-on-one booking returns success or conflict');

    const teamResponse = postJson(`${apiBaseUrl}/v0/team-bookings`, teamBookingPayload(), {
      headers: buildPublicIdempotentHeaders('smoke-team-booking'),
      tags: { flow: 'booking', kind: 'team' },
      expectedStatuses: [200, 409, 429],
    });
    expectStatus(teamResponse, [200, 409], 'team booking returns success or conflict');
  });

  if (__ENV.RESCHEDULE_TOKEN && __ENV.RESCHEDULE_STARTS_AT) {
    group('reschedule action', () => {
      const response = postJson(
        `${apiBaseUrl}/v0/bookings/actions/${__ENV.RESCHEDULE_TOKEN}/reschedule`,
        reschedulePayload(),
        {
          headers: buildPublicIdempotentHeaders('smoke-reschedule'),
          tags: { flow: 'booking_action', kind: 'reschedule' },
          expectedStatuses: [200, 404, 409, 410],
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
          headers: buildPublicAuthedHeaders(),
          tags: { flow: 'booking_action', kind: 'cancel' },
          expectedStatuses: [200, 404, 410],
        },
      );
      expectStatus(response, [200, 404, 410], 'cancel action responds explicitly');
    });
  }

  if (__ENV.AUTH_TOKEN) {
    group('worker endpoints', () => {
      const webhookRun = runWorker(`${apiBaseUrl}/v0/webhooks/deliveries/run`, 10, {
        tags: { flow: 'worker', kind: 'webhooks' },
        expectedStatuses: [200],
      });
      expectStatus(webhookRun, [200], 'webhook worker runs');

      const writebackRun = runWorker(`${apiBaseUrl}/v0/calendar/writeback/run`, 10, {
        tags: { flow: 'worker', kind: 'writeback' },
        expectedStatuses: [200],
      });
      expectStatus(writebackRun, [200], 'writeback worker runs');
    });
  }

  sleep(1);
}
