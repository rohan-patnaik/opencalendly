'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  COMMON_TIMEZONES,
  createIdempotencyKey,
  formatSlot,
  getBrowserTimezone,
  groupSlotsByDay,
} from '../../../lib/public-booking';
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

const readableLocation = (locationType: string, locationValue: string | null): string => {
  if (locationValue && locationValue.trim().length > 0) {
    return locationValue;
  }
  return locationType.replaceAll('_', ' ');
};

export default function BookingPageClient({ username, eventSlug, apiBaseUrl }: BookingPageClientProps) {
  const [timezone, setTimezone] = useState('UTC');
  const [eventData, setEventData] = useState<PublicEventResponse | null>(null);
  const [slots, setSlots] = useState<Array<{ startsAt: string; endsAt: string }>>([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [inviteeName, setInviteeName] = useState('');
  const [inviteeEmail, setInviteeEmail] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pageError, setPageError] = useState<string | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const timezoneOptions = useMemo(() => {
    return Array.from(new Set([timezone, ...COMMON_TIMEZONES]));
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

  const trackFunnelEvent = useCallback(
    (stage: 'page_view' | 'slot_selection') => {
      void fetch(`${apiBaseUrl}/v0/analytics/funnel/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          eventSlug,
          stage,
        }),
      }).catch(() => undefined);
    },
    [apiBaseUrl, eventSlug, username],
  );

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
      setAnswers(
        payload.eventType.questions.reduce<Record<string, string>>((accumulator, question) => {
          accumulator[question.id] = '';
          return accumulator;
        }, {}),
      );
      trackFunnelEvent('page_view');
    } catch {
      setPageError('Unable to load event details.');
      setEventData(null);
    } finally {
      setLoadingEvent(false);
    }
  }, [apiBaseUrl, eventSlug, trackFunnelEvent, username]);

  const loadAvailability = useCallback(async () => {
    setLoadingSlots(true);
    setPageError(null);

    try {
      const params = new URLSearchParams({
        timezone,
        start: new Date().toISOString(),
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

    const missingRequiredQuestion = eventData?.eventType.questions.find(
      (question) => question.required && !(answers[question.id] ?? '').trim(),
    );
    if (missingRequiredQuestion) {
      setPageError(`Answer required question: "${missingRequiredQuestion.label}".`);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/v0/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': createIdempotencyKey(),
        },
        body: JSON.stringify({
          username,
          eventSlug,
          startsAt: selectedSlot,
          timezone,
          inviteeName,
          inviteeEmail,
          answers: Object.fromEntries(
            Object.entries(answers).filter((entry) => entry[1].trim().length > 0),
          ),
        }),
      });
      const payload = (await response.json()) as BookingResponse;
      if (!response.ok || !payload.ok || !payload.booking) {
        setPageError(payload.error || 'Booking failed. Please choose another slot.');
        return;
      }

      setConfirmation(`Confirmed for ${formatSlot(payload.booking.startsAt, timezone)} (${timezone}).`);
      setInviteeName('');
      setInviteeEmail('');
      setSelectedSlot('');
      setAnswers(
        eventData?.eventType.questions.reduce<Record<string, string>>((accumulator, question) => {
          accumulator[question.id] = '';
          return accumulator;
        }, {}) ?? {},
      );
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
        <section className={styles.heroCard}>
          <p className={styles.kicker}>Public booking</p>
          <h1>Loading event...</h1>
        </section>
      </main>
    );
  }

  if (!eventData) {
    return (
      <main className={styles.page}>
        <section className={styles.heroCard}>
          <p className={styles.kicker}>Public booking</p>
          <h1>Event unavailable</h1>
          <p className={styles.error}>{pageError || 'Event not found.'}</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.heroCard}>
        <p className={styles.kicker}>Open booking link</p>
        <h1>{eventData.eventType.name}</h1>
        <p>
          Hosted by <strong>{eventData.organizer.displayName}</strong> ·{' '}
          {eventData.eventType.durationMinutes} minutes
        </p>
        <p>Location: {readableLocation(eventData.eventType.locationType, eventData.eventType.locationValue)}</p>
      </section>

      <section className={styles.layout}>
        <div className={styles.card}>
          <div className={styles.sectionHead}>
            <h2>Pick your time</h2>
            <p>Slots are shown in your selected timezone.</p>
          </div>

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

          {loadingSlots ? <p className={styles.muted}>Loading slots...</p> : null}
          {!loadingSlots && slots.length === 0 ? (
            <p className={styles.muted}>No slots available in the next 7 days.</p>
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
                      onClick={() => {
                        if (selectedSlot === slot.startsAt) {
                          return;
                        }
                        setSelectedSlot(slot.startsAt);
                        trackFunnelEvent('slot_selection');
                      }}
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
          <div className={styles.sectionHead}>
            <h2>Your details</h2>
            <p>We will email your booking confirmation and action links.</p>
          </div>

          {selectedSlotLabel ? (
            <p className={styles.selection}>
              Selected slot: <strong>{selectedSlotLabel}</strong>
            </p>
          ) : (
            <p className={styles.selection}>Select a slot to continue.</p>
          )}

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

            {eventData.eventType.questions.map((question) => (
              <label key={question.id} className={styles.label} htmlFor={`question-${question.id}`}>
                {question.label}
                <input
                  id={`question-${question.id}`}
                  className={styles.input}
                  value={answers[question.id] ?? ''}
                  onChange={(entry) =>
                    setAnswers((previous) => ({
                      ...previous,
                      [question.id]: entry.target.value,
                    }))
                  }
                  placeholder={question.placeholder ?? ''}
                  required={question.required}
                />
              </label>
            ))}

            <button className={styles.primaryButton} type="submit" disabled={submitting}>
              {submitting ? 'Booking...' : 'Confirm booking'}
            </button>
          </form>

          {pageError ? <p className={styles.error}>{pageError}</p> : null}
          {confirmation ? <p className={styles.confirmation}>{confirmation}</p> : null}
        </div>
      </section>
    </main>
  );
}
