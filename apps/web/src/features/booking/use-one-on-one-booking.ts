'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  PublicAvailabilityResponse,
  PublicBookingResponse,
  PublicEventResponse,
} from '@opencalendly/shared';

import { buildEmailDeliveryMessage } from '../../lib/booking-outcome';
import { API_REQUEST_CREDENTIALS } from '../../lib/auth-session';
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

type OneOnOneBookingArgs = {
  username: string;
  eventSlug: string;
  apiBaseUrl: string;
};

type ActionLinksState = {
  cancelPageUrl?: string;
  reschedulePageUrl?: string;
} | null;

export function useOneOnOneBooking(input: OneOnOneBookingArgs) {
  const { username, eventSlug, apiBaseUrl } = input;
  const { session, ready } = useAuthSession();
  const isLaunchDemoPage = username.trim().toLowerCase() === 'demo';
  const [timezone, setTimezone] = useState('UTC');
  const [eventData, setEventData] = useState<PublicEventResponse | null>(null);
  const [slots, setSlots] = useState<Array<{ startsAt: string; endsAt: string }>>([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [inviteeName, setInviteeName] = useState('');
  const [inviteeEmail, setInviteeEmail] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [bookingRequestKey, setBookingRequestKey] = useState('');
  const [pageError, setPageError] = useState<string | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
      `/${encodeURIComponent(username)}/${encodeURIComponent(eventSlug)}`,
    )}`;
  }, [eventSlug, username]);

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
        credentials: API_REQUEST_CREDENTIALS,
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
    if (isLaunchDemoPage && !session) {
      setEventData(null);
      setLoadingEvent(false);
      return;
    }

    setLoadingEvent(true);
    setPageError(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/v0/users/${encodeURIComponent(username)}/event-types/${encodeURIComponent(eventSlug)}`,
        {
          cache: 'no-store',
          credentials: API_REQUEST_CREDENTIALS,
        },
      );
      const payload = (await response.json()) as PublicEventResponse;
      if (!response.ok || !payload.ok) {
        setPageError(payload.error || 'Unable to load event details.');
        setEventData(null);
        return;
      }

      setEventData(payload);
      setAnswers(buildInitialAnswers(payload.eventType.questions));
      trackFunnelEvent('page_view');
    } catch {
      setPageError('Unable to load event details.');
      setEventData(null);
    } finally {
      setLoadingEvent(false);
    }
  }, [apiBaseUrl, eventSlug, isLaunchDemoPage, session, trackFunnelEvent, username]);

  const loadAvailability = useCallback(async () => {
    if (isLaunchDemoPage && !session) {
      setSlots([]);
      setLoadingSlots(false);
      return;
    }

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
        {
          cache: 'no-store',
          credentials: API_REQUEST_CREDENTIALS,
        },
      );
      const payload = (await response.json()) as PublicAvailabilityResponse;
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
  }, [apiBaseUrl, eventSlug, isLaunchDemoPage, session, timezone, username]);

  useEffect(() => {
    setTimezone(getBrowserTimezone());
  }, []);

  useEffect(() => {
    if (isLaunchDemoPage && !ready) {
      return;
    }
    void loadEvent();
  }, [isLaunchDemoPage, loadEvent, ready]);

  useEffect(() => {
    if (!eventData) {
      return;
    }
    if (isLaunchDemoPage && !session) {
      return;
    }
    void loadAvailability();
  }, [eventData, isLaunchDemoPage, loadAvailability, session]);

  useEffect(() => {
    if (!selectedSlot) {
      setBookingRequestKey('');
      return;
    }
    setBookingRequestKey(createIdempotencyKey());
  }, [selectedSlot]);

  const submitBooking = useCallback(async () => {
    setConfirmation(null);
    setDeliveryStatus(null);
    setActionLinks(null);
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
      const requestIdempotencyKey = bookingRequestKey || createIdempotencyKey();
      if (!bookingRequestKey) {
        setBookingRequestKey(requestIdempotencyKey);
      }
      const response = await fetch(`${apiBaseUrl}/v0/bookings`, {
        method: 'POST',
        credentials: API_REQUEST_CREDENTIALS,
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestIdempotencyKey,
        },
        body: JSON.stringify({
          username,
          eventSlug,
          startsAt: selectedSlot,
          timezone,
          inviteeName,
          inviteeEmail,
          answers: toAnsweredQuestions(answers),
        }),
      });
      const payload = (await response.json()) as PublicBookingResponse;
      if (!response.ok || !payload.ok || !payload.booking) {
        setPageError(payload.error || 'Booking failed. Please choose another slot.');
        if (response.status === 409) {
          void loadAvailability();
        }
        if (response.status === 429 && isLaunchDemoPage) {
          void refreshDemoQuota();
        }
        return;
      }

      setConfirmation(`Confirmed for ${formatSlot(payload.booking.startsAt, timezone)} (${timezone}).`);
      setDeliveryStatus(buildEmailDeliveryMessage(payload.email, inviteeEmail));
      setActionLinks(toActionLinks(payload.actions));
      setInviteeName('');
      setInviteeEmail('');
      setSelectedSlot('');
      setBookingRequestKey('');
      setAnswers(buildInitialAnswers(eventData?.eventType.questions ?? []));
      void loadAvailability();
      if (isLaunchDemoPage) {
        void refreshDemoQuota();
      }
    } catch {
      setPageError('Booking failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [
    answers,
    apiBaseUrl,
    bookingRequestKey,
    eventData,
    eventSlug,
    inviteeEmail,
    inviteeName,
    isLaunchDemoPage,
    loadAvailability,
    refreshDemoQuota,
    selectedSlot,
    session,
    timezone,
    username,
  ]);

  return {
    actionLinks,
    answers,
    confirmation,
    deliveryStatus,
    demoQuotaError,
    demoQuotaLoading,
    demoQuotaStatus,
    eventData,
    inviteeEmail,
    inviteeName,
    isLaunchDemoPage,
    loadingEvent,
    loadingSlots,
    pageError,
    ready,
    refreshDemoQuota,
    selectedSlot,
    selectedSlotLabel,
    session,
    setAnswer: (questionId: string, value: string) => {
      setAnswers((previous) => ({
        ...previous,
        [questionId]: value,
      }));
    },
    setInviteeEmail,
    setInviteeName,
    setSelectedSlot: (slotStartsAt: string) => {
      if (slotStartsAt !== selectedSlot) {
        trackFunnelEvent('slot_selection');
      }
      setSelectedSlot(slotStartsAt);
    },
    setTimezone,
    signInHref,
    slotGroups,
    slots,
    submitBooking,
    submitting,
    timezone,
    timezoneOptions,
  };
}
