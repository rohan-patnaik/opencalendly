import { describe, expect, it } from 'vitest';

import {
  chooseRoundRobinAssignee,
  computeTeamAvailabilitySlots,
} from './team-scheduling';

const weekdayRule = {
  dayOfWeek: 1,
  startMinute: 540,
  endMinute: 660,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
};

describe('chooseRoundRobinAssignee', () => {
  it('selects the next available member starting from cursor', () => {
    const result = chooseRoundRobinAssignee({
      orderedMemberIds: ['member-a', 'member-b', 'member-c'],
      availableMemberIds: ['member-b', 'member-c'],
      cursor: 0,
    });

    expect(result?.assigneeUserId).toBe('member-b');
    expect(result?.nextCursor).toBe(2);
  });

  it('returns null when no members are available', () => {
    const result = chooseRoundRobinAssignee({
      orderedMemberIds: ['member-a', 'member-b'],
      availableMemberIds: [],
      cursor: 1,
    });

    expect(result).toBeNull();
  });
});

describe('computeTeamAvailabilitySlots', () => {
  it('rotates round-robin assignments across consecutive slots', () => {
    const result = computeTeamAvailabilitySlots({
      mode: 'round_robin',
      rangeStartIso: '2026-03-02T00:00:00.000Z',
      days: 1,
      durationMinutes: 30,
      roundRobinCursor: 0,
      members: [
        {
          userId: 'member-a',
          timezone: 'UTC',
          rules: [weekdayRule],
          overrides: [],
          bookings: [],
        },
        {
          userId: 'member-b',
          timezone: 'UTC',
          rules: [weekdayRule],
          overrides: [],
          bookings: [],
        },
      ],
    });

    expect(result.slots[0]?.assignmentUserIds).toEqual(['member-a']);
    expect(result.slots[1]?.assignmentUserIds).toEqual(['member-b']);
    expect(result.slots[2]?.assignmentUserIds).toEqual(['member-a']);
  });

  it('returns only intersection slots for collective mode', () => {
    const result = computeTeamAvailabilitySlots({
      mode: 'collective',
      rangeStartIso: '2026-03-02T00:00:00.000Z',
      days: 1,
      durationMinutes: 30,
      members: [
        {
          userId: 'member-a',
          timezone: 'UTC',
          rules: [weekdayRule],
          overrides: [],
          bookings: [],
        },
        {
          userId: 'member-b',
          timezone: 'UTC',
          rules: [
            {
              dayOfWeek: 1,
              startMinute: 570,
              endMinute: 660,
              bufferBeforeMinutes: 0,
              bufferAfterMinutes: 0,
            },
          ],
          overrides: [],
          bookings: [],
        },
      ],
    });

    expect(result.slots.every((slot) => slot.assignmentUserIds.length === 2)).toBe(true);
    expect(result.slots[0]?.startsAt).toBe('2026-03-02T09:30:00.000Z');
    expect(result.slots.some((slot) => slot.startsAt === '2026-03-02T09:00:00.000Z')).toBe(false);
  });
});

