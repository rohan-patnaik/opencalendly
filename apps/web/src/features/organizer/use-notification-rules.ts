'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AuthSession } from '../../lib/auth-session';
import { organizerApi, type NotificationRule, type OrganizerEventType } from '../../lib/organizer-api';

type UseNotificationRulesInput = {
  apiBaseUrl: string;
  session: AuthSession | null;
  eventTypes: OrganizerEventType[];
};

export const useNotificationRules = ({
  apiBaseUrl,
  session,
  eventTypes,
}: UseNotificationRulesInput) => {
  const [notificationRulesEventTypeId, setNotificationRulesEventTypeId] = useState('');
  const [notificationRules, setNotificationRules] = useState<NotificationRule[]>([]);
  const [notificationRulesLoading, setNotificationRulesLoading] = useState(false);
  const [notificationRulesError, setNotificationRulesError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!notificationRulesEventTypeId) {
      const first = eventTypes[0];
      if (first) {
        setNotificationRulesEventTypeId(first.id);
      }
      return;
    }

    const selectedEventType = eventTypes.find((eventType) => eventType.id === notificationRulesEventTypeId);
    if (!selectedEventType) {
      setNotificationRulesEventTypeId(eventTypes[0]?.id ?? '');
    }
  }, [eventTypes, notificationRulesEventTypeId]);

  const refreshNotificationRules = useCallback(
    async (eventTypeId: string) => {
      if (!session || !eventTypeId) {
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setNotificationRulesLoading(true);
      setNotificationRulesError(null);

      try {
        const payload = await organizerApi.getNotificationRules(apiBaseUrl, session, eventTypeId);
        if (requestId === requestIdRef.current) {
          setNotificationRules(payload.rules);
        }
      } catch (caught) {
        if (requestId === requestIdRef.current) {
          setNotificationRules([]);
          setNotificationRulesError(
            caught instanceof Error ? caught.message : 'Unable to load notification rules.',
          );
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setNotificationRulesLoading(false);
        }
      }
    },
    [apiBaseUrl, session],
  );

  useEffect(() => {
    if (!notificationRulesEventTypeId || !session) {
      requestIdRef.current += 1;
      setNotificationRules([]);
      setNotificationRulesError(null);
      setNotificationRulesLoading(false);
      return;
    }
    void refreshNotificationRules(notificationRulesEventTypeId);
  }, [notificationRulesEventTypeId, refreshNotificationRules, session]);

  const selectedEventType = useMemo(() => {
    return eventTypes.find((eventType) => eventType.id === notificationRulesEventTypeId) ?? null;
  }, [eventTypes, notificationRulesEventTypeId]);

  return {
    notificationRulesEventTypeId,
    setNotificationRulesEventTypeId,
    notificationRules,
    notificationRulesLoading,
    notificationRulesError,
    selectedEventType,
    refreshNotificationRules,
    setNotificationRules,
  };
};
