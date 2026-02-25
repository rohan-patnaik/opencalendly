import 'dotenv/config';

import { eq } from 'drizzle-orm';

import { createDb } from './client';
import { availabilityRules, eventTypes, users } from './schema';

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

    const existingRules = await db
      .select({ id: availabilityRules.id })
      .from(availabilityRules)
      .where(eq(availabilityRules.userId, userId))
      .limit(1);

    if (existingRules.length === 0) {
      await db.insert(availabilityRules).values([
        {
          userId,
          dayOfWeek: 1,
          startMinute: 540,
          endMinute: 1020,
          bufferBeforeMinutes: 10,
          bufferAfterMinutes: 10,
        },
        {
          userId,
          dayOfWeek: 2,
          startMinute: 540,
          endMinute: 1020,
          bufferBeforeMinutes: 10,
          bufferAfterMinutes: 10,
        },
        {
          userId,
          dayOfWeek: 3,
          startMinute: 540,
          endMinute: 1020,
          bufferBeforeMinutes: 10,
          bufferAfterMinutes: 10,
        },
        {
          userId,
          dayOfWeek: 4,
          startMinute: 540,
          endMinute: 1020,
          bufferBeforeMinutes: 10,
          bufferAfterMinutes: 10,
        },
        {
          userId,
          dayOfWeek: 5,
          startMinute: 540,
          endMinute: 1020,
          bufferBeforeMinutes: 10,
          bufferAfterMinutes: 10,
        },
      ]);
    }

    console.log('Seed complete: demo user, event type, and baseline availability are ready.');
  } finally {
    await client.end();
  }
};

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
