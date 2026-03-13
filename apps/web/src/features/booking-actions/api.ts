import { API_REQUEST_CREDENTIALS, type AuthSession } from '../../lib/auth-session';
import type {
  AvailabilityResponse,
  BookingActionApiError,
  BookingActionLookupResponse,
  CancelResponse,
  RescheduleResponse,
} from './types';

const parseJson = async <T>(response: Response): Promise<T | null> => {
  return (await response.json().catch(() => null)) as T | null;
};

export const getErrorMessage = (payload: unknown, fallback: string): string => {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim().length > 0) {
      return error;
    }
  }
  return fallback;
};

export const fetchBookingAction = async (input: {
  apiBaseUrl: string;
  token: string;
  session: AuthSession | null;
}) => {
  const response = await fetch(
    `${input.apiBaseUrl}/v0/bookings/actions/${encodeURIComponent(input.token)}`,
    {
      cache: 'no-store',
      credentials: API_REQUEST_CREDENTIALS,
    },
  );
  const payload = await parseJson<BookingActionLookupResponse | BookingActionApiError>(response);
  return { response, payload };
};

export const fetchBookingActionAvailability = async (input: {
  apiBaseUrl: string;
  session: AuthSession | null;
  timezone: string;
  actionData: BookingActionLookupResponse;
}) => {
  const params = new URLSearchParams({
    timezone: input.timezone,
    start: new Date().toISOString(),
    days: '14',
  });

  const path = input.actionData.booking.team?.teamSlug
    ? `/v0/teams/${encodeURIComponent(input.actionData.booking.team.teamSlug)}/event-types/${encodeURIComponent(input.actionData.eventType.slug)}/availability?${params.toString()}`
    : `/v0/users/${encodeURIComponent(input.actionData.organizer.username)}/event-types/${encodeURIComponent(input.actionData.eventType.slug)}/availability?${params.toString()}`;

  const response = await fetch(`${input.apiBaseUrl}${path}`, {
    cache: 'no-store',
    credentials: API_REQUEST_CREDENTIALS,
  });
  const payload = await parseJson<AvailabilityResponse | BookingActionApiError>(response);
  return { response, payload };
};

export const postBookingCancel = async (input: {
  apiBaseUrl: string;
  token: string;
  session: AuthSession | null;
  cancelReason: string;
}) => {
  const response = await fetch(
    `${input.apiBaseUrl}/v0/bookings/actions/${encodeURIComponent(input.token)}/cancel`,
    {
      method: 'POST',
      credentials: API_REQUEST_CREDENTIALS,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reason: input.cancelReason.trim() || undefined,
      }),
    },
  );
  const payload = await parseJson<CancelResponse | BookingActionApiError>(response);
  return { response, payload };
};

export const postBookingReschedule = async (input: {
  apiBaseUrl: string;
  token: string;
  session: AuthSession | null;
  selectedSlot: string;
  timezone: string;
  idempotencyKey: string;
}) => {
  const response = await fetch(
    `${input.apiBaseUrl}/v0/bookings/actions/${encodeURIComponent(input.token)}/reschedule`,
    {
      method: 'POST',
      credentials: API_REQUEST_CREDENTIALS,
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        startsAt: input.selectedSlot,
        timezone: input.timezone,
      }),
    },
  );
  const payload = await parseJson<RescheduleResponse | BookingActionApiError>(response);
  return { response, payload };
};
