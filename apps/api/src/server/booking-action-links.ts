import { sql } from 'drizzle-orm';

import { hashToken } from '../lib/auth';
import { coerceBookingActionDate } from '../lib/booking-actions';
import type { BookingActionType, Database, LockedActionToken, LockedBooking } from './types';

export const actionTokenMap = (
  tokens: Array<{ actionType: BookingActionType; token: string; expiresAt: string }>,
) => {
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

export const buildActionUrls = (
  request: Request,
  appBaseUrl: string,
  tokenMap: { cancelToken: string; rescheduleToken: string },
) => {
  const apiOrigin = new URL(request.url).origin;
  return {
    lookupCancelUrl: `${apiOrigin}/v0/bookings/actions/${tokenMap.cancelToken}`,
    lookupRescheduleUrl: `${apiOrigin}/v0/bookings/actions/${tokenMap.rescheduleToken}`,
    cancelUrl: `${apiOrigin}/v0/bookings/actions/${tokenMap.cancelToken}/cancel`,
    rescheduleUrl: `${apiOrigin}/v0/bookings/actions/${tokenMap.rescheduleToken}/reschedule`,
    cancelPageUrl: `${appBaseUrl}/bookings/actions/${tokenMap.cancelToken}`,
    reschedulePageUrl: `${appBaseUrl}/bookings/actions/${tokenMap.rescheduleToken}`,
  };
};

export const lockActionToken = async (
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
  const row = locked.rows[0];
  return row
    ? {
        ...row,
        expiresAt: coerceBookingActionDate(row.expiresAt, 'Booking action token expiry'),
        consumedAt: row.consumedAt
          ? coerceBookingActionDate(row.consumedAt, 'Booking action token consumption')
          : null,
      }
    : null;
};

export const lockBooking = async (
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
  const row = locked.rows[0];
  return row
    ? {
        ...row,
        startsAt: coerceBookingActionDate(row.startsAt, 'Booking start time'),
        endsAt: coerceBookingActionDate(row.endsAt, 'Booking end time'),
      }
    : null;
};

export const hashActionToken = (token: string): string => {
  return hashToken(token);
};
