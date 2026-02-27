'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  COMMON_TIMEZONES,
  createIdempotencyKey,
  formatSlot,
  getBrowserTimezone,
  groupSlotsByDay,
} from '../../../../lib/public-booking';
import { buildEmailDeliveryMessage } from '../../../../lib/booking-outcome';
import styles from './page.module.css';

type TeamEventResponse = {
  ok: boolean;
  team: {
    id: string;
    slug: string;
    name: string;
  };
  eventType: {
    id: string;
    slug: string;
    name: string;
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
  mode: 'round_robin' | 'collective';
  members: Array<{
    userId: string;
    role: 'owner' | 'member';
    user: {
      id: string;
      username: string;
      displayName: string;
      timezone: string;
    } | null;
  }>;
  error?: string;
};

type TeamAvailabilityResponse = {
  ok: boolean;
  mode: 'round_robin' | 'collective';
  timezone: string;
  slots: Array<{
    startsAt: string;
    endsAt: string;
    assignmentUserIds: string[];
  }>;
  error?: string;
};

type TeamBookingResponse = {
  ok: boolean;
  booking?: {
    id: string;
    startsAt: string;
    endsAt: string;
    assignmentUserIds: string[];
    teamMode: 'round_robin' | 'collective';
  };
  actions?: {
    cancel: {
      pageUrl: string;
    };
    reschedule: {
      pageUrl: string;
    };
  };
  email?: {
    sent: boolean;
    provider: string;
    error?: string;
  };
  error?: string;
};

type TeamBookingPageClientProps = {
  teamSlug: string;
  eventSlug: string;
  apiBaseUrl: string;
};

const buildInitialAnswers = (
  questions: TeamEventResponse['eventType']['questions'],
): Record<string, string> => {
  return questions.reduce<Record<string, string>>((accumulator, question) => {
    accumulator[question.id] = '';
    return accumulator;
  }, {});
};

const readableLocation = (locationType: string, locationValue: string | null): string => {
  if (locationValue && locationValue.trim().length > 0) {
    return locationValue;
  }
  return locationType.replaceAll('_', ' ');
};

export default function TeamBookingPageClient({
  teamSlug,
  eventSlug,
  apiBaseUrl,
}: TeamBookingPageClientProps) {
  const [timezone, setTimezone] = useState('UTC');
  const [teamEvent, setTeamEvent] = useState<TeamEventResponse | null>(null);
  const [slots, setSlots] = useState<
    Array<{ startsAt: string; endsAt: string; assignmentUserIds: string[] }>
  >([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [inviteeName, setInviteeName] = useState('');
  const [inviteeEmail, setInviteeEmail] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [bookingRequestKey, setBookingRequestKey] = useState('');
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<string | null>(null);
  const [actionLinks, setActionLinks] = useState<{
    cancelPageUrl: string;
    reschedulePageUrl: string;
  } | null>(null);

  const timezoneOptions = useMemo(() => {
    return Array.from(new Set([timezone, ...COMMON_TIMEZONES]));
  }, [timezone]);

  const slotGroups = useMemo(() => {
    return groupSlotsByDay(slots, timezone);
  }, [slots, timezone]);

  const selectedSlotDetails = useMemo(() => {
    if (!selectedSlot) {
      return null;
    }
    return slots.find((slot) => slot.startsAt === selectedSlot) ?? null;
  }, [selectedSlot, slots]);

  const loadTeamEvent = useCallback(async () => {
    setLoadingEvent(true);
    setError(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/v0/teams/${encodeURIComponent(teamSlug)}/event-types/${encodeURIComponent(eventSlug)}`,
        { cache: 'no-store' },
      );
      const payload = (await response.json()) as TeamEventResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.error || 'Unable to load team event details.');
        setTeamEvent(null);
        return;
      }

      setTeamEvent(payload);
      setAnswers(buildInitialAnswers(payload.eventType.questions));
    } catch {
      setError('Unable to load team event details.');
      setTeamEvent(null);
    } finally {
      setLoadingEvent(false);
    }
  }, [apiBaseUrl, eventSlug, teamSlug]);

  const loadAvailability = useCallback(async () => {
    setLoadingSlots(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        timezone,
        start: new Date().toISOString(),
        days: '7',
      });
      const response = await fetch(
        `${apiBaseUrl}/v0/teams/${encodeURIComponent(teamSlug)}/event-types/${encodeURIComponent(eventSlug)}/availability?${params.toString()}`,
        { cache: 'no-store' },
      );
      const payload = (await response.json()) as TeamAvailabilityResponse;
      if (!response.ok || !payload.ok) {
        setSlots([]);
        setError(payload.error || 'Unable to load team availability.');
        return;
      }

      setSlots(payload.slots);
      setSelectedSlot((current) => {
        return payload.slots.some((slot) => slot.startsAt === current) ? current : '';
      });
    } catch {
      setSlots([]);
      setError('Unable to load team availability.');
    } finally {
      setLoadingSlots(false);
    }
  }, [apiBaseUrl, eventSlug, teamSlug, timezone]);

  useEffect(() => {
    setTimezone(getBrowserTimezone());
  }, []);

  useEffect(() => {
    void loadTeamEvent();
  }, [loadTeamEvent]);

  useEffect(() => {
    if (!teamEvent) {
      return;
    }
    void loadAvailability();
  }, [loadAvailability, teamEvent]);

  useEffect(() => {
    if (!selectedSlot) {
      setBookingRequestKey('');
      return;
    }
    setBookingRequestKey(createIdempotencyKey());
  }, [selectedSlot]);

  const submitTeamBooking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setConfirmation(null);
    setDeliveryStatus(null);
    setActionLinks(null);

    if (!selectedSlot) {
      setError('Select a timeslot before booking.');
      return;
    }

    const missingRequiredQuestion = teamEvent?.eventType.questions.find(
      (question) => question.required && !(answers[question.id] ?? '').trim(),
    );
    if (missingRequiredQuestion) {
      setError(`Answer required question: "${missingRequiredQuestion.label}".`);
      return;
    }

    setSubmitting(true);
    try {
      const requestIdempotencyKey = bookingRequestKey || createIdempotencyKey();
      if (!bookingRequestKey) {
        setBookingRequestKey(requestIdempotencyKey);
      }
      const response = await fetch(`${apiBaseUrl}/v0/team-bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestIdempotencyKey,
        },
        body: JSON.stringify({
          teamSlug,
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

      const payload = (await response.json()) as TeamBookingResponse;
      if (!response.ok || !payload.ok || !payload.booking) {
        setError(payload.error || 'Team booking failed. Please pick another slot.');
        if (response.status === 409) {
          void loadAvailability();
        }
        return;
      }

      const inviteeEmailForNotice = inviteeEmail;
      setConfirmation(
        `Confirmed for ${formatSlot(payload.booking.startsAt, timezone)} with ${payload.booking.assignmentUserIds.length} assigned team member(s).`,
      );
      setDeliveryStatus(buildEmailDeliveryMessage(payload.email, inviteeEmailForNotice));
      if (payload.actions?.cancel.pageUrl && payload.actions.reschedule.pageUrl) {
        setActionLinks({
          cancelPageUrl: payload.actions.cancel.pageUrl,
          reschedulePageUrl: payload.actions.reschedule.pageUrl,
        });
      }
      setInviteeName('');
      setInviteeEmail('');
      setSelectedSlot('');
      setBookingRequestKey('');
      setAnswers(buildInitialAnswers(teamEvent?.eventType.questions ?? []));
      void loadAvailability();
    } catch {
      setError('Team booking failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingEvent) {
    return (
      <main className={styles.page}>
        <section className={styles.heroCard}>
          <p className={styles.kicker}>Team booking</p>
          <h1>Loading team event...</h1>
        </section>
      </main>
    );
  }

  if (!teamEvent) {
    return (
      <main className={styles.page}>
        <section className={styles.heroCard}>
          <p className={styles.kicker}>Team booking</p>
          <h1>Team event unavailable</h1>
          <p className={styles.error}>{error || 'Team event type not found.'}</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.heroCard}>
        <p className={styles.kicker}>Team booking link</p>
        <h1>{teamEvent.eventType.name}</h1>
        <p>
          Team: <strong>{teamEvent.team.name}</strong> · Mode:{' '}
          <strong>{teamEvent.mode.replaceAll('_', ' ')}</strong>
        </p>
        <p>
          Duration: {teamEvent.eventType.durationMinutes} min · Location:{' '}
          {readableLocation(teamEvent.eventType.locationType, teamEvent.eventType.locationValue)}
        </p>
      </section>

      <section className={styles.layout}>
        <div className={styles.card}>
          <h2>Choose a slot</h2>
          <label className={styles.label} htmlFor="team-timezone">
            Timezone
          </label>
          <select
            id="team-timezone"
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

          {loadingSlots ? <p className={styles.muted}>Loading slots...</p> : null}
          {!loadingSlots && slots.length === 0 ? (
            <p className={styles.muted}>No team slots available in the next 7 days.</p>
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
          <h2>Confirm team booking</h2>
          {selectedSlotDetails ? (
            <p className={styles.selection}>
              {formatSlot(selectedSlotDetails.startsAt, timezone)} ·{' '}
              {selectedSlotDetails.assignmentUserIds.length} assigned member(s)
            </p>
          ) : (
            <p className={styles.selection}>Select a slot to continue.</p>
          )}

          <form className={styles.form} onSubmit={submitTeamBooking}>
            <label className={styles.label} htmlFor="team-invitee-name">
              Your name
            </label>
            <input
              id="team-invitee-name"
              className={styles.input}
              value={inviteeName}
              onChange={(entry) => setInviteeName(entry.target.value)}
              required
            />

            <label className={styles.label} htmlFor="team-invitee-email">
              Your email
            </label>
            <input
              id="team-invitee-email"
              type="email"
              className={styles.input}
              value={inviteeEmail}
              onChange={(entry) => setInviteeEmail(entry.target.value)}
              required
            />

            {teamEvent.eventType.questions.map((question) => (
              <label key={question.id} className={styles.label} htmlFor={`team-question-${question.id}`}>
                {question.label}
                <input
                  id={`team-question-${question.id}`}
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
              {submitting ? 'Booking...' : 'Confirm team booking'}
            </button>
          </form>

          <div className={styles.memberPanel}>
            <h3>Required members</h3>
            <ul>
              {teamEvent.members.map((member) => (
                <li key={member.userId}>
                  {member.user?.displayName ?? member.userId} · {member.role}
                </li>
              ))}
            </ul>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}
          {confirmation ? <p className={styles.confirmation}>{confirmation}</p> : null}
          {deliveryStatus ? <p className={styles.notice}>{deliveryStatus}</p> : null}
          {actionLinks ? (
            <div className={styles.actionLinks}>
              <a className={styles.secondaryButton} href={actionLinks.cancelPageUrl}>
                Open cancel link
              </a>
              <a className={styles.secondaryButton} href={actionLinks.reschedulePageUrl}>
                Open reschedule link
              </a>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
