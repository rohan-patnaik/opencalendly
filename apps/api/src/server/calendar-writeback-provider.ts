import { eq } from 'drizzle-orm';

import type { CalendarWritebackProviderClient } from '../lib/calendar-writeback';
import type {
  resolveGoogleOAuthConfig,
  resolveMicrosoftOAuthConfig,
} from './env';
import { calendarConnections } from '@opencalendly/db';

import { encryptSecret } from '../lib/calendar-crypto';
import {
  resolveGoogleAccessToken,
  resolveMicrosoftAccessToken,
} from '../lib/calendar-sync';
import {
  cancelGoogleCalendarEvent,
  createGoogleCalendarEvent,
  findGoogleCalendarEventByIdempotencyKey,
  updateGoogleCalendarEvent,
} from '../lib/google-calendar';
import {
  cancelMicrosoftCalendarEvent,
  createMicrosoftCalendarEvent,
  findMicrosoftCalendarEventByIdempotencyKey,
  updateMicrosoftCalendarEvent,
} from '../lib/microsoft-calendar';
import {
  GOOGLE_CALENDAR_PROVIDER,
} from './env';
import type { CalendarProvider, Database } from './types';

type ProviderClientInput = {
  db: Database;
  now: Date;
  provider: CalendarProvider;
  timezone: string;
  connectionId: string;
  connectionAccessTokenEncrypted: string;
  connectionRefreshTokenEncrypted: string;
  connectionAccessTokenExpiresAt: Date;
  encryptionSecret: string;
  googleConfig: ReturnType<typeof resolveGoogleOAuthConfig>;
  microsoftConfig: ReturnType<typeof resolveMicrosoftOAuthConfig>;
};

export const buildCalendarWritebackProviderClient = ({
  db,
  now,
  provider,
  timezone,
  connectionId,
  connectionAccessTokenEncrypted,
  connectionRefreshTokenEncrypted,
  connectionAccessTokenExpiresAt,
  encryptionSecret,
  googleConfig,
  microsoftConfig,
}: ProviderClientInput): CalendarWritebackProviderClient => {
  const getToken = async (): Promise<string> => {
    if (provider === GOOGLE_CALENDAR_PROVIDER) {
      if (!googleConfig) {
        throw new Error('Google OAuth is not configured for calendar writeback.');
      }
      const resolved = await resolveGoogleAccessToken({
        connection: {
          accessTokenEncrypted: connectionAccessTokenEncrypted,
          refreshTokenEncrypted: connectionRefreshTokenEncrypted,
          accessTokenExpiresAt: connectionAccessTokenExpiresAt,
        },
        encryptionSecret,
        clientId: googleConfig.clientId,
        clientSecret: googleConfig.clientSecret,
        now,
      });
      await db
        .update(calendarConnections)
        .set({
          accessTokenEncrypted: encryptSecret(resolved.accessToken, encryptionSecret),
          refreshTokenEncrypted: encryptSecret(resolved.refreshToken, encryptionSecret),
          accessTokenExpiresAt: resolved.accessTokenExpiresAt,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(calendarConnections.id, connectionId));
      return resolved.accessToken;
    }

    if (!microsoftConfig) {
      throw new Error('Microsoft OAuth is not configured for calendar writeback.');
    }
    const resolved = await resolveMicrosoftAccessToken({
      connection: {
        accessTokenEncrypted: connectionAccessTokenEncrypted,
        refreshTokenEncrypted: connectionRefreshTokenEncrypted,
        accessTokenExpiresAt: connectionAccessTokenExpiresAt,
      },
      encryptionSecret,
      clientId: microsoftConfig.clientId,
      clientSecret: microsoftConfig.clientSecret,
      now,
    });
    await db
      .update(calendarConnections)
      .set({
        accessTokenEncrypted: encryptSecret(resolved.accessToken, encryptionSecret),
        refreshTokenEncrypted: encryptSecret(resolved.refreshToken, encryptionSecret),
        accessTokenExpiresAt: resolved.accessTokenExpiresAt,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(calendarConnections.id, connectionId));
    return resolved.accessToken;
  };

  return {
    createEvent: async (bookingContext) => {
      const accessToken = await getToken();
      return provider === GOOGLE_CALENDAR_PROVIDER
        ? createGoogleCalendarEvent({ accessToken, ...bookingContext })
        : createMicrosoftCalendarEvent({
            accessToken,
            idempotencyKey: bookingContext.idempotencyKey,
            eventName: bookingContext.eventName,
            inviteeName: bookingContext.inviteeName,
            inviteeEmail: bookingContext.inviteeEmail,
            startsAtIso: bookingContext.startsAtIso,
            endsAtIso: bookingContext.endsAtIso,
            locationValue: bookingContext.locationValue,
          });
    },
    findEventByIdempotencyKey: async ({ idempotencyKey }) => {
      const accessToken = await getToken();
      return provider === GOOGLE_CALENDAR_PROVIDER
        ? findGoogleCalendarEventByIdempotencyKey({ accessToken, idempotencyKey })
        : findMicrosoftCalendarEventByIdempotencyKey({ accessToken, idempotencyKey });
    },
    cancelEvent: async ({ externalEventId }) => {
      const accessToken = await getToken();
      if (provider === GOOGLE_CALENDAR_PROVIDER) {
        await cancelGoogleCalendarEvent({ accessToken, externalEventId });
        return;
      }
      await cancelMicrosoftCalendarEvent({ accessToken, externalEventId });
    },
    updateEvent: async (updateInput) => {
      const accessToken = await getToken();
      if (provider === GOOGLE_CALENDAR_PROVIDER) {
        await updateGoogleCalendarEvent({ accessToken, timezone, ...updateInput });
        return;
      }
      await updateMicrosoftCalendarEvent({ accessToken, ...updateInput });
    },
  };
};
