import 'dotenv/config';

import { and, eq } from 'drizzle-orm';

import { createDb } from './client';
import {
  availabilityRules,
  eventTypes,
  teamEventTypeMembers,
  teamEventTypes,
  teamMembers,
  teams,
  users,
} from './schema';

const seed = async (): Promise<void> => {
  const { client, db } = createDb();

  try {
    await client.connect();

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, 'demo@opencalendly.dev'))
      .limit(1);

    let userId = existingUser?.id;

    if (!userId) {
      const inserted = await db
        .insert(users)
        .values({
          email: 'demo@opencalendly.dev',
          username: 'demo',
          displayName: 'Demo Organizer',
          timezone: 'UTC',
        })
        .returning({ id: users.id });

      userId = inserted[0]?.id;
    }

    if (!userId) {
      throw new Error('Unable to resolve demo user id during seed.');
    }

    const [existingTeammate] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, 'demo-teammate@opencalendly.dev'))
      .limit(1);

    let teammateUserId = existingTeammate?.id;
    if (!teammateUserId) {
      const insertedTeammate = await db
        .insert(users)
        .values({
          email: 'demo-teammate@opencalendly.dev',
          username: 'demo-teammate',
          displayName: 'Demo Teammate',
          timezone: 'UTC',
        })
        .returning({ id: users.id });
      teammateUserId = insertedTeammate[0]?.id;
    }

    if (!teammateUserId) {
      throw new Error('Unable to resolve demo teammate user id during seed.');
    }

    await db
      .insert(eventTypes)
      .values({
        userId,
        slug: 'intro-call',
        name: 'Intro Call',
        description: 'Default seeded event type',
        durationMinutes: 30,
        locationType: 'video',
        locationValue: 'https://meet.example.com/demo',
      })
      .onConflictDoNothing({ target: [eventTypes.userId, eventTypes.slug] });

    await db
      .insert(eventTypes)
      .values({
        userId,
        slug: 'team-intro-call',
        name: 'Team Intro Call',
        description: 'Default seeded team event type',
        durationMinutes: 30,
        locationType: 'video',
        locationValue: 'https://meet.example.com/team-demo',
      })
      .onConflictDoNothing({ target: [eventTypes.userId, eventTypes.slug] });

    const [teamEventTypeBase] = await db
      .select({ id: eventTypes.id })
      .from(eventTypes)
      .where(and(eq(eventTypes.userId, userId), eq(eventTypes.slug, 'team-intro-call')))
      .limit(1);

    if (!teamEventTypeBase) {
      throw new Error('Unable to resolve seeded team event type.');
    }

    await db
      .insert(teams)
      .values({
        ownerUserId: userId,
        slug: 'demo-team',
        name: 'Demo Team',
      })
      .onConflictDoNothing({ target: [teams.ownerUserId, teams.slug] });

    const [demoTeam] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.ownerUserId, userId), eq(teams.slug, 'demo-team')))
      .limit(1);

    if (!demoTeam) {
      throw new Error('Unable to resolve seeded demo team.');
    }

    await db
      .insert(teamMembers)
      .values([
        {
          teamId: demoTeam.id,
          userId,
          role: 'owner',
        },
        {
          teamId: demoTeam.id,
          userId: teammateUserId,
          role: 'member',
        },
      ])
      .onConflictDoNothing({ target: [teamMembers.teamId, teamMembers.userId] });

    await db
      .insert(teamEventTypes)
      .values({
        teamId: demoTeam.id,
        eventTypeId: teamEventTypeBase.id,
        mode: 'round_robin',
      })
      .onConflictDoNothing({ target: [teamEventTypes.eventTypeId] });

    const [teamEventType] = await db
      .select({ id: teamEventTypes.id })
      .from(teamEventTypes)
      .where(eq(teamEventTypes.eventTypeId, teamEventTypeBase.id))
      .limit(1);

    if (!teamEventType) {
      throw new Error('Unable to resolve seeded team event type mapping.');
    }

    await db
      .insert(teamEventTypeMembers)
      .values([
        {
          teamEventTypeId: teamEventType.id,
          userId,
          isRequired: true,
        },
        {
          teamEventTypeId: teamEventType.id,
          userId: teammateUserId,
          isRequired: true,
        },
      ])
      .onConflictDoNothing({ target: [teamEventTypeMembers.teamEventTypeId, teamEventTypeMembers.userId] });

    const ensureBaselineAvailabilityRules = async (targetUserId: string): Promise<void> => {
      const existingRules = await db
        .select({ id: availabilityRules.id })
        .from(availabilityRules)
        .where(eq(availabilityRules.userId, targetUserId))
        .limit(1);

      if (existingRules.length > 0) {
        return;
      }

      await db.insert(availabilityRules).values([
        {
          userId: targetUserId,
          dayOfWeek: 1,
          startMinute: 540,
          endMinute: 1020,
          bufferBeforeMinutes: 10,
          bufferAfterMinutes: 10,
        },
        {
          userId: targetUserId,
          dayOfWeek: 2,
          startMinute: 540,
          endMinute: 1020,
          bufferBeforeMinutes: 10,
          bufferAfterMinutes: 10,
        },
        {
          userId: targetUserId,
          dayOfWeek: 3,
          startMinute: 540,
          endMinute: 1020,
          bufferBeforeMinutes: 10,
          bufferAfterMinutes: 10,
        },
        {
          userId: targetUserId,
          dayOfWeek: 4,
          startMinute: 540,
          endMinute: 1020,
          bufferBeforeMinutes: 10,
          bufferAfterMinutes: 10,
        },
        {
          userId: targetUserId,
          dayOfWeek: 5,
          startMinute: 540,
          endMinute: 1020,
          bufferBeforeMinutes: 10,
          bufferAfterMinutes: 10,
        },
      ]);
    };

    await ensureBaselineAvailabilityRules(userId);
    await ensureBaselineAvailabilityRules(teammateUserId);

    console.log(
      'Seed complete: demo user(s), one-on-one event type, team event type, and baseline availability are ready.',
    );
  } finally {
    await client.end();
  }
};

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
