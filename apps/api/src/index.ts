import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { Hono } from 'hono';

import {
  availabilityOverrides,
  availabilityRules,
  bookingActionTokens,
  bookings,
  createDb,
  eventTypes,
  sessions,
  users,
} from '@opencalendly/db';
import {
  availabilityQuerySchema,
  bookingActionTokenSchema,
  bookingCancelSchema,
  bookingCreateSchema,
  bookingRescheduleSchema,
  eventQuestionsSchema,
  eventTypeCreateSchema,
  eventTypeUpdateSchema,
  healthCheckSchema,
  magicLinkRequestSchema,
  setAvailabilityOverridesSchema,
  setAvailabilityRulesSchema,
  verifyMagicLinkRequestSchema,
  type EventQuestion,
} from '@opencalendly/shared';

import {
  MAGIC_LINK_TTL_MINUTES,
  SESSION_TTL_DAYS,
  createRawToken,
  getBearerToken,
  hashToken,
} from './lib/auth';
import { computeAvailabilitySlots } from './lib/availability';
import {
  evaluateBookingActionToken,
  parseBookingMetadata,
  resolveRequestedRescheduleSlot,
} from './lib/booking-actions';
import {
  BookingConflictError,
  BookingNotFoundError,
  BookingUniqueConstraintError,
  BookingValidationError,
  commitBooking,
  createBookingActionTokenSet,
  type PublicEventType,
} from './lib/booking';
import {
  sendBookingCancellationEmail,
  sendBookingConfirmationEmail,
  sendBookingRescheduledEmail,
} from './lib/email';

type HyperdriveBinding = {
  connectionString: string;
};

type Bindings = {
  HYPERDRIVE?: HyperdriveBinding;
  DATABASE_URL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
};

type ContextLike = {
  env: Bindings;
  json: (body: unknown, status?: number) => Response;
};

type Database = ReturnType<typeof createDb>['db'];

type AuthenticatedUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  timezone: string;
};

type BookingActionType = 'cancel' | 'reschedule';

type LockedActionToken = {
  id: string;
  bookingId: string;
  actionType: BookingActionType;
  expiresAt: Date;
  consumedAt: Date | null;
  consumedBookingId: string | null;
};

type LockedBooking = {
  id: string;
  eventTypeId: string;
  organizerId: string;
  inviteeName: string;
  inviteeEmail: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  metadata: string | null;
};

type OrganizerProfile = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  timezone: string;
};

type EventTypeProfile = {
  id: string;
  userId: string;
  slug: string;
  name: string;
  durationMinutes: number;
  locationType: string;
  locationValue: string | null;
  isActive: boolean;
};

type PublicEventView = {
  eventType: {
    id: string;
    slug: string;
    name: string;
    durationMinutes: number;
    locationType: string;
    locationValue: string | null;
    questions: EventQuestion[];
  };
  organizer: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    timezone: string;
  };
};

const app = new Hono<{ Bindings: Bindings }>();

class BookingActionNotFoundError extends Error {}
class BookingActionGoneError extends Error {}

type ConnectionConfig =
  | {
      source: 'hyperdrive' | 'database_url';
      connectionString: string;
    }
  | null;

const NEON_HOST_PATTERN = /\.neon\.tech(?::\d+)?(?:\/|$)/i;

const isNeonDatabaseUrl = (connectionString: string): boolean => {
  return NEON_HOST_PATTERN.test(connectionString);
};

const resolveConnectionString = (env: Bindings): ConnectionConfig => {
  if (env.HYPERDRIVE?.connectionString) {
    return {
      source: 'hyperdrive',
      connectionString: env.HYPERDRIVE.connectionString,
    };
  }

  const databaseUrl = env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return {
      source: 'database_url',
      connectionString: databaseUrl,
    };
  }

  return null;
};

const jsonError = (context: ContextLike, status: number, error: string): Response => {
  return context.json({ ok: false, error }, status);
};

const normalizeTimezone = (timezone: string | undefined): string => {
  if (!timezone) {
    return 'UTC';
  }
  const parsed = DateTime.now().setZone(timezone);
  return parsed.isValid ? timezone : 'UTC';
};

const toEventQuestions = (value: unknown): EventQuestion[] => {
  const parsed = eventQuestionsSchema.safeParse(value ?? []);
  return parsed.success ? parsed.data : [];
};

const isUniqueViolation = (error: unknown, constraint?: string): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { code?: string; constraint?: string };
  if (maybeError.code !== '23505') {
    return false;
  }
  if (!constraint) {
    return true;
  }
  return maybeError.constraint === constraint;
};

const withDatabase = async (
  context: ContextLike,
  handler: (db: Database) => Promise<Response>,
): Promise<Response> => {
  const connection = resolveConnectionString(context.env);
  if (!connection) {
    return jsonError(
      context,
      500,
      'Missing database connection string. Configure Hyperdrive or a Neon DATABASE_URL.',
    );
  }

  if (connection.source === 'database_url' && !isNeonDatabaseUrl(connection.connectionString)) {
    return jsonError(context, 500, 'DATABASE_URL must point to Neon Postgres (*.neon.tech).');
  }

  const { client, db } = createDb(connection.connectionString, {
    enforceNeon: connection.source === 'database_url',
  });
  try {
    await client.connect();
    return await handler(db);
  } finally {
    await client.end();
  }
};

const findPublicEventType = async (
  db: Database,
  username: string,
  slug: string,
): Promise<PublicEventType | null> => {
  const [row] = await db
    .select({
      eventTypeId: eventTypes.id,
      eventTypeUserId: eventTypes.userId,
      eventTypeSlug: eventTypes.slug,
      eventTypeName: eventTypes.name,
      durationMinutes: eventTypes.durationMinutes,
      locationType: eventTypes.locationType,
      locationValue: eventTypes.locationValue,
      questions: eventTypes.questions,
      isActive: eventTypes.isActive,
      organizerId: users.id,
      organizerEmail: users.email,
      organizerUsername: users.username,
      organizerDisplayName: users.displayName,
      organizerTimezone: users.timezone,
    })
    .from(eventTypes)
    .innerJoin(users, eq(users.id, eventTypes.userId))
    .where(and(eq(users.username, username), eq(eventTypes.slug, slug)))
    .limit(1);

  if (!row || !row.isActive) {
    return null;
  }

  return {
    id: row.eventTypeId,
    userId: row.eventTypeUserId,
    slug: row.eventTypeSlug,
    name: row.eventTypeName,
    durationMinutes: row.durationMinutes,
    locationType: row.locationType,
    locationValue: row.locationValue,
    questions: toEventQuestions(row.questions),
    isActive: row.isActive,
    organizerDisplayName: row.organizerDisplayName,
    organizerEmail: row.organizerEmail,
    organizerTimezone: normalizeTimezone(row.organizerTimezone),
  };
};

const findPublicEventView = async (
  db: Database,
  username: string,
  slug: string,
): Promise<PublicEventView | null> => {
  const eventType = await findPublicEventType(db, username, slug);

  if (!eventType) {
    return null;
  }

  const [organizer] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      timezone: users.timezone,
    })
    .from(users)
    .where(eq(users.id, eventType.userId))
    .limit(1);

  if (!organizer) {
    return null;
  }

  return {
    eventType: {
      id: eventType.id,
      slug: eventType.slug,
      name: eventType.name,
      durationMinutes: eventType.durationMinutes,
      locationType: eventType.locationType,
      locationValue: eventType.locationValue,
      questions: eventType.questions,
    },
    organizer: {
      id: organizer.id,
      email: organizer.email,
      username: organizer.username,
      displayName: organizer.displayName,
      timezone: normalizeTimezone(organizer.timezone),
    },
  };
};

const resolveAuthenticatedUser = async (
  db: Database,
  request: Request,
): Promise<AuthenticatedUser | null> => {
  const token = getBearerToken(request);
  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      timezone: users.timezone,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.displayName,
    timezone: normalizeTimezone(row.timezone),
  };
};

const actionTokenMap = (
  tokens: Array<{
    actionType: BookingActionType;
    token: string;
    expiresAt: string;
  }>,
): {
  cancelToken: string;
  cancelExpiresAt: string;
  rescheduleToken: string;
  rescheduleExpiresAt: string;
} => {
  const cancel = tokens.find((token) => token.actionType === 'cancel');
  const reschedule = tokens.find((token) => token.actionType === 'reschedule');

  if (!cancel || !reschedule) {
    throw new Error('Missing booking action token(s).');
  }

  return {
    cancelToken: cancel.token,
    cancelExpiresAt: cancel.expiresAt,
    rescheduleToken: reschedule.token,
    rescheduleExpiresAt: reschedule.expiresAt,
  };
};

const buildActionUrls = (
  request: Request,
  tokenMap: {
    cancelToken: string;
    rescheduleToken: string;
  },
): {
  lookupCancelUrl: string;
  lookupRescheduleUrl: string;
  cancelUrl: string;
  rescheduleUrl: string;
} => {
  const origin = new URL(request.url).origin;

  return {
    lookupCancelUrl: `${origin}/v0/bookings/actions/${tokenMap.cancelToken}`,
    lookupRescheduleUrl: `${origin}/v0/bookings/actions/${tokenMap.rescheduleToken}`,
    cancelUrl: `${origin}/v0/bookings/actions/${tokenMap.cancelToken}/cancel`,
    rescheduleUrl: `${origin}/v0/bookings/actions/${tokenMap.rescheduleToken}/reschedule`,
  };
};

const lockActionToken = async (
  db: Database | Parameters<Parameters<Database['transaction']>[0]>[0],
  tokenHash: string,
): Promise<LockedActionToken | null> => {
  const locked = await db.execute<LockedActionToken>(sql`
    select
      id,
      booking_id as "bookingId",
      action_type as "actionType",
      expires_at as "expiresAt",
      consumed_at as "consumedAt",
      consumed_booking_id as "consumedBookingId"
    from booking_action_tokens
    where token_hash = ${tokenHash}
    for update
  `);

  return locked.rows[0] ?? null;
};

const lockBooking = async (
  db: Database | Parameters<Parameters<Database['transaction']>[0]>[0],
  bookingId: string,
): Promise<LockedBooking | null> => {
  const locked = await db.execute<LockedBooking>(sql`
    select
      id,
      event_type_id as "eventTypeId",
      organizer_id as "organizerId",
      invitee_name as "inviteeName",
      invitee_email as "inviteeEmail",
      starts_at as "startsAt",
      ends_at as "endsAt",
      status,
      metadata
    from bookings
    where id = ${bookingId}
    for update
  `);

  return locked.rows[0] ?? null;
};

app.get('/health', (context) => {
  return context.json(healthCheckSchema.parse({ status: 'ok' }));
});

app.get('/v0/db/ping', async (context) => {
  return withDatabase(context, async (db) => {
    const result = await db.execute<{ now: string }>(sql`select now()::text as now`);
    const now = result.rows[0]?.now ?? null;
    return context.json({ ok: true, now });
  });
});

app.post('/v0/auth/magic-link', async (context) => {
  return withDatabase(context, async (db) => {
    const body = await context.req.json().catch(() => null);
    const parsed = magicLinkRequestSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const payload = parsed.data;
    const email = payload.email.trim().toLowerCase();
    const username = payload.username?.trim().toLowerCase();
    const displayName = payload.displayName?.trim();
    const timezone = normalizeTimezone(payload.timezone);

    const [existing] = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        timezone: users.timezone,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let userId = existing?.id ?? '';

    if (!existing) {
      if (!username || !displayName) {
        return jsonError(
          context,
          400,
          'username and displayName are required when creating a new account.',
        );
      }

      try {
        const [inserted] = await db
          .insert(users)
          .values({
            email,
            username,
            displayName,
            timezone,
          })
          .returning({ id: users.id });

        userId = inserted?.id ?? '';
      } catch (error) {
        if (isUniqueViolation(error)) {
          return jsonError(context, 409, 'A user with that username or email already exists.');
        }
        throw error;
      }
    } else if (payload.timezone || payload.displayName) {
      await db
        .update(users)
        .set({
          timezone,
          displayName: displayName || existing.displayName,
        })
        .where(eq(users.id, existing.id));
      userId = existing.id;
    }

    if (!userId) {
      return jsonError(context, 500, 'Unable to create or resolve user account.');
    }

    const magicLinkToken = createRawToken();
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60_000);

    await db.insert(sessions).values({
      userId,
      tokenHash: hashToken(magicLinkToken),
      expiresAt,
    });

    return context.json({
      ok: true,
      magicLinkToken,
      expiresAt: expiresAt.toISOString(),
    });
  });
});

app.post('/v0/auth/verify', async (context) => {
  return withDatabase(context, async (db) => {
    const body = await context.req.json().catch(() => null);
    const parsed = verifyMagicLinkRequestSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const tokenHash = hashToken(parsed.data.token);
    const [row] = await db
      .select({
        sessionId: sessions.id,
        userId: users.id,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
        timezone: users.timezone,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
      .limit(1);

    if (!row) {
      return jsonError(context, 401, 'Magic link token is invalid or expired.');
    }

    const sessionToken = createRawToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

    await db
      .update(sessions)
      .set({
        tokenHash: hashToken(sessionToken),
        expiresAt,
      })
      .where(eq(sessions.id, row.sessionId));

    return context.json({
      ok: true,
      sessionToken,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: row.userId,
        email: row.email,
        username: row.username,
        displayName: row.displayName,
        timezone: normalizeTimezone(row.timezone),
      },
    });
  });
});

app.get('/v0/auth/me', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    return context.json({ ok: true, user: authedUser });
  });
});

app.post('/v0/event-types', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const body = await context.req.json().catch(() => null);
    const sanitizedBody =
      body && typeof body === 'object'
        ? {
            ...body,
            slug: typeof body.slug === 'string' ? body.slug.toLowerCase().trim() : body.slug,
          }
        : body;
    const parsed = eventTypeCreateSchema.safeParse(sanitizedBody);

    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const payload = parsed.data;

    try {
      const [inserted] = await db
        .insert(eventTypes)
        .values({
          userId: authedUser.id,
          name: payload.name,
          slug: payload.slug,
          durationMinutes: payload.durationMinutes,
          locationType: payload.locationType,
          locationValue: payload.locationValue ?? null,
          questions: payload.questions,
        })
        .returning({
          id: eventTypes.id,
          slug: eventTypes.slug,
          name: eventTypes.name,
          durationMinutes: eventTypes.durationMinutes,
          locationType: eventTypes.locationType,
          locationValue: eventTypes.locationValue,
          questions: eventTypes.questions,
          isActive: eventTypes.isActive,
        });

      if (!inserted) {
        return jsonError(context, 500, 'Failed to create event type.');
      }

      return context.json({
        ok: true,
        eventType: {
          ...inserted,
          questions: toEventQuestions(inserted.questions),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error, 'event_types_user_slug_unique')) {
        return jsonError(context, 409, 'An event type with that slug already exists.');
      }
      throw error;
    }
  });
});

app.patch('/v0/event-types/:id', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const body = await context.req.json().catch(() => null);
    const sanitizedBody =
      body && typeof body === 'object'
        ? {
            ...body,
            slug: typeof body.slug === 'string' ? body.slug.toLowerCase().trim() : body.slug,
          }
        : body;
    const parsed = eventTypeUpdateSchema.safeParse(sanitizedBody);

    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const payload = parsed.data;
    const updateValues: Partial<typeof eventTypes.$inferInsert> = {};

    if (payload.name !== undefined) {
      updateValues.name = payload.name;
    }
    if (payload.slug !== undefined) {
      updateValues.slug = payload.slug;
    }
    if (payload.durationMinutes !== undefined) {
      updateValues.durationMinutes = payload.durationMinutes;
    }
    if (payload.locationType !== undefined) {
      updateValues.locationType = payload.locationType;
    }
    if (payload.locationValue !== undefined) {
      updateValues.locationValue = payload.locationValue ?? null;
    }
    if (payload.questions !== undefined) {
      updateValues.questions = payload.questions;
    }
    if (payload.isActive !== undefined) {
      updateValues.isActive = payload.isActive;
    }

    try {
      const [updated] = await db
        .update(eventTypes)
        .set(updateValues)
        .where(and(eq(eventTypes.id, context.req.param('id')), eq(eventTypes.userId, authedUser.id)))
        .returning({
          id: eventTypes.id,
          slug: eventTypes.slug,
          name: eventTypes.name,
          durationMinutes: eventTypes.durationMinutes,
          locationType: eventTypes.locationType,
          locationValue: eventTypes.locationValue,
          questions: eventTypes.questions,
          isActive: eventTypes.isActive,
        });

      if (!updated) {
        return jsonError(context, 404, 'Event type not found.');
      }

      return context.json({
        ok: true,
        eventType: {
          ...updated,
          questions: toEventQuestions(updated.questions),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error, 'event_types_user_slug_unique')) {
        return jsonError(context, 409, 'An event type with that slug already exists.');
      }
      throw error;
    }
  });
});

app.put('/v0/me/availability/rules', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const body = await context.req.json().catch(() => null);
    const parsed = setAvailabilityRulesSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    await db.transaction(async (transaction) => {
      await transaction.delete(availabilityRules).where(eq(availabilityRules.userId, authedUser.id));

      if (parsed.data.rules.length > 0) {
        await transaction.insert(availabilityRules).values(
          parsed.data.rules.map((rule) => ({
            userId: authedUser.id,
            dayOfWeek: rule.dayOfWeek,
            startMinute: rule.startMinute,
            endMinute: rule.endMinute,
            bufferBeforeMinutes: rule.bufferBeforeMinutes,
            bufferAfterMinutes: rule.bufferAfterMinutes,
          })),
        );
      }
    });

    return context.json({
      ok: true,
      count: parsed.data.rules.length,
    });
  });
});

app.put('/v0/me/availability/overrides', async (context) => {
  return withDatabase(context, async (db) => {
    const authedUser = await resolveAuthenticatedUser(db, context.req.raw);
    if (!authedUser) {
      return jsonError(context, 401, 'Unauthorized.');
    }

    const body = await context.req.json().catch(() => null);
    const parsed = setAvailabilityOverridesSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    await db.transaction(async (transaction) => {
      await transaction
        .delete(availabilityOverrides)
        .where(eq(availabilityOverrides.userId, authedUser.id));

      if (parsed.data.overrides.length > 0) {
        await transaction.insert(availabilityOverrides).values(
          parsed.data.overrides.map((override) => ({
            userId: authedUser.id,
            startAt: new Date(override.startAt),
            endAt: new Date(override.endAt),
            isAvailable: override.isAvailable,
            reason: override.reason ?? null,
          })),
        );
      }
    });

    return context.json({
      ok: true,
      count: parsed.data.overrides.length,
    });
  });
});

app.get('/v0/users/:username/event-types/:slug', async (context) => {
  return withDatabase(context, async (db) => {
    const username = context.req.param('username');
    const slug = context.req.param('slug');
    const result = await findPublicEventView(db, username, slug);

    if (!result) {
      return jsonError(context, 404, 'Event type not found.');
    }

    return context.json({
      ok: true,
      eventType: {
        ...result.eventType,
      },
      organizer: {
        username: result.organizer.username,
        displayName: result.organizer.displayName,
        timezone: result.organizer.timezone,
      },
    });
  });
});

app.get('/v0/users/:username/event-types/:slug/availability', async (context) => {
  return withDatabase(context, async (db) => {
    const username = context.req.param('username');
    const slug = context.req.param('slug');
    const eventType = await findPublicEventType(db, username, slug);

    if (!eventType) {
      return jsonError(context, 404, 'Event type not found.');
    }

    const query = availabilityQuerySchema.safeParse({
      timezone: context.req.query('timezone') ?? undefined,
      start: context.req.query('start') ?? undefined,
      days: context.req.query('days') ?? undefined,
    });

    if (!query.success) {
      return jsonError(context, 400, query.error.issues[0]?.message ?? 'Invalid query params.');
    }

    const startIso = query.data.start ?? DateTime.utc().toISO();
    if (!startIso) {
      return jsonError(context, 400, 'Invalid range start.');
    }
    const rangeStart = DateTime.fromISO(startIso, { zone: 'utc' });
    if (!rangeStart.isValid) {
      return jsonError(context, 400, 'Invalid range start.');
    }

    const days = query.data.days ?? 7;
    const rangeEnd = rangeStart.plus({ days });

    const [rules, overrides, existingBookings] = await Promise.all([
      db
        .select({
          dayOfWeek: availabilityRules.dayOfWeek,
          startMinute: availabilityRules.startMinute,
          endMinute: availabilityRules.endMinute,
          bufferBeforeMinutes: availabilityRules.bufferBeforeMinutes,
          bufferAfterMinutes: availabilityRules.bufferAfterMinutes,
        })
        .from(availabilityRules)
        .where(eq(availabilityRules.userId, eventType.userId)),
      db
        .select({
          startAt: availabilityOverrides.startAt,
          endAt: availabilityOverrides.endAt,
          isAvailable: availabilityOverrides.isAvailable,
        })
        .from(availabilityOverrides)
        .where(
          and(
            eq(availabilityOverrides.userId, eventType.userId),
            lt(availabilityOverrides.startAt, rangeEnd.toJSDate()),
            gt(availabilityOverrides.endAt, rangeStart.toJSDate()),
          ),
        ),
      db
        .select({
          startsAt: bookings.startsAt,
          endsAt: bookings.endsAt,
          status: bookings.status,
          metadata: bookings.metadata,
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.organizerId, eventType.userId),
            eq(bookings.status, 'confirmed'),
            lt(bookings.startsAt, rangeEnd.toJSDate()),
            gt(bookings.endsAt, rangeStart.toJSDate()),
          ),
        ),
    ]);

    const slots = computeAvailabilitySlots({
      organizerTimezone: eventType.organizerTimezone,
      rangeStartIso: startIso,
      days,
      durationMinutes: eventType.durationMinutes,
      rules,
      overrides,
      bookings: existingBookings,
    });

    return context.json({
      ok: true,
      timezone: normalizeTimezone(query.data.timezone),
      slots: slots.map((slot) => ({
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      })),
    });
  });
});

app.post('/v0/bookings', async (context) => {
  return withDatabase(context, async (db) => {
    const body = await context.req.json().catch(() => null);
    const parsed = bookingCreateSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const payload = parsed.data;
    const timezone = normalizeTimezone(payload.timezone);

    try {
      const result = await commitBooking(
        {
          getPublicEventType: async (username, eventSlug) => {
            return findPublicEventType(db, username, eventSlug);
          },
          withEventTypeTransaction: async (eventTypeId, callback) => {
            return db.transaction(async (transaction) => {
              return callback({
                lockEventType: async (lockedEventTypeId) => {
                  const locked = await transaction.execute<{ id: string; userId: string }>(
                    sql`select id, user_id as "userId" from event_types where id = ${lockedEventTypeId} and is_active = true for update`,
                  );

                  if (!locked.rows[0] || locked.rows[0].id !== eventTypeId) {
                    throw new BookingNotFoundError('Event type not found.');
                  }

                  await transaction.execute(
                    sql`select id from users where id = ${locked.rows[0].userId} for update`,
                  );
                },
                listRules: async (userId) => {
                  return transaction
                    .select({
                      dayOfWeek: availabilityRules.dayOfWeek,
                      startMinute: availabilityRules.startMinute,
                      endMinute: availabilityRules.endMinute,
                      bufferBeforeMinutes: availabilityRules.bufferBeforeMinutes,
                      bufferAfterMinutes: availabilityRules.bufferAfterMinutes,
                    })
                    .from(availabilityRules)
                    .where(eq(availabilityRules.userId, userId));
                },
                listOverrides: async (userId, rangeStart, rangeEnd) => {
                  return transaction
                    .select({
                      startAt: availabilityOverrides.startAt,
                      endAt: availabilityOverrides.endAt,
                      isAvailable: availabilityOverrides.isAvailable,
                    })
                    .from(availabilityOverrides)
                    .where(
                      and(
                        eq(availabilityOverrides.userId, userId),
                        lt(availabilityOverrides.startAt, rangeEnd),
                        gt(availabilityOverrides.endAt, rangeStart),
                      ),
                    );
                },
                listConfirmedBookings: async (organizerId, rangeStart, rangeEnd) => {
                  return transaction
                    .select({
                      id: bookings.id,
                      startsAt: bookings.startsAt,
                      endsAt: bookings.endsAt,
                      status: bookings.status,
                      metadata: bookings.metadata,
                    })
                    .from(bookings)
                    .where(
                      and(
                        eq(bookings.organizerId, organizerId),
                        eq(bookings.status, 'confirmed'),
                        lt(bookings.startsAt, rangeEnd),
                        gt(bookings.endsAt, rangeStart),
                      ),
                    );
                },
                insertActionTokens: async (bookingId, tokens) => {
                  if (tokens.length === 0) {
                    return;
                  }

                  await transaction.insert(bookingActionTokens).values(
                    tokens.map((token) => ({
                      bookingId,
                      actionType: token.actionType,
                      tokenHash: token.tokenHash,
                      expiresAt: token.expiresAt,
                    })),
                  );
                },
                insertBooking: async (input) => {
                  try {
                    const [inserted] = await transaction
                      .insert(bookings)
                      .values({
                        eventTypeId: input.eventTypeId,
                        organizerId: input.organizerId,
                        inviteeName: input.inviteeName,
                        inviteeEmail: input.inviteeEmail,
                        startsAt: input.startsAt,
                        endsAt: input.endsAt,
                        metadata: input.metadata,
                      })
                      .returning({
                        id: bookings.id,
                        eventTypeId: bookings.eventTypeId,
                        organizerId: bookings.organizerId,
                        inviteeName: bookings.inviteeName,
                        inviteeEmail: bookings.inviteeEmail,
                        startsAt: bookings.startsAt,
                        endsAt: bookings.endsAt,
                      });

                    if (!inserted) {
                      throw new Error('Insert failed.');
                    }

                    return inserted;
                  } catch (error) {
                    if (isUniqueViolation(error, 'bookings_unique_slot')) {
                      throw new BookingUniqueConstraintError('Slot already booked.');
                    }
                    throw error;
                  }
                },
              });
            });
          },
        },
        {
          username: payload.username,
          eventSlug: payload.eventSlug,
          startsAt: payload.startsAt,
          timezone,
          inviteeName: payload.inviteeName,
          inviteeEmail: payload.inviteeEmail,
          ...(payload.answers ? { answers: payload.answers } : {}),
        },
      );

      const tokens = actionTokenMap(result.actionTokens);
      const actionUrls = buildActionUrls(context.req.raw, {
        cancelToken: tokens.cancelToken,
        rescheduleToken: tokens.rescheduleToken,
      });

      const email = await sendBookingConfirmationEmail(context.env, {
        inviteeEmail: payload.inviteeEmail,
        inviteeName: payload.inviteeName,
        organizerDisplayName: result.eventType.organizerDisplayName,
        eventName: result.eventType.name,
        startsAt: result.booking.startsAt.toISOString(),
        timezone,
        locationType: result.eventType.locationType,
        locationValue: result.eventType.locationValue,
        cancelLink: actionUrls.lookupCancelUrl,
        rescheduleLink: actionUrls.lookupRescheduleUrl,
        idempotencyKey: `booking-confirmation:${result.booking.id}`,
      });

      return context.json({
        ok: true,
        booking: {
          id: result.booking.id,
          eventTypeId: result.booking.eventTypeId,
          organizerId: result.booking.organizerId,
          inviteeName: result.booking.inviteeName,
          inviteeEmail: result.booking.inviteeEmail,
          startsAt: result.booking.startsAt.toISOString(),
          endsAt: result.booking.endsAt.toISOString(),
        },
        actions: {
          cancel: {
            token: tokens.cancelToken,
            expiresAt: tokens.cancelExpiresAt,
            lookupUrl: actionUrls.lookupCancelUrl,
            url: actionUrls.cancelUrl,
          },
          reschedule: {
            token: tokens.rescheduleToken,
            expiresAt: tokens.rescheduleExpiresAt,
            lookupUrl: actionUrls.lookupRescheduleUrl,
            url: actionUrls.rescheduleUrl,
          },
        },
        email,
      });
    } catch (error) {
      if (error instanceof BookingNotFoundError) {
        return jsonError(context, 404, 'Event type not found.');
      }
      if (error instanceof BookingValidationError) {
        return jsonError(context, 400, error.message);
      }
      if (error instanceof BookingConflictError) {
        return jsonError(context, 409, error.message);
      }
      throw error;
    }
  });
});

app.get('/v0/bookings/actions/:token', async (context) => {
  return withDatabase(context, async (db) => {
    const tokenParam = bookingActionTokenSchema.safeParse(context.req.param('token'));
    if (!tokenParam.success) {
      return jsonError(context, 404, 'Action link is invalid or expired.');
    }

    const [row] = await db
      .select({
        actionType: bookingActionTokens.actionType,
        expiresAt: bookingActionTokens.expiresAt,
        consumedAt: bookingActionTokens.consumedAt,
        consumedBookingId: bookingActionTokens.consumedBookingId,
        bookingId: bookings.id,
        bookingStatus: bookings.status,
        bookingStartsAt: bookings.startsAt,
        bookingEndsAt: bookings.endsAt,
        bookingMetadata: bookings.metadata,
        inviteeName: bookings.inviteeName,
        inviteeEmail: bookings.inviteeEmail,
        eventTypeSlug: eventTypes.slug,
        eventTypeName: eventTypes.name,
        eventTypeDurationMinutes: eventTypes.durationMinutes,
        organizerUsername: users.username,
        organizerDisplayName: users.displayName,
        organizerTimezone: users.timezone,
      })
      .from(bookingActionTokens)
      .innerJoin(bookings, eq(bookings.id, bookingActionTokens.bookingId))
      .innerJoin(eventTypes, eq(eventTypes.id, bookings.eventTypeId))
      .innerJoin(users, eq(users.id, bookings.organizerId))
      .where(eq(bookingActionTokens.tokenHash, hashToken(tokenParam.data)))
      .limit(1);

    if (!row) {
      return jsonError(context, 404, 'Action link is invalid or expired.');
    }

    const actionType = row.actionType as BookingActionType;
    const tokenState = evaluateBookingActionToken({
      actionType,
      bookingStatus: row.bookingStatus,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt,
      now: new Date(),
    });
    if (tokenState === 'gone') {
      return jsonError(context, 410, 'Action link is invalid or expired.');
    }

    const metadata = parseBookingMetadata(row.bookingMetadata, normalizeTimezone);
    const timezone = metadata.timezone ?? normalizeTimezone(row.organizerTimezone);

    let rescheduledTo: { id: string; startsAt: string; endsAt: string } | null = null;
    if (row.bookingStatus === 'rescheduled') {
      const [child] = row.consumedBookingId
        ? await db
            .select({
              id: bookings.id,
              startsAt: bookings.startsAt,
              endsAt: bookings.endsAt,
            })
            .from(bookings)
            .where(eq(bookings.id, row.consumedBookingId))
            .limit(1)
        : await db
            .select({
              id: bookings.id,
              startsAt: bookings.startsAt,
              endsAt: bookings.endsAt,
            })
            .from(bookings)
            .where(eq(bookings.rescheduledFromBookingId, row.bookingId))
            .orderBy(desc(bookings.createdAt))
            .limit(1);

      if (child) {
        rescheduledTo = {
          id: child.id,
          startsAt: child.startsAt.toISOString(),
          endsAt: child.endsAt.toISOString(),
        };
      }
    }

    return context.json({
      ok: true,
      actionType,
      booking: {
        id: row.bookingId,
        status: row.bookingStatus,
        startsAt: row.bookingStartsAt.toISOString(),
        endsAt: row.bookingEndsAt.toISOString(),
        timezone,
        inviteeName: row.inviteeName,
        inviteeEmail: row.inviteeEmail,
        rescheduledTo,
      },
      eventType: {
        slug: row.eventTypeSlug,
        name: row.eventTypeName,
        durationMinutes: row.eventTypeDurationMinutes,
      },
      organizer: {
        username: row.organizerUsername,
        displayName: row.organizerDisplayName,
        timezone: normalizeTimezone(row.organizerTimezone),
      },
      actions: {
        canCancel: actionType === 'cancel' && tokenState === 'usable',
        canReschedule:
          actionType === 'reschedule' && tokenState === 'usable',
      },
    });
  });
});

app.post('/v0/bookings/actions/:token/cancel', async (context) => {
  return withDatabase(context, async (db) => {
    const tokenParam = bookingActionTokenSchema.safeParse(context.req.param('token'));
    if (!tokenParam.success) {
      return jsonError(context, 404, 'Action link is invalid or expired.');
    }

    const body = await context.req.json().catch(() => ({}));
    const parsed = bookingCancelSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const now = new Date();

    try {
      const result = await db.transaction(async (transaction) => {
        const token = await lockActionToken(transaction, hashToken(tokenParam.data));
        if (!token || token.actionType !== 'cancel') {
          throw new BookingActionNotFoundError('Action link is invalid or expired.');
        }

        const booking = await lockBooking(transaction, token.bookingId);
        if (!booking) {
          throw new BookingActionNotFoundError('Booking not found.');
        }

        const [eventType] = await transaction
          .select({
            id: eventTypes.id,
            userId: eventTypes.userId,
            slug: eventTypes.slug,
            name: eventTypes.name,
            durationMinutes: eventTypes.durationMinutes,
            locationType: eventTypes.locationType,
            locationValue: eventTypes.locationValue,
            isActive: eventTypes.isActive,
          })
          .from(eventTypes)
          .where(eq(eventTypes.id, booking.eventTypeId))
          .limit(1);

        const [organizer] = await transaction
          .select({
            id: users.id,
            email: users.email,
            username: users.username,
            displayName: users.displayName,
            timezone: users.timezone,
          })
          .from(users)
          .where(eq(users.id, booking.organizerId))
          .limit(1);

        if (!eventType || !organizer) {
          throw new BookingActionNotFoundError('Booking context not found.');
        }

        const tokenState = evaluateBookingActionToken({
          actionType: token.actionType,
          bookingStatus: booking.status,
          expiresAt: token.expiresAt,
          consumedAt: token.consumedAt,
          now,
        });

        if (tokenState === 'gone') {
          throw new BookingActionGoneError('Action link is invalid or expired.');
        }

        if (tokenState === 'idempotent-replay') {
          await transaction
            .update(bookingActionTokens)
            .set({
              consumedAt: now,
            })
            .where(
              and(
                eq(bookingActionTokens.bookingId, booking.id),
                isNull(bookingActionTokens.consumedAt),
              ),
            );

          return {
            booking,
            eventType,
            organizer,
            alreadyProcessed: true,
          };
        }

        if (tokenState !== 'usable' || booking.status !== 'confirmed') {
          throw new BookingActionGoneError('Booking is not cancelable.');
        }

        const [canceledBooking] = await transaction
          .update(bookings)
          .set({
            status: 'canceled',
            canceledAt: now,
            canceledBy: 'invitee',
            cancellationReason: parsed.data.reason ?? null,
          })
          .where(eq(bookings.id, booking.id))
          .returning({
            id: bookings.id,
            eventTypeId: bookings.eventTypeId,
            organizerId: bookings.organizerId,
            inviteeName: bookings.inviteeName,
            inviteeEmail: bookings.inviteeEmail,
            startsAt: bookings.startsAt,
            endsAt: bookings.endsAt,
            status: bookings.status,
            metadata: bookings.metadata,
          });

        if (!canceledBooking) {
          throw new Error('Failed to cancel booking.');
        }

        await transaction
          .update(bookingActionTokens)
          .set({
            consumedAt: now,
          })
          .where(
            and(eq(bookingActionTokens.bookingId, booking.id), isNull(bookingActionTokens.consumedAt)),
          );

        return {
          booking: canceledBooking,
          eventType,
          organizer,
          alreadyProcessed: false,
        };
      });

      const timezone =
        parseBookingMetadata(result.booking.metadata, normalizeTimezone).timezone ??
        normalizeTimezone(result.organizer.timezone);

      const email = result.alreadyProcessed
        ? {
            sent: false,
            provider: 'none' as const,
            error: 'Idempotent replay: cancellation already processed.',
          }
        : await Promise.all([
            sendBookingCancellationEmail(context.env, {
              recipientEmail: result.booking.inviteeEmail,
              recipientName: result.booking.inviteeName,
              recipientRole: 'invitee',
              organizerDisplayName: result.organizer.displayName,
              eventName: result.eventType.name,
              startsAt: result.booking.startsAt.toISOString(),
              timezone,
              cancellationReason: parsed.data.reason ?? null,
              idempotencyKey: `booking-cancel:${result.booking.id}:invitee`,
            }),
            sendBookingCancellationEmail(context.env, {
              recipientEmail: result.organizer.email,
              recipientName: result.organizer.displayName,
              recipientRole: 'organizer',
              organizerDisplayName: result.organizer.displayName,
              eventName: result.eventType.name,
              startsAt: result.booking.startsAt.toISOString(),
              timezone,
              cancellationReason: parsed.data.reason ?? null,
              idempotencyKey: `booking-cancel:${result.booking.id}:organizer`,
            }),
          ]);

      return context.json({
        ok: true,
        booking: {
          id: result.booking.id,
          status: result.booking.status,
        },
        email,
      });
    } catch (error) {
      if (error instanceof BookingActionNotFoundError) {
        return jsonError(context, 404, 'Action link is invalid or expired.');
      }
      if (error instanceof BookingActionGoneError) {
        return jsonError(context, 410, 'Action link is invalid or expired.');
      }
      throw error;
    }
  });
});

app.post('/v0/bookings/actions/:token/reschedule', async (context) => {
  return withDatabase(context, async (db) => {
    const tokenParam = bookingActionTokenSchema.safeParse(context.req.param('token'));
    if (!tokenParam.success) {
      return jsonError(context, 404, 'Action link is invalid or expired.');
    }

    const body = await context.req.json().catch(() => null);
    const parsed = bookingRescheduleSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(context, 400, parsed.error.issues[0]?.message ?? 'Invalid request body.');
    }

    const timezone = normalizeTimezone(parsed.data.timezone);
    const startsAt = DateTime.fromISO(parsed.data.startsAt, { zone: 'utc' });
    if (!startsAt.isValid) {
      return jsonError(context, 400, 'Invalid startsAt value.');
    }

    const now = new Date();
    const requestedStartsAtIso = startsAt.toUTC().toISO();
    if (!requestedStartsAtIso) {
      return jsonError(context, 400, 'Unable to normalize startsAt.');
    }

    try {
      const result = await db.transaction(async (transaction) => {
        const token = await lockActionToken(transaction, hashToken(tokenParam.data));
        if (!token || token.actionType !== 'reschedule') {
          throw new BookingActionNotFoundError('Action link is invalid or expired.');
        }

        const booking = await lockBooking(transaction, token.bookingId);
        if (!booking) {
          throw new BookingActionNotFoundError('Booking not found.');
        }

        const eventTypeResult = await transaction.execute<EventTypeProfile>(sql`
          select
            id,
            user_id as "userId",
            slug,
            name,
            duration_minutes as "durationMinutes",
            location_type as "locationType",
            location_value as "locationValue",
            is_active as "isActive"
          from event_types
          where id = ${booking.eventTypeId}
          for update
        `);

        const organizerResult = await transaction.execute<OrganizerProfile>(sql`
          select
            id,
            email,
            username,
            display_name as "displayName",
            timezone
          from users
          where id = ${booking.organizerId}
          for update
        `);

        const eventTypeRow = eventTypeResult.rows[0];
        const organizerRow = organizerResult.rows[0];

        if (!eventTypeRow || !organizerRow || !eventTypeRow.isActive) {
          throw new BookingActionNotFoundError('Booking context not found.');
        }

        const findReplayBooking = async (): Promise<LockedBooking | null> => {
          const [rescheduledBooking] = token.consumedBookingId
            ? await transaction
                .select({
                  id: bookings.id,
                  eventTypeId: bookings.eventTypeId,
                  organizerId: bookings.organizerId,
                  inviteeName: bookings.inviteeName,
                  inviteeEmail: bookings.inviteeEmail,
                  startsAt: bookings.startsAt,
                  endsAt: bookings.endsAt,
                  status: bookings.status,
                  metadata: bookings.metadata,
                })
                .from(bookings)
                .where(eq(bookings.id, token.consumedBookingId))
                .limit(1)
            : await transaction
                .select({
                  id: bookings.id,
                  eventTypeId: bookings.eventTypeId,
                  organizerId: bookings.organizerId,
                  inviteeName: bookings.inviteeName,
                  inviteeEmail: bookings.inviteeEmail,
                  startsAt: bookings.startsAt,
                  endsAt: bookings.endsAt,
                  status: bookings.status,
                  metadata: bookings.metadata,
                })
                .from(bookings)
                .where(eq(bookings.rescheduledFromBookingId, booking.id))
                .orderBy(desc(bookings.createdAt))
                .limit(1);

          return rescheduledBooking ?? null;
        };

        const tokenState = evaluateBookingActionToken({
          actionType: token.actionType,
          bookingStatus: booking.status,
          expiresAt: token.expiresAt,
          consumedAt: token.consumedAt,
          now,
        });

        if (tokenState === 'idempotent-replay') {
          const replayBooking = await findReplayBooking();
          if (!replayBooking) {
            throw new BookingActionGoneError('Action link is invalid or expired.');
          }

          return {
            oldBooking: booking,
            newBooking: replayBooking,
            eventType: eventTypeRow,
            organizer: organizerRow,
            actionTokens: null,
            alreadyProcessed: true,
          };
        }

        if (tokenState === 'gone' || booking.status !== 'confirmed') {
          throw new BookingActionGoneError('Booking is not reschedulable.');
        }

        const requestedEndsAt = startsAt.plus({ minutes: eventTypeRow.durationMinutes });
        const requestedEndsAtIso = requestedEndsAt.toUTC().toISO();
        if (!requestedEndsAtIso) {
          throw new BookingValidationError('Unable to normalize end time.');
        }

        const rangeStart = startsAt.minus({ days: 1 });
        const rangeEnd = requestedEndsAt.plus({ days: 1 });
        const rangeStartIso = rangeStart.toUTC().toISO();
        if (!rangeStartIso) {
          throw new BookingValidationError('Unable to build slot validation range.');
        }

        const [rules, overrides, existingBookings] = await Promise.all([
          transaction
            .select({
              dayOfWeek: availabilityRules.dayOfWeek,
              startMinute: availabilityRules.startMinute,
              endMinute: availabilityRules.endMinute,
              bufferBeforeMinutes: availabilityRules.bufferBeforeMinutes,
              bufferAfterMinutes: availabilityRules.bufferAfterMinutes,
            })
            .from(availabilityRules)
            .where(eq(availabilityRules.userId, organizerRow.id)),
          transaction
            .select({
              startAt: availabilityOverrides.startAt,
              endAt: availabilityOverrides.endAt,
              isAvailable: availabilityOverrides.isAvailable,
            })
            .from(availabilityOverrides)
            .where(
              and(
                eq(availabilityOverrides.userId, organizerRow.id),
                lt(availabilityOverrides.startAt, rangeEnd.toJSDate()),
                gt(availabilityOverrides.endAt, rangeStart.toJSDate()),
              ),
            ),
          transaction
            .select({
              id: bookings.id,
              startsAt: bookings.startsAt,
              endsAt: bookings.endsAt,
              status: bookings.status,
              metadata: bookings.metadata,
            })
            .from(bookings)
            .where(
              and(
                eq(bookings.organizerId, organizerRow.id),
                eq(bookings.status, 'confirmed'),
                lt(bookings.startsAt, rangeEnd.toJSDate()),
                gt(bookings.endsAt, rangeStart.toJSDate()),
              ),
            ),
        ]);

        const slotResolution = resolveRequestedRescheduleSlot({
          requestedStartsAtIso,
          durationMinutes: eventTypeRow.durationMinutes,
          organizerTimezone: normalizeTimezone(organizerRow.timezone),
          rules,
          overrides,
          bookings: existingBookings,
          excludeBookingId: booking.id,
        });

        if (!slotResolution) {
          throw new BookingConflictError('Selected slot is no longer available.');
        }

        const existingMetadata = parseBookingMetadata(booking.metadata, normalizeTimezone);
        const metadata = JSON.stringify({
          answers: existingMetadata.answers,
          timezone,
          bufferBeforeMinutes: slotResolution.matchingSlot.bufferBeforeMinutes,
          bufferAfterMinutes: slotResolution.matchingSlot.bufferAfterMinutes,
        });

        let insertedBooking: {
          id: string;
          eventTypeId: string;
          organizerId: string;
          inviteeName: string;
          inviteeEmail: string;
          startsAt: Date;
          endsAt: Date;
        } | null = null;

        try {
          const [inserted] = await transaction
            .insert(bookings)
            .values({
              eventTypeId: booking.eventTypeId,
              organizerId: booking.organizerId,
              inviteeName: booking.inviteeName,
              inviteeEmail: booking.inviteeEmail,
              startsAt: slotResolution.requestedStartsAt,
              endsAt: slotResolution.requestedEndsAt,
              status: 'confirmed',
              rescheduledFromBookingId: booking.id,
              metadata,
            })
            .returning({
              id: bookings.id,
              eventTypeId: bookings.eventTypeId,
              organizerId: bookings.organizerId,
              inviteeName: bookings.inviteeName,
              inviteeEmail: bookings.inviteeEmail,
              startsAt: bookings.startsAt,
              endsAt: bookings.endsAt,
            });

          insertedBooking = inserted ?? null;
        } catch (error) {
          if (isUniqueViolation(error, 'bookings_unique_slot')) {
            throw new BookingConflictError('Selected slot is no longer available.');
          }
          throw error;
        }

        if (!insertedBooking) {
          throw new Error('Failed to create rescheduled booking.');
        }

        await transaction
          .update(bookings)
          .set({
            status: 'rescheduled',
          })
          .where(eq(bookings.id, booking.id));

        const tokenSet = createBookingActionTokenSet(now);
        await transaction.insert(bookingActionTokens).values(
          tokenSet.tokenWrites.map((tokenWrite) => ({
            bookingId: insertedBooking.id,
            actionType: tokenWrite.actionType,
            tokenHash: tokenWrite.tokenHash,
            expiresAt: tokenWrite.expiresAt,
          })),
        );

        await transaction
          .update(bookingActionTokens)
          .set({
            consumedAt: now,
            consumedBookingId: insertedBooking.id,
          })
          .where(
            and(eq(bookingActionTokens.bookingId, booking.id), isNull(bookingActionTokens.consumedAt)),
          );

        return {
          oldBooking: {
            ...booking,
            status: 'rescheduled',
          },
          newBooking: insertedBooking,
          eventType: eventTypeRow,
          organizer: organizerRow,
          actionTokens: tokenSet.publicTokens,
          alreadyProcessed: false,
        };
      });

      const email = result.alreadyProcessed
        ? {
            sent: false,
            provider: 'none' as const,
            error: 'Idempotent replay: reschedule already processed.',
          }
        : await Promise.all([
            sendBookingRescheduledEmail(context.env, {
              recipientEmail: result.newBooking.inviteeEmail,
              recipientName: result.newBooking.inviteeName,
              recipientRole: 'invitee',
              organizerDisplayName: result.organizer.displayName,
              eventName: result.eventType.name,
              oldStartsAt: result.oldBooking.startsAt.toISOString(),
              newStartsAt: result.newBooking.startsAt.toISOString(),
              timezone,
              idempotencyKey: `booking-rescheduled:${result.oldBooking.id}:${result.newBooking.id}:invitee`,
            }),
            sendBookingRescheduledEmail(context.env, {
              recipientEmail: result.organizer.email,
              recipientName: result.organizer.displayName,
              recipientRole: 'organizer',
              organizerDisplayName: result.organizer.displayName,
              eventName: result.eventType.name,
              oldStartsAt: result.oldBooking.startsAt.toISOString(),
              newStartsAt: result.newBooking.startsAt.toISOString(),
              timezone,
              idempotencyKey: `booking-rescheduled:${result.oldBooking.id}:${result.newBooking.id}:organizer`,
            }),
          ]);

      const actions = result.actionTokens
        ? (() => {
            const tokens = actionTokenMap(result.actionTokens);
            const urls = buildActionUrls(context.req.raw, {
              cancelToken: tokens.cancelToken,
              rescheduleToken: tokens.rescheduleToken,
            });

            return {
              cancel: {
                token: tokens.cancelToken,
                expiresAt: tokens.cancelExpiresAt,
                lookupUrl: urls.lookupCancelUrl,
                url: urls.cancelUrl,
              },
              reschedule: {
                token: tokens.rescheduleToken,
                expiresAt: tokens.rescheduleExpiresAt,
                lookupUrl: urls.lookupRescheduleUrl,
                url: urls.rescheduleUrl,
              },
            };
          })()
        : null;

      return context.json({
        ok: true,
        oldBooking: {
          id: result.oldBooking.id,
          status: result.oldBooking.status,
        },
        newBooking: {
          id: result.newBooking.id,
          status: 'confirmed',
          rescheduledFromBookingId: result.oldBooking.id,
          startsAt: result.newBooking.startsAt.toISOString(),
          endsAt: result.newBooking.endsAt.toISOString(),
        },
        actions,
        email,
      });
    } catch (error) {
      if (error instanceof BookingActionNotFoundError) {
        return jsonError(context, 404, 'Action link is invalid or expired.');
      }
      if (error instanceof BookingActionGoneError) {
        return jsonError(context, 410, 'Action link is invalid or expired.');
      }
      if (error instanceof BookingValidationError) {
        return jsonError(context, 400, error.message);
      }
      if (error instanceof BookingConflictError) {
        return jsonError(context, 409, error.message);
      }
      throw error;
    }
  });
});

app.onError((error, context) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  return jsonError(context, 500, message);
});

export default app;
