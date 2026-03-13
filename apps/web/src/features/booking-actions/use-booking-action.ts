'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import {
  COMMON_TIMEZONES,
  createIdempotencyKey,
  formatSlot,
  getBrowserTimezone,
  groupSlotsByDay,
} from '../../lib/public-booking';
import type { AuthSession } from '../../lib/auth-session';
import type { DemoFeatureCostKey } from '../../lib/demo-quota';
import {
  fetchBookingAction,
  fetchBookingActionAvailability,
  getErrorMessage,
  postBookingCancel,
  postBookingReschedule,
} from './api';
import type { ActionStatus, BookingActionLookupResponse } from './types';
import {
  buildActionStatusLabel,
  buildBookingPageHref,
  buildQuotaFeatureKeys,
  isLaunchDemoActionPayload,
  statusLabel,
} from './utils';

type UseBookingActionInput = {
  apiBaseUrl: string;
  token: string;
  ready: boolean;
  session: AuthSession | null;
  refreshDemoQuota: () => Promise<unknown> | void;
};

export const useBookingAction = ({
  apiBaseUrl,
  token,
  ready,
  session,
  refreshDemoQuota,
}: UseBookingActionInput) => {
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
  const [requiresDemoAuth, setRequiresDemoAuth] = useState(false);
  const [isLaunchDemoAction, setIsLaunchDemoAction] = useState(false);

  const signInHref = useMemo(() => {
    return `/auth/sign-in?redirect_url=${encodeURIComponent(
      `/bookings/actions/${encodeURIComponent(token)}`,
    )}`;
  }, [token]);

  const quotaFeatureKeys = useMemo<DemoFeatureCostKey[]>(() => buildQuotaFeatureKeys(actionData), [actionData]);

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

  const bookingPageHref = useMemo(() => buildBookingPageHref(actionData), [actionData]);

  const actionStatusLabel = useMemo(() => buildActionStatusLabel(actionStatus), [actionStatus]);

  const loadAction = useCallback(async () => {
    if (requiresDemoAuth && !session) {
      setLoadingAction(false);
      return;
    }

    setLoadingAction(true);
    setError(null);
    setSuccess(null);

    try {
      const { response, payload } = await fetchBookingAction({
        apiBaseUrl,
        token,
        session,
      });

      if (!response.ok || !payload || !('ok' in payload) || payload.ok !== true) {
        const errorMessage = getErrorMessage(payload, 'Unable to load booking action.');
        if (response.status === 410) {
          setActionStatus('expired');
        } else if (response.status === 404) {
          setActionStatus('invalid');
        } else {
          setActionStatus('active');
        }
        if (response.status === 401) {
          setRequiresDemoAuth(true);
        }
        setActionData(null);
        setError(errorMessage);
        return;
      }

      setRequiresDemoAuth(false);
      setIsLaunchDemoAction(isLaunchDemoActionPayload(payload));
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
  }, [apiBaseUrl, requiresDemoAuth, session, token]);

  const loadAvailability = useCallback(async () => {
    if (!actionData || !actionData.actions.canReschedule) {
      return;
    }

    setLoadingAvailability(true);
    setError(null);

    try {
      const { response, payload } = await fetchBookingActionAvailability({
        apiBaseUrl,
        session,
        timezone,
        actionData,
      });

      if (!response.ok || !payload || !('ok' in payload) || payload.ok !== true) {
        if (response.status === 401) {
          setRequiresDemoAuth(true);
        }
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
  }, [actionData, apiBaseUrl, session, timezone]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    void loadAction();
  }, [loadAction, ready, session]);

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

  const submitCancel = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!actionData || !actionData.actions.canCancel) {
        return;
      }

      setSubmittingCancel(true);
      setError(null);
      setSuccess(null);

      try {
        const { response, payload } = await postBookingCancel({
          apiBaseUrl,
          token,
          session,
          cancelReason,
        });

        if (!response.ok || !payload || !('ok' in payload) || payload.ok !== true) {
          const message = getErrorMessage(payload, 'Unable to cancel booking.');
          if (response.status === 410) {
            setActionStatus('expired');
            setActionData(null);
          } else if (response.status === 404) {
            setActionStatus('invalid');
            setActionData(null);
          } else if (response.status === 401) {
            setRequiresDemoAuth(true);
          } else if (response.status === 429) {
            void refreshDemoQuota();
          }
          setError(message);
          return;
        }

        setSuccess('Booking canceled successfully.');
        setSlots([]);
        setSelectedSlot('');
        setCancelReason('');
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
        if (requiresDemoAuth || isLaunchDemoAction) {
          void refreshDemoQuota();
        }
      } catch {
        setError('Unable to cancel booking.');
      } finally {
        setSubmittingCancel(false);
      }
    },
    [actionData, apiBaseUrl, cancelReason, isLaunchDemoAction, refreshDemoQuota, requiresDemoAuth, session, token],
  );

  const submitReschedule = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
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

        const { response, payload } = await postBookingReschedule({
          apiBaseUrl,
          token,
          session,
          selectedSlot,
          timezone,
          idempotencyKey: requestIdempotencyKey,
        });

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
          } else if (response.status === 401) {
            setRequiresDemoAuth(true);
          } else if (response.status === 429) {
            void refreshDemoQuota();
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
        if (requiresDemoAuth || isLaunchDemoAction) {
          void refreshDemoQuota();
        }
      } catch {
        setError('Unable to reschedule booking.');
      } finally {
        setSubmittingReschedule(false);
      }
    },
    [
      actionData,
      apiBaseUrl,
      isLaunchDemoAction,
      loadAvailability,
      refreshDemoQuota,
      requiresDemoAuth,
      rescheduleRequestKey,
      selectedSlot,
      session,
      timezone,
      token,
    ],
  );

  return {
    actionStatus, actionStatusLabel, actionData, timezone, setTimezone, slots, selectedSlot,
    setSelectedSlot, loadingAction, loadingAvailability, submittingCancel, submittingReschedule,
    error, success, cancelReason, setCancelReason, requiresDemoAuth, isLaunchDemoAction,
    signInHref, quotaFeatureKeys, timezoneOptions, slotGroups, selectedSlotLabel, bookingPageHref,
    submitCancel, submitReschedule, statusLabel,
  };
};
