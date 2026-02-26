'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import styles from './page.module.css';

type PublicEventResponse = {
  ok: boolean;
  eventType: {
    name: string;
    slug: string;
    durationMinutes: number;
    locationType: string;
    locationValue: string | null;
    questions: Array<{
      id: string;
      label: string;
      required: boolean;
      placeholder?: string;
    }>;
  };
  organizer: {
    username: string;
    displayName: string;
    timezone: string;
  };
  error?: string;
};

type AvailabilityResponse = {
  ok: boolean;
  timezone: string;
  slots: Array<{
    startsAt: string;
    endsAt: string;
  }>;
  error?: string;
};

type BookingResponse = {
  ok: boolean;
  booking?: {
    id: string;
    startsAt: string;
    endsAt: string;
  };
  error?: string;
};

type BookingPageClientProps = {
  username: string;
  eventSlug: string;
  apiBaseUrl: string;
};

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const getBrowserTimezone = (): string => {
  if (typeof window === 'undefined') {
    return 'UTC';
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
};

const formatSlot = (isoDate: string, timezone: string): string => {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(isoDate));
};

export default function BookingPageClient({ username, eventSlug, apiBaseUrl }: BookingPageClientProps) {
  const [timezone, setTimezone] = useState('UTC');
  const [eventData, setEventData] = useState<PublicEventResponse | null>(null);
  const [slots, setSlots] = useState<Array<{ startsAt: string; endsAt: string }>>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [inviteeName, setInviteeName] = useState('');
  const [inviteeEmail, setInviteeEmail] = useState('');
  const [pageError, setPageError] = useState<string | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const timezoneOptions = useMemo(() => {
    return Array.from(new Set([timezone, ...COMMON_TIMEZONES]));
  }, [timezone]);

  const loadEvent = useCallback(async () => {
    setLoadingEvent(true);
    setPageError(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/v0/users/${encodeURIComponent(username)}/event-types/${encodeURIComponent(eventSlug)}`,
        { cache: 'no-store' },
      );
      const payload = (await response.json()) as PublicEventResponse;
      if (!response.ok || !payload.ok) {
        setPageError(payload.error || 'Unable to load event details.');
        setEventData(null);
        return;
      }

      setEventData(payload);
      void fetch(`${apiBaseUrl}/v0/analytics/funnel/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          eventSlug,
          stage: 'page_view',
        }),
      }).catch(() => undefined);
    } catch {
      setPageError('Unable to load event details.');
      setEventData(null);
    } finally {
      setLoadingEvent(false);
    }
  }, [apiBaseUrl, eventSlug, username]);

  const loadAvailability = useCallback(async () => {
    setLoadingSlots(true);
    setPageError(null);

    try {
      const start = new Date().toISOString();
      const params = new URLSearchParams({
        timezone,
        start,
        days: '7',
      });
      const response = await fetch(
        `${apiBaseUrl}/v0/users/${encodeURIComponent(username)}/event-types/${encodeURIComponent(eventSlug)}/availability?${params.toString()}`,
        { cache: 'no-store' },
      );
      const payload = (await response.json()) as AvailabilityResponse;
      if (!response.ok || !payload.ok) {
        setSlots([]);
        setPageError(payload.error || 'Unable to load availability.');
        return;
      }

      setSlots(payload.slots);
      setSelectedSlot((current) => {
        return payload.slots.some((slot) => slot.startsAt === current) ? current : '';
      });
    } catch {
      setSlots([]);
      setPageError('Unable to load availability.');
    } finally {
      setLoadingSlots(false);
    }
  }, [apiBaseUrl, eventSlug, timezone, username]);

  useEffect(() => {
    setTimezone(getBrowserTimezone());
  }, []);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  useEffect(() => {
    if (!eventData) {
      return;
    }
    void loadAvailability();
  }, [eventData, loadAvailability]);

  const submitBooking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setConfirmation(null);
    setPageError(null);

    if (!selectedSlot) {
      setPageError('Select a timeslot before booking.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/v0/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          eventSlug,
          startsAt: selectedSlot,
          timezone,
          inviteeName,
          inviteeEmail,
        }),
      });
      const payload = (await response.json()) as BookingResponse;
      if (!response.ok || !payload.ok || !payload.booking) {
        setPageError(payload.error || 'Booking failed. Please choose another slot.');
        return;
      }

      setConfirmation(
        `Confirmed for ${formatSlot(payload.booking.startsAt, timezone)} (${timezone}).`,
      );
      setInviteeName('');
      setInviteeEmail('');
      setSelectedSlot('');
      void loadAvailability();
    } catch {
      setPageError('Booking failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingEvent) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>Loading event...</section>
      </main>
    );
  }

  if (!eventData) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>{pageError || 'Event not found.'}</section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.kicker}>Public booking link</p>
        <h1>{eventData.eventType.name}</h1>
        <p>
          {eventData.organizer.displayName} • {eventData.eventType.durationMinutes} minutes
        </p>
        <p>
          Location:{' '}
          {eventData.eventType.locationValue || eventData.eventType.locationType.replace('_', ' ')}
        </p>
      </section>

      <section className={styles.card}>
        <label className={styles.label} htmlFor="timezone">
          Timezone
        </label>
        <select
          id="timezone"
          className={styles.select}
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
        >
          {timezoneOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <p className={styles.muted}>
          Organizer timezone: <strong>{eventData.organizer.timezone}</strong>
        </p>

        {loadingSlots ? <p>Loading slots...</p> : null}
        {!loadingSlots && slots.length === 0 ? <p>No slots available in the next 7 days.</p> : null}

        <div className={styles.slotGrid}>
          {slots.slice(0, 28).map((slot) => (
            <button
              key={slot.startsAt}
              type="button"
              className={slot.startsAt === selectedSlot ? styles.slotActive : styles.slot}
              onClick={() => {
                setSelectedSlot(slot.startsAt);
                void fetch(`${apiBaseUrl}/v0/analytics/funnel/events`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    username,
                    eventSlug,
                    stage: 'slot_selection',
                  }),
                }).catch(() => undefined);
              }}
            >
              {formatSlot(slot.startsAt, timezone)}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.card}>
        <h2>Book this time</h2>
        <form className={styles.form} onSubmit={submitBooking}>
          <label className={styles.label} htmlFor="invitee-name">
            Your name
          </label>
          <input
            id="invitee-name"
            className={styles.input}
            value={inviteeName}
            onChange={(event) => setInviteeName(event.target.value)}
            required
          />

          <label className={styles.label} htmlFor="invitee-email">
            Your email
          </label>
          <input
            id="invitee-email"
            type="email"
            className={styles.input}
            value={inviteeEmail}
            onChange={(event) => setInviteeEmail(event.target.value)}
            required
          />

          <button className={styles.primaryButton} type="submit" disabled={submitting}>
            {submitting ? 'Booking...' : 'Confirm booking'}
          </button>
        </form>

        {pageError ? <p className={styles.error}>{pageError}</p> : null}
        {confirmation ? <p className={styles.confirmation}>{confirmation}</p> : null}
      </section>
    </main>
  );
}
