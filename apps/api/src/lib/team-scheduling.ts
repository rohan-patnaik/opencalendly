import {
  computeAvailabilitySlots,
  type AvailabilityOverrideWindow,
  type AvailabilitySlot,
  type ExistingBooking,
  type WeeklyAvailabilityRule,
} from './availability';

export type TeamSchedulingMode = 'round_robin' | 'collective';

export type TeamMemberSchedule = {
  userId: string;
  timezone: string;
  rules: WeeklyAvailabilityRule[];
  overrides: AvailabilityOverrideWindow[];
  bookings: ExistingBooking[];
};

export type TeamSlot = {
  startsAt: string;
  endsAt: string;
  assignmentUserIds: string[];
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
};

type TeamSlotMatrixEntry = {
  startsAt: string;
  endsAt: string;
  byUserId: Map<string, AvailabilitySlot>;
};

const toSlotKey = (startsAt: string, endsAt: string): string => `${startsAt}|${endsAt}`;

const sortMemberIds = (memberIds: string[]): string[] => {
  return [...memberIds].sort((left, right) => left.localeCompare(right));
};

const normalizeCursor = (cursor: number, total: number): number => {
  if (total <= 0) {
    return 0;
  }
  const normalized = cursor % total;
  return normalized < 0 ? normalized + total : normalized;
};

const compareSlotKeys = (left: string, right: string): number => {
  return left.localeCompare(right);
};

export const computeTeamSlotMatrix = (input: {
  members: TeamMemberSchedule[];
  rangeStartIso: string;
  days: number;
  durationMinutes: number;
}): Map<string, TeamSlotMatrixEntry> => {
  const matrix = new Map<string, TeamSlotMatrixEntry>();

  for (const member of input.members) {
    const slots = computeAvailabilitySlots({
      organizerTimezone: member.timezone,
      rangeStartIso: input.rangeStartIso,
      days: input.days,
      durationMinutes: input.durationMinutes,
      rules: member.rules,
      overrides: member.overrides,
      bookings: member.bookings,
    });

    for (const slot of slots) {
      const key = toSlotKey(slot.startsAt, slot.endsAt);
      const existing = matrix.get(key);
      if (existing) {
        existing.byUserId.set(member.userId, slot);
        continue;
      }

      matrix.set(key, {
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        byUserId: new Map([[member.userId, slot]]),
      });
    }
  }

  return matrix;
};

export const chooseRoundRobinAssignee = (input: {
  orderedMemberIds: string[];
  availableMemberIds: string[];
  cursor: number;
}): { assigneeUserId: string; nextCursor: number } | null => {
  const totalMembers = input.orderedMemberIds.length;
  if (totalMembers === 0) {
    return null;
  }

  const available = new Set(input.availableMemberIds);
  const startIndex = normalizeCursor(input.cursor, totalMembers);

  for (let offset = 0; offset < totalMembers; offset += 1) {
    const index = (startIndex + offset) % totalMembers;
    const candidate = input.orderedMemberIds[index];
    if (!candidate || !available.has(candidate)) {
      continue;
    }

    return {
      assigneeUserId: candidate,
      nextCursor: (index + 1) % totalMembers,
    };
  }

  return null;
};

export const computeTeamAvailabilitySlots = (input: {
  mode: TeamSchedulingMode;
  members: TeamMemberSchedule[];
  rangeStartIso: string;
  days: number;
  durationMinutes: number;
  roundRobinCursor?: number;
}): { slots: TeamSlot[]; nextRoundRobinCursor: number } => {
  const orderedMemberIds = sortMemberIds(input.members.map((member) => member.userId));
  if (orderedMemberIds.length === 0) {
    return { slots: [], nextRoundRobinCursor: 0 };
  }

  const memberById = new Map(input.members.map((member) => [member.userId, member]));
  const orderedMembers = orderedMemberIds
    .map((memberId) => memberById.get(memberId))
    .filter((member): member is TeamMemberSchedule => Boolean(member));

  const matrix = computeTeamSlotMatrix({
    members: orderedMembers,
    rangeStartIso: input.rangeStartIso,
    days: input.days,
    durationMinutes: input.durationMinutes,
  });

  if (input.mode === 'collective') {
    const requiredMemberIds = orderedMembers.map((member) => member.userId);
    const slots = Array.from(matrix.entries())
      .filter(([, entry]) => requiredMemberIds.every((memberId) => entry.byUserId.has(memberId)))
      .sort(([leftKey], [rightKey]) => compareSlotKeys(leftKey, rightKey))
      .map(([, entry]) => {
        let bufferBeforeMinutes = 0;
        let bufferAfterMinutes = 0;

        for (const memberId of requiredMemberIds) {
          const memberSlot = entry.byUserId.get(memberId);
          if (!memberSlot) {
            continue;
          }
          if (memberSlot.bufferBeforeMinutes > bufferBeforeMinutes) {
            bufferBeforeMinutes = memberSlot.bufferBeforeMinutes;
          }
          if (memberSlot.bufferAfterMinutes > bufferAfterMinutes) {
            bufferAfterMinutes = memberSlot.bufferAfterMinutes;
          }
        }

        return {
          startsAt: entry.startsAt,
          endsAt: entry.endsAt,
          assignmentUserIds: requiredMemberIds,
          bufferBeforeMinutes,
          bufferAfterMinutes,
        };
      });

    return {
      slots,
      nextRoundRobinCursor: normalizeCursor(input.roundRobinCursor ?? 0, orderedMembers.length),
    };
  }

  let cursor = normalizeCursor(input.roundRobinCursor ?? 0, orderedMembers.length);
  const slots: TeamSlot[] = [];

  for (const [, entry] of Array.from(matrix.entries()).sort(([leftKey], [rightKey]) =>
    compareSlotKeys(leftKey, rightKey),
  )) {
    const availableMemberIds = orderedMembers
      .map((member) => member.userId)
      .filter((memberId) => entry.byUserId.has(memberId));
    const selection = chooseRoundRobinAssignee({
      orderedMemberIds: orderedMembers.map((member) => member.userId),
      availableMemberIds,
      cursor,
    });

    if (!selection) {
      continue;
    }

    const selectedSlot = entry.byUserId.get(selection.assigneeUserId);
    if (!selectedSlot) {
      continue;
    }

    slots.push({
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      assignmentUserIds: [selection.assigneeUserId],
      bufferBeforeMinutes: selectedSlot.bufferBeforeMinutes,
      bufferAfterMinutes: selectedSlot.bufferAfterMinutes,
    });
    cursor = selection.nextCursor;
  }

  return {
    slots,
    nextRoundRobinCursor: cursor,
  };
};
