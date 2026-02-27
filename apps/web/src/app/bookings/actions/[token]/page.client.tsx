'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import {
  COMMON_TIMEZONES,
  createIdempotencyKey,
  formatSlot,
  getBrowserTimezone,
  groupSlotsByDay,
} from '../../../../lib/public-booking';
import styles from './page.module.css';

type BookingActionLookupResponse = {
  ok: boolean;
  actionType: 'cancel' | 'reschedule';
  booking: {
    id: string;
    status: 'confirmed' | 'canceled' | 'rescheduled';
    startsAt: string;
    endsAt: string;
    timezone: string;
    inviteeName: string;
    inviteeEmail: string;
    rescheduledTo: {
      id: string;
      startsAt: string;
      endsAt: string;
    } | null;
    team: {
      teamId: string;
      teamSlug: string | null;
      teamEventTypeId: string;
      mode: 'round_robin' | 'collective';
      assignmentUserIds: string[];
    } | null;
  };
  eventType: {
    slug: string;
    name: string;
    durationMinutes: number;
  };
  organizer: {
    username: string;
    displayName: string;
    timezone: string;
  };
  actions: {
    canCancel: boolean;
    canReschedule: boolean;
  };
  error?: string;
};

type BookingActionApiError = {
  ok: false;
  error: string;
};

type AvailabilityResponse = {
  ok: boolean;
  timezone: string;
  slots: Array<{
    startsAt: string;
    endsAt: string;
    assignmentUserIds?: string[];
  }>;
  error?: string;
};

type CancelResponse = {
  ok: boolean;
  booking?: {
    id: string;
    status: 'canceled';
  };
  error?: string;
};

type RescheduleResponse = {
  ok: boolean;
  oldBooking?: {
    id: string;
    status: 'rescheduled';
  };
  newBooking?: {
    id: string;
    status: 'confirmed';
    startsAt: string;
    endsAt: string;
  };
  error?: string;
};

type ActionStatus = 'active' | 'invalid' | 'expired';

type BookingActionPageClientProps = {
  token: string;
  apiBaseUrl: string;
};

const getErrorMessage = (payload: unknown, fallback: string): string => {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim().length > 0) {
      return error;
    }
  }
  return fallback;
};

const statusLabel = (status: BookingActionLookupResponse['booking']['status']): string => {
  if (status === 'confirmed') {
    return 'Confirmed';
  }
  if (status === 'canceled') {
    return 'Canceled';
  }
  return 'Rescheduled';
};

export default function BookingActionPageClient({ token, apiBaseUrl }: BookingActionPageClientProps) {
  const [actionStatus, setActionStatus] = useState<ActionStatus>('active');
  const [actionData, setActionData] = useState<BookingActionLookupResponse | null>(null);
  const [timezone, setTimezone] = useState('UTC');
  const [slots, setSlots] = useState<Array<{ startsAt: string; endsAt: string; assignmentUserIds?: string[] }>>([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [rescheduleRequestKey, setRescheduleRequestKey] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [loadingAction, setLoadingAction] = useState(true);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [submittingCancel, setSubmittingCancel] = useState(false);
  const [submittingReschedule, setSubmittingReschedule] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const timezoneOptions = useMemo(() => {
    return Array.from(new Set([timezone, getBrowserTimezone(), ...COMMON_TIMEZONES]));
  }, [timezone]);

  const slotGroups = useMemo(() => {
    return groupSlotsByDay(slots, timezone);
  }, [slots, timezone]);

  const selectedSlotLabel = useMemo(() => {
    if (!selectedSlot) {
      return null;
    }
    return formatSlot(selectedSlot, timezone);
  }, [selectedSlot, timezone]);

  const bookingPageHref = useMemo(() => {
    if (!actionData) {
      return '/';
    }
    if (actionData.booking.team?.teamSlug) {
      return `/team/${encodeURIComponent(actionData.booking.team.teamSlug)}/${encodeURIComponent(actionData.eventType.slug)}`;
    }
    return `/${encodeURIComponent(actionData.organizer.username)}/${encodeURIComponent(actionData.eventType.slug)}`;
  }, [actionData]);

  const actionStatusLabel = useMemo(() => {
    if (actionStatus === 'expired') {
      return 'Expired';
    }
    if (actionStatus === 'invalid') {
      return 'Invalid';
    }
    return 'Active';
  }, [actionStatus]);

  const loadAction = useCallback(async () => {
    setLoadingAction(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${apiBaseUrl}/v0/bookings/actions/${encodeURIComponent(token)}`, {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as
        | BookingActionLookupResponse
        | BookingActionApiError
        | null;

      if (!response.ok || !payload || !('ok' in payload) || payload.ok !== true) {
        const errorMessage = getErrorMessage(payload, 'Unable to load booking action.');
        if (response.status === 410) {
          setActionStatus('expired');
        } else if (response.status === 404) {
          setActionStatus('invalid');
        } else {
          setActionStatus('active');
        }
        setActionData(null);
        setError(errorMessage);
        return;
      }

      setActionStatus('active');
      setActionData(payload);
      setTimezone(payload.booking.timezone || getBrowserTimezone());
    } catch {
      setActionData(null);
      setActionStatus('active');
      setError('Unable to load booking action.');
    } finally {
      setLoadingAction(false);
    }
  }, [apiBaseUrl, token]);

  const loadAvailability = useCallback(async () => {
    if (!actionData || !actionData.actions.canReschedule) {
      return;
    }

    setLoadingAvailability(true);
    setError(null);

    const params = new URLSearchParams({
      timezone,
      start: new Date().toISOString(),
      days: '14',
    });

    const path = actionData.booking.team?.teamSlug
      ? `/v0/teams/${encodeURIComponent(actionData.booking.team.teamSlug)}/event-types/${encodeURIComponent(actionData.eventType.slug)}/availability?${params.toString()}`
      : `/v0/users/${encodeURIComponent(actionData.organizer.username)}/event-types/${encodeURIComponent(actionData.eventType.slug)}/availability?${params.toString()}`;

    try {
      const response = await fetch(`${apiBaseUrl}${path}`, {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as AvailabilityResponse | BookingActionApiError | null;
      if (!response.ok || !payload || !('ok' in payload) || payload.ok !== true) {
        setSlots([]);
        setError(getErrorMessage(payload, 'Unable to load availability.'));
        return;
      }

      setSlots(payload.slots);
      setSelectedSlot((current) => {
        return payload.slots.some((slot) => slot.startsAt === current) ? current : '';
      });
    } catch {
      setSlots([]);
      setError('Unable to load availability.');
    } finally {
      setLoadingAvailability(false);
    }
  }, [actionData, apiBaseUrl, timezone]);

  useEffect(() => {
    void loadAction();
  }, [loadAction]);

  useEffect(() => {
    if (!actionData?.actions.canReschedule) {
      return;
    }
    void loadAvailability();
  }, [actionData?.actions.canReschedule, loadAvailability]);

  useEffect(() => {
    if (!selectedSlot) {
      setRescheduleRequestKey('');
      return;
    }
    setRescheduleRequestKey(createIdempotencyKey());
  }, [selectedSlot]);

  const submitCancel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!actionData || !actionData.actions.canCancel) {
      return;
    }

    setSubmittingCancel(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${apiBaseUrl}/v0/bookings/actions/${encodeURIComponent(token)}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: cancelReason.trim() || undefined,
        }),
      });
      const payload = (await response.json().catch(() => null)) as CancelResponse | BookingActionApiError | null;

      if (!response.ok || !payload || !('ok' in payload) || payload.ok !== true) {
        const message = getErrorMessage(payload, 'Unable to cancel booking.');
        if (response.status === 410) {
          setActionStatus('expired');
          setActionData(null);
        } else if (response.status === 404) {
          setActionStatus('invalid');
          setActionData(null);
        }
        setError(message);
        return;
      }

      setSuccess('Booking canceled successfully.');
      setSlots([]);
      setSelectedSlot('');
      setActionData((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          booking: {
            ...current.booking,
            status: 'canceled',
          },
          actions: {
            canCancel: false,
            canReschedule: false,
          },
        };
      });
    } catch {
      setError('Unable to cancel booking.');
    } finally {
      setSubmittingCancel(false);
    }
  };

  const submitReschedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!actionData || !actionData.actions.canReschedule) {
      return;
    }
    if (!selectedSlot) {
      setError('Select a new timeslot before rescheduling.');
      return;
    }

    setSubmittingReschedule(true);
    setError(null);
    setSuccess(null);

    try {
      const requestIdempotencyKey = rescheduleRequestKey || createIdempotencyKey();
      if (!rescheduleRequestKey) {
        setRescheduleRequestKey(requestIdempotencyKey);
      }
      const response = await fetch(`${apiBaseUrl}/v0/bookings/actions/${encodeURIComponent(token)}/reschedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestIdempotencyKey,
        },
        body: JSON.stringify({
          startsAt: selectedSlot,
          timezone,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | RescheduleResponse
        | BookingActionApiError
        | null;

      if (!response.ok || !payload || !('ok' in payload) || payload.ok !== true) {
        const message = getErrorMessage(payload, 'Unable to reschedule booking.');
        if (response.status === 409) {
          const normalizedMessage = message.toLowerCase();
          const conflictMessage =
            normalizedMessage.includes('idempotency') || normalizedMessage.includes('slot')
              ? message
              : `Selected slot is no longer available. ${message}`;
          setError(conflictMessage);
          void loadAvailability();
          return;
        }
        if (response.status === 410) {
          setActionStatus('expired');
          setActionData(null);
          setRescheduleRequestKey('');
        } else if (response.status === 404) {
          setActionStatus('invalid');
          setActionData(null);
          setRescheduleRequestKey('');
        }
        setError(message);
        return;
      }

      if (!payload.newBooking) {
        setError('Reschedule completed but new booking details were missing.');
        return;
      }
      const newBooking = payload.newBooking;

      setSuccess(`Rescheduled successfully to ${formatSlot(newBooking.startsAt, timezone)}.`);
      setSelectedSlot('');
      setRescheduleRequestKey('');
      setSlots([]);
      setActionData((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          booking: {
            ...current.booking,
            status: 'rescheduled',
            rescheduledTo: {
              id: newBooking.id,
              startsAt: newBooking.startsAt,
              endsAt: newBooking.endsAt,
            },
          },
          actions: {
            canCancel: false,
            canReschedule: false,
          },
        };
      });
    } catch {
      setError('Unable to reschedule booking.');
    } finally {
      setSubmittingReschedule(false);
    }
  };

  if (loadingAction) {
    return (
      <main className={styles.page}>
        <section className={styles.heroCard}>
          <p className={styles.kicker}>Booking actions</p>
          <h1>Loading action link...</h1>
        </section>
      </main>
    );
  }

  if (!actionData) {
    return (
      <main className={styles.page}>
        <section className={styles.heroCard}>
          <p className={styles.kicker}>Booking actions</p>
          <p className={styles.statusPill}>Link status: {actionStatusLabel}</p>
          <h1>{actionStatus === 'expired' ? 'Action link expired' : 'Action link unavailable'}</h1>
          <p className={styles.error}>{error || 'Action link is invalid or expired.'}</p>
          <Link className={styles.secondaryButton} href="/">
            Return to home
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.heroCard}>
        <p className={styles.kicker}>Booking actions</p>
        <p className={styles.statusPill}>Link status: {actionStatusLabel}</p>
        <h1>{actionData.eventType.name}</h1>
        <p>
          Invitee: <strong>{actionData.booking.inviteeName}</strong> ({actionData.booking.inviteeEmail})
        </p>
        <p>
          Current status: <strong>{statusLabel(actionData.booking.status)}</strong>
        </p>
        <p>
          Scheduled for <strong>{formatSlot(actionData.booking.startsAt, actionData.booking.timezone)}</strong>
        </p>
        {actionData.booking.team ? (
          <p>
            Team mode: <strong>{actionData.booking.team.mode.replace('_', ' ')}</strong>
          </p>
        ) : (
          <p>
            Organizer: <strong>{actionData.organizer.displayName}</strong>
          </p>
        )}
      </section>

      {actionData.actions.canReschedule ? (
        <section className={styles.layout}>
          <div className={styles.card}>
            <h2>Choose a new slot</h2>
            <label className={styles.label} htmlFor="reschedule-timezone">
              Timezone
            </label>
            <select
              id="reschedule-timezone"
              className={styles.select}
              value={timezone}
              onChange={(entry) => setTimezone(entry.target.value)}
            >
              {timezoneOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            {loadingAvailability ? <p className={styles.muted}>Loading available slots...</p> : null}
            {!loadingAvailability && slots.length === 0 ? (
              <p className={styles.muted}>No slots are currently available. Try changing timezone.</p>
            ) : null}

            <div className={styles.slotDayStack}>
              {slotGroups.map((group) => (
                <section key={group.dateKey} className={styles.slotDay}>
                  <h3>{group.label}</h3>
                  <div className={styles.slotGrid}>
                    {group.slots.map((slot) => (
                      <button
                        key={slot.startsAt}
                        type="button"
                        className={slot.startsAt === selectedSlot ? styles.slotActive : styles.slot}
                        onClick={() => setSelectedSlot(slot.startsAt)}
                      >
                        {new Intl.DateTimeFormat(undefined, {
                          timeStyle: 'short',
                          timeZone: timezone,
                        }).format(new Date(slot.startsAt))}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <div className={styles.card}>
            <h2>Confirm reschedule</h2>
            {selectedSlotLabel ? (
              <p className={styles.selection}>
                New slot: <strong>{selectedSlotLabel}</strong>
              </p>
            ) : (
              <p className={styles.selection}>Select a slot before continuing.</p>
            )}
            <form className={styles.form} onSubmit={submitReschedule}>
              <button className={styles.primaryButton} type="submit" disabled={submittingReschedule}>
                {submittingReschedule ? 'Rescheduling...' : 'Reschedule booking'}
              </button>
            </form>
            <Link className={styles.inlineLink} href={bookingPageHref}>
              Open booking page instead
            </Link>
          </div>
        </section>
      ) : null}

      {actionData.actions.canCancel ? (
        <section className={styles.card}>
          <h2>Cancel booking</h2>
          <p className={styles.muted}>Provide an optional reason. Cancellation is idempotent.</p>
          <form className={styles.form} onSubmit={submitCancel}>
            <label className={styles.label} htmlFor="cancel-reason">
              Reason (optional)
            </label>
            <textarea
              id="cancel-reason"
              className={styles.textarea}
              value={cancelReason}
              onChange={(entry) => setCancelReason(entry.target.value)}
              rows={3}
              placeholder="Need to move this out by a week."
            />
            <button className={styles.dangerButton} type="submit" disabled={submittingCancel}>
              {submittingCancel ? 'Canceling...' : 'Cancel booking'}
            </button>
          </form>
        </section>
      ) : null}

      {!actionData.actions.canCancel && !actionData.actions.canReschedule ? (
        <section className={styles.card}>
          <h2>Action complete</h2>
          {actionData.booking.status === 'rescheduled' && actionData.booking.rescheduledTo ? (
            <p>
              This booking has already been rescheduled to{' '}
              <strong>{formatSlot(actionData.booking.rescheduledTo.startsAt, actionData.booking.timezone)}</strong>.
            </p>
          ) : null}
          {actionData.booking.status === 'canceled' ? (
            <p>This booking has already been canceled.</p>
          ) : null}
          <Link className={styles.secondaryButton} href={bookingPageHref}>
            Open public booking page
          </Link>
        </section>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}
      {success ? <p className={styles.success}>{success}</p> : null}
    </main>
  );
}
