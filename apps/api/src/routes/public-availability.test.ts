import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  dbRef,
  emitTeamAvailabilityAuditMock,
  findTeamEventTypeContextMock,
  isPublicBookingRateLimitedMock,
  listTeamMemberSchedulesMock,
  resolveAuthenticatedUserMock,
  withDatabaseMock,
} = vi.hoisted(() => ({
  dbRef: { current: {} as unknown },
  emitTeamAvailabilityAuditMock: vi.fn(),
  findTeamEventTypeContextMock: vi.fn(),
  isPublicBookingRateLimitedMock: vi.fn(),
  listTeamMemberSchedulesMock: vi.fn(),
  resolveAuthenticatedUserMock: vi.fn(),
  withDatabaseMock: vi.fn(async (_context: unknown, handler: (db: unknown) => Promise<Response>) =>
    handler(dbRef.current),
  ),
}));

vi.mock('../server/database', () => ({
  withDatabase: withDatabaseMock,
}));

vi.mock('../server/demo-quota', () => ({
  requiresLaunchDemoAuthForTeamRoute: vi.fn(() => false),
  requiresLaunchDemoAuthForUserRoute: vi.fn(() => false),
}));

vi.mock('../server/rate-limit', () => ({
  isPublicBookingRateLimited: isPublicBookingRateLimitedMock,
  resolveRateLimitClientKey: vi.fn(() => 'client-key'),
}));

vi.mock('../server/team-context', () => ({
  findTeamEventTypeContext: findTeamEventTypeContextMock,
  listConfirmedBookingStartsForEventType: vi.fn(async () => []),
  toEventTypeBookingCaps: vi.fn(() => ({
    dailyBookingLimit: null,
    weeklyBookingLimit: null,
    monthlyBookingLimit: null,
  })),
}));

vi.mock('../server/team-schedules', () => ({
  listExternalBusyWindowsForUser: vi.fn(),
  listTeamMemberSchedules: listTeamMemberSchedulesMock,
  listTimeOffBlocksForUser: vi.fn(),
}));

vi.mock('../server/auth-session', () => ({
  resolveAuthenticatedUser: resolveAuthenticatedUserMock,
}));

vi.mock('./public-availability-audit', () => ({
  emitTeamAvailabilityAudit: emitTeamAvailabilityAuditMock,
  emitUserAvailabilityAudit: vi.fn(),
}));

import { registerPublicAvailabilityRoutes } from './public-availability';

describe('GET /v0/teams/:teamSlug/event-types/:eventSlug/availability', () => {
  beforeEach(() => {
    dbRef.current = {};
    emitTeamAvailabilityAuditMock.mockReset();
    findTeamEventTypeContextMock.mockReset();
    isPublicBookingRateLimitedMock.mockReset();
    listTeamMemberSchedulesMock.mockReset();
    resolveAuthenticatedUserMock.mockReset();
    withDatabaseMock.mockClear();
  });

  it('fails instead of advertising slots when required member schedules are incomplete', async () => {
    findTeamEventTypeContextMock.mockResolvedValue({
      team: { id: 'team-1', ownerUserId: 'owner-1', slug: 'customer-success', name: 'Customer Success' },
      eventType: {
        id: 'event-1',
        userId: 'owner-1',
        slug: 'team-intro',
        name: 'Team Intro',
        durationMinutes: 30,
        dailyBookingLimit: null,
        weeklyBookingLimit: null,
        monthlyBookingLimit: null,
        locationType: 'video',
        locationValue: null,
        questions: [],
        organizerTimezone: 'UTC',
        isActive: true,
      },
      mode: 'collective',
      roundRobinCursor: 0,
      members: [
        { userId: 'member-1', role: 'owner' },
        { userId: 'member-2', role: 'member' },
      ],
    });
    isPublicBookingRateLimitedMock.mockResolvedValue(false);
    listTeamMemberSchedulesMock.mockResolvedValue([
      {
        userId: 'member-1',
        timezone: 'UTC',
        rules: [],
        overrides: [],
        bookings: [],
      },
    ]);

    const app = new Hono();
    registerPublicAvailabilityRoutes(app as never);

    const response = await app.request(
      'http://localhost/v0/teams/customer-success/event-types/team-intro/availability?timezone=UTC&start=2026-03-01T00:00:00.000Z&days=7',
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual({
      ok: false,
      error: 'Some required team members no longer exist.',
    });
  });
});
