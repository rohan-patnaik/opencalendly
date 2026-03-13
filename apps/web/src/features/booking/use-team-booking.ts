'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  TeamAvailabilityResponse,
  TeamBookingResponse,
  TeamEventResponse,
} from '@opencalendly/shared';

import { buildEmailDeliveryMessage } from '../../lib/booking-outcome';
import { getAuthHeader } from '../../lib/auth-session';
import { useDemoQuota } from '../../lib/demo-quota';
import {
  COMMON_TIMEZONES,
  createIdempotencyKey,
  formatSlot,
  getBrowserTimezone,
  groupSlotsByDay,
} from '../../lib/public-booking';
import { useAuthSession } from '../../lib/use-auth-session';
import {
  buildInitialAnswers,
  toActionLinks,
  toAnsweredQuestions,
} from './common';

type TeamBookingArgs = {
  teamSlug: string;
  eventSlug: string;
  apiBaseUrl: string;
};

type ActionLinksState = {
  cancelPageUrl?: string;
  reschedulePageUrl?: string;
} | null;

export function useTeamBooking(input: TeamBookingArgs) {
  const { teamSlug, eventSlug, apiBaseUrl } = input;
  const { session, ready } = useAuthSession();
  const isLaunchDemoPage = teamSlug.trim().toLowerCase() === 'demo-team';
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
  const [actionLinks, setActionLinks] = useState<ActionLinksState>(null);
  const {
    status: demoQuotaStatus,
    loading: demoQuotaLoading,
    error: demoQuotaError,
    refresh: refreshDemoQuota,
  } = useDemoQuota({
    apiBaseUrl,
    session,
    enabled: isLaunchDemoPage,
  });

  const signInHref = useMemo(() => {
    return `/auth/sign-in?redirect_url=${encodeURIComponent(
      `/team/${encodeURIComponent(teamSlug)}/${encodeURIComponent(eventSlug)}`,
    )}`;
  }, [eventSlug, teamSlug]);

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
    if (isLaunchDemoPage && !session) {
      setTeamEvent(null);
      setLoadingEvent(false);
      return;
    }

    setLoadingEvent(true);
    setError(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/v0/teams/${encodeURIComponent(teamSlug)}/event-types/${encodeURIComponent(eventSlug)}`,
        {
          cache: 'no-store',
          headers: {
            ...getAuthHeader(session),
          },
        },
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
  }, [apiBaseUrl, eventSlug, isLaunchDemoPage, session, teamSlug]);

  const loadAvailability = useCallback(async () => {
    if (isLaunchDemoPage && !session) {
      setSlots([]);
      setLoadingSlots(false);
      return;
    }

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
        {
          cache: 'no-store',
          headers: {
            ...getAuthHeader(session),
          },
        },
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
  }, [apiBaseUrl, eventSlug, isLaunchDemoPage, session, teamSlug, timezone]);

  useEffect(() => {
    setTimezone(getBrowserTimezone());
  }, []);

  useEffect(() => {
    if (isLaunchDemoPage && !ready) {
      return;
    }
    void loadTeamEvent();
  }, [isLaunchDemoPage, loadTeamEvent, ready]);

  useEffect(() => {
    if (!teamEvent) {
      return;
    }
    if (isLaunchDemoPage && !session) {
      return;
    }
    void loadAvailability();
  }, [isLaunchDemoPage, loadAvailability, session, teamEvent]);

  useEffect(() => {
    if (!selectedSlot) {
      setBookingRequestKey('');
      return;
    }
    setBookingRequestKey(createIdempotencyKey());
  }, [selectedSlot]);

  const submitTeamBooking = useCallback(async () => {
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
          ...getAuthHeader(session),
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
          answers: toAnsweredQuestions(answers),
        }),
      });

      const payload = (await response.json()) as TeamBookingResponse;
      if (!response.ok || !payload.ok || !payload.booking) {
        setError(payload.error || 'Team booking failed. Please pick another slot.');
        if (response.status === 409) {
          void loadAvailability();
        }
        if (response.status === 429 && isLaunchDemoPage) {
          void refreshDemoQuota();
        }
        return;
      }

      setConfirmation(
        `Confirmed for ${formatSlot(payload.booking.startsAt, timezone)} with ${payload.booking.assignmentUserIds.length} assigned team member(s).`,
      );
      setDeliveryStatus(buildEmailDeliveryMessage(payload.email, inviteeEmail));
      setActionLinks(toActionLinks(payload.actions));
      setInviteeName('');
      setInviteeEmail('');
      setSelectedSlot('');
      setBookingRequestKey('');
      setAnswers(buildInitialAnswers(teamEvent?.eventType.questions ?? []));
      void loadAvailability();
      if (isLaunchDemoPage) {
        void refreshDemoQuota();
      }
    } catch {
      setError('Team booking failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [
    answers,
    apiBaseUrl,
    bookingRequestKey,
    eventSlug,
    inviteeEmail,
    inviteeName,
    isLaunchDemoPage,
    loadAvailability,
    refreshDemoQuota,
    selectedSlot,
    session,
    teamEvent,
    teamSlug,
    timezone,
  ]);

  return {
    actionLinks,
    answers,
    confirmation,
    deliveryStatus,
    demoQuotaError,
    demoQuotaLoading,
    demoQuotaStatus,
    error,
    inviteeEmail,
    inviteeName,
    isLaunchDemoPage,
    loadingEvent,
    loadingSlots,
    ready,
    refreshDemoQuota,
    selectedSlot,
    selectedSlotDetails,
    session,
    setAnswer: (questionId: string, value: string) => {
      setAnswers((previous) => ({
        ...previous,
        [questionId]: value,
      }));
    },
    setInviteeEmail,
    setInviteeName,
    setSelectedSlot,
    setTimezone,
    signInHref,
    slotGroups,
    slots,
    submitTeamBooking,
    submitting,
    teamEvent,
    timezone,
    timezoneOptions,
  };
}
