import { emitAuditEvent } from '../server/audit';

type AvailabilityAuditBase = {
  route: string;
  statusCode: number;
  durationMs: number;
  eventSlug: string;
  level?: 'info' | 'warn';
  dataLoadMs?: number;
  computeMs?: number;
  capFilterMs?: number;
  slotCount?: number;
};

export const emitUserAvailabilityAudit = (
  input: AvailabilityAuditBase & {
    username: string;
  },
): void => {
  emitAuditEvent({
    event: 'availability_read_completed',
    level: input.level ?? 'info',
    route: input.route,
    statusCode: input.statusCode,
    durationMs: input.durationMs,
    username: input.username,
    eventSlug: input.eventSlug,
    ...(input.dataLoadMs !== undefined ? { dataLoadMs: input.dataLoadMs } : {}),
    ...(input.computeMs !== undefined ? { computeMs: input.computeMs } : {}),
    ...(input.capFilterMs !== undefined ? { capFilterMs: input.capFilterMs } : {}),
    ...(input.slotCount !== undefined ? { slotCount: input.slotCount } : {}),
  });
};

export const emitTeamAvailabilityAudit = (
  input: AvailabilityAuditBase & {
    teamSlug: string;
    memberCount?: number;
  },
): void => {
  emitAuditEvent({
    event: 'availability_read_completed',
    level: input.level ?? 'info',
    route: input.route,
    statusCode: input.statusCode,
    durationMs: input.durationMs,
    teamSlug: input.teamSlug,
    eventSlug: input.eventSlug,
    ...(input.dataLoadMs !== undefined ? { dataLoadMs: input.dataLoadMs } : {}),
    ...(input.computeMs !== undefined ? { computeMs: input.computeMs } : {}),
    ...(input.capFilterMs !== undefined ? { capFilterMs: input.capFilterMs } : {}),
    ...(input.slotCount !== undefined ? { slotCount: input.slotCount } : {}),
    ...(input.memberCount !== undefined ? { memberCount: input.memberCount } : {}),
  });
};
