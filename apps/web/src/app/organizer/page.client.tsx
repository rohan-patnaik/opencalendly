'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { authedGetJson } from '../../lib/api-client';
import {
  organizerApi,
  type AvailabilityOverride,
  type AvailabilityRule,
  type CalendarProviderStatus,
  type OrganizerEventType,
  type OrganizerWebhook,
  type TeamEventType,
  type TeamMember,
  type TeamSummary,
  type WritebackStatus,
} from '../../lib/organizer-api';
import { useAuthSession } from '../../lib/use-auth-session';
import styles from './page.module.css';

type OrganizerConsolePageClientProps = {
  apiBaseUrl: string;
};

type AuthMeResponse = {
  ok: boolean;
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    timezone: string;
  };
};

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toClockTime = (minuteOfDay: number): string => {
  const clamped = Math.max(0, Math.min(1439, minuteOfDay));
  const hour24 = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
};

const toNullableString = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseIntegerOrUndefined = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
};

const parseJsonArray = <T,>(
  raw: string,
  label: string,
  isValidItem: (value: unknown) => value is T,
): T[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array.`);
  }

  for (let index = 0; index < parsed.length; index += 1) {
    if (!isValidItem(parsed[index])) {
      throw new Error(`${label} contains invalid item at index ${index}.`);
    }
  }

  return parsed;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

type AvailabilityRuleInput = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
};

const isAvailabilityRuleInput = (value: unknown): value is AvailabilityRuleInput => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.dayOfWeek === 'number' &&
    typeof value.startMinute === 'number' &&
    typeof value.endMinute === 'number' &&
    typeof value.bufferBeforeMinutes === 'number' &&
    typeof value.bufferAfterMinutes === 'number'
  );
};

type AvailabilityOverrideInput = {
  startAt: string;
  endAt: string;
  isAvailable: boolean;
  reason?: string | null;
};

const isAvailabilityOverrideInput = (value: unknown): value is AvailabilityOverrideInput => {
  if (!isRecord(value)) {
    return false;
  }

  const reason = value.reason;

  return (
    typeof value.startAt === 'string' &&
    typeof value.endAt === 'string' &&
    typeof value.isAvailable === 'boolean' &&
    (typeof reason === 'undefined' || typeof reason === 'string' || reason === null)
  );
};

const formatDateTime = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Invalid date';
  }
  return parsed.toLocaleString();
};

const buildDefaultEventTypeForm = () => ({
  name: '',
  slug: '',
  durationMinutes: '30',
  locationType: 'video' as OrganizerEventType['locationType'],
  locationValue: '',
  isActive: true,
});

export default function OrganizerConsolePageClient({ apiBaseUrl }: OrganizerConsolePageClientProps) {
  const { session, ready, clear } = useAuthSession();

  const [authChecking, setAuthChecking] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authedUser, setAuthedUser] = useState<AuthMeResponse['user'] | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [eventTypes, setEventTypes] = useState<OrganizerEventType[]>([]);
  const [availabilityRules, setAvailabilityRules] = useState<AvailabilityRule[]>([]);
  const [availabilityOverrides, setAvailabilityOverrides] = useState<AvailabilityOverride[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [webhooks, setWebhooks] = useState<OrganizerWebhook[]>([]);
  const [calendarStatuses, setCalendarStatuses] = useState<CalendarProviderStatus[]>([]);
  const [writebackStatus, setWritebackStatus] = useState<WritebackStatus | null>(null);

  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamEventTypes, setTeamEventTypes] = useState<TeamEventType[]>([]);

  const [teamDetailsLoading, setTeamDetailsLoading] = useState(false);
  const [teamDetailsError, setTeamDetailsError] = useState<string | null>(null);

  const [eventTypeCreateForm, setEventTypeCreateForm] = useState(buildDefaultEventTypeForm);
  const [eventTypeUpdateForm, setEventTypeUpdateForm] = useState(buildDefaultEventTypeForm);
  const [eventTypeUpdateId, setEventTypeUpdateId] = useState('');

  const [rulesDraft, setRulesDraft] = useState('[]');
  const [overridesDraft, setOverridesDraft] = useState('[]');

  const [teamCreateForm, setTeamCreateForm] = useState({
    name: '',
    slug: '',
  });

  const [teamMemberForm, setTeamMemberForm] = useState({
    userId: '',
    role: 'member' as 'owner' | 'member',
  });

  const [teamEventTypeForm, setTeamEventTypeForm] = useState({
    name: '',
    slug: '',
    durationMinutes: '30',
    mode: 'round_robin' as 'round_robin' | 'collective',
    locationType: 'video' as 'video' | 'phone' | 'in_person' | 'custom',
    locationValue: '',
    requiredMemberUserIds: '',
  });

  const [webhookForm, setWebhookForm] = useState({
    url: '',
    secret: '',
    bookingCreated: true,
    bookingCanceled: false,
    bookingRescheduled: false,
  });

  const [webhookRunLimit, setWebhookRunLimit] = useState('20');
  const [writebackRunLimit, setWritebackRunLimit] = useState('20');

  const [panelMessage, setPanelMessage] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);

  const [busyActions, setBusyActions] = useState<Set<string>>(new Set());
  const teamDetailsRequestIdRef = useRef(0);

  const beginBusy = useCallback((action: string) => {
    setBusyActions((previous) => {
      const next = new Set(previous);
      next.add(action);
      return next;
    });
  }, []);

  const endBusy = useCallback((action: string) => {
    setBusyActions((previous) => {
      const next = new Set(previous);
      next.delete(action);
      return next;
    });
  }, []);

  const isBusy = useCallback(
    (action: string) => {
      return busyActions.has(action);
    },
    [busyActions],
  );

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [selectedTeamId, teams],
  );

  const refreshOrganizerState = useCallback(async () => {
    if (!session) {
      return;
    }

    setIsRefreshing(true);
    setGlobalError(null);

    try {
      const [eventTypePayload, availabilityPayload, teamPayload, webhookPayload, calendarPayload, writebackPayload] =
        await Promise.all([
          organizerApi.listEventTypes(apiBaseUrl, session),
          organizerApi.getAvailability(apiBaseUrl, session),
          organizerApi.listTeams(apiBaseUrl, session),
          organizerApi.listWebhooks(apiBaseUrl, session),
          organizerApi.getCalendarSyncStatus(apiBaseUrl, session),
          organizerApi.getWritebackStatus(apiBaseUrl, session),
        ]);

      setEventTypes(eventTypePayload.eventTypes);
      setAvailabilityRules(availabilityPayload.rules);
      setAvailabilityOverrides(availabilityPayload.overrides);
      setTeams(teamPayload.teams);
      setWebhooks(webhookPayload.webhooks);
      setCalendarStatuses(calendarPayload.providers);
      setWritebackStatus({
        summary: writebackPayload.summary,
        failures: writebackPayload.failures,
      });

      setRulesDraft(
        JSON.stringify(
          availabilityPayload.rules.map((rule) => ({
            dayOfWeek: rule.dayOfWeek,
            startMinute: rule.startMinute,
            endMinute: rule.endMinute,
            bufferBeforeMinutes: rule.bufferBeforeMinutes,
            bufferAfterMinutes: rule.bufferAfterMinutes,
          })),
          null,
          2,
        ),
      );

      setOverridesDraft(
        JSON.stringify(
          availabilityPayload.overrides.map((override) => ({
            startAt: override.startAt,
            endAt: override.endAt,
            isAvailable: override.isAvailable,
            reason: override.reason,
          })),
          null,
          2,
        ),
      );

      setSelectedTeamId((currentTeamId) => {
        if (teamPayload.teams.length === 0) {
          return '';
        }
        if (currentTeamId && teamPayload.teams.some((team) => team.id === currentTeamId)) {
          return currentTeamId;
        }
        return teamPayload.teams[0]?.id ?? '';
      });

      setPanelError(null);
    } catch (caught) {
      setGlobalError(caught instanceof Error ? caught.message : 'Unable to load organizer console.');
    } finally {
      setIsRefreshing(false);
    }
  }, [apiBaseUrl, session]);

  const refreshTeamDetails = useCallback(
    async (teamId: string) => {
      if (!session || !teamId) {
        return;
      }

      const requestId = teamDetailsRequestIdRef.current + 1;
      teamDetailsRequestIdRef.current = requestId;
      setTeamDetailsLoading(true);
      setTeamDetailsError(null);
      try {
        const [membersPayload, teamEventTypePayload] = await Promise.all([
          organizerApi.listTeamMembers(apiBaseUrl, session, teamId),
          organizerApi.listTeamEventTypes(apiBaseUrl, session, teamId),
        ]);
        if (requestId === teamDetailsRequestIdRef.current) {
          setTeamMembers(membersPayload.members);
          setTeamEventTypes(teamEventTypePayload.eventTypes);
        }
      } catch (caught) {
        if (requestId === teamDetailsRequestIdRef.current) {
          setTeamMembers([]);
          setTeamEventTypes([]);
          setTeamDetailsError(caught instanceof Error ? caught.message : 'Unable to load team details.');
        }
      } finally {
        if (requestId === teamDetailsRequestIdRef.current) {
          setTeamDetailsLoading(false);
        }
      }
    },
    [apiBaseUrl, session, teamDetailsRequestIdRef],
  );

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!session) {
      setAuthedUser(null);
      setAuthChecking(false);
      setAuthError(null);
      setGlobalError(null);
      setEventTypes([]);
      setAvailabilityRules([]);
      setAvailabilityOverrides([]);
      setTeams([]);
      setWebhooks([]);
      setCalendarStatuses([]);
      setWritebackStatus(null);
      setTeamMembers([]);
      setTeamEventTypes([]);
      setSelectedTeamId('');
      return;
    }

    const bootstrap = async () => {
      setAuthChecking(true);
      setAuthError(null);

      try {
        const payload = await authedGetJson<AuthMeResponse>({
          url: `${apiBaseUrl}/v0/auth/me`,
          session,
          fallbackError: 'Unable to restore organizer session.',
        });

        setAuthedUser(payload.user);
      } catch (caught) {
        setAuthedUser(null);
        setAuthError(caught instanceof Error ? caught.message : 'Unable to restore organizer session.');
        clear();
      } finally {
        setAuthChecking(false);
      }
    };

    void bootstrap();
  }, [apiBaseUrl, clear, ready, session]);

  useEffect(() => {
    if (!session || !authedUser) {
      return;
    }
    void refreshOrganizerState();
  }, [authedUser, refreshOrganizerState, session]);

  useEffect(() => {
    if (!eventTypeUpdateId) {
      const first = eventTypes[0];
      if (first) {
        setEventTypeUpdateId(first.id);
        setEventTypeUpdateForm({
          name: first.name,
          slug: first.slug,
          durationMinutes: String(first.durationMinutes),
          locationType: first.locationType,
          locationValue: first.locationValue ?? '',
          isActive: first.isActive,
        });
      }
      return;
    }

    const selectedEventType = eventTypes.find((eventType) => eventType.id === eventTypeUpdateId);
    if (!selectedEventType) {
      const first = eventTypes[0];
      if (!first) {
        return;
      }
      setEventTypeUpdateId(first.id);
      setEventTypeUpdateForm({
        name: first.name,
        slug: first.slug,
        durationMinutes: String(first.durationMinutes),
        locationType: first.locationType,
        locationValue: first.locationValue ?? '',
        isActive: first.isActive,
      });
    }
  }, [eventTypeUpdateId, eventTypes]);

  useEffect(() => {
    if (!selectedTeamId) {
      setTeamMembers([]);
      setTeamEventTypes([]);
      setTeamDetailsError(null);
      return;
    }
    void refreshTeamDetails(selectedTeamId);
  }, [refreshTeamDetails, selectedTeamId]);

  const handleCreateEventType = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!session) {
        return;
      }

      const action = 'eventTypeCreate';
      beginBusy(action);
      setPanelError(null);
      setPanelMessage(null);

      try {
        await organizerApi.createEventType(apiBaseUrl, session, {
          name: eventTypeCreateForm.name.trim(),
          slug: eventTypeCreateForm.slug.trim().toLowerCase(),
          durationMinutes: Number.parseInt(eventTypeCreateForm.durationMinutes, 10),
          locationType: eventTypeCreateForm.locationType,
          locationValue: toNullableString(eventTypeCreateForm.locationValue),
        });

        setEventTypeCreateForm(buildDefaultEventTypeForm());
        setPanelMessage('Event type created.');
        await refreshOrganizerState();
      } catch (caught) {
        setPanelError(caught instanceof Error ? caught.message : 'Unable to create event type.');
      } finally {
        endBusy(action);
      }
    },
    [apiBaseUrl, beginBusy, endBusy, eventTypeCreateForm, refreshOrganizerState, session],
  );

  const handleUpdateEventType = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!session || !eventTypeUpdateId) {
        return;
      }

      const action = 'eventTypeUpdate';
      beginBusy(action);
      setPanelError(null);
      setPanelMessage(null);

      try {
        await organizerApi.updateEventType(apiBaseUrl, session, eventTypeUpdateId, {
          name: eventTypeUpdateForm.name.trim(),
          slug: eventTypeUpdateForm.slug.trim().toLowerCase(),
          durationMinutes: Number.parseInt(eventTypeUpdateForm.durationMinutes, 10),
          locationType: eventTypeUpdateForm.locationType,
          locationValue: toNullableString(eventTypeUpdateForm.locationValue),
          isActive: eventTypeUpdateForm.isActive,
        });

        setPanelMessage('Event type updated.');
        await refreshOrganizerState();
      } catch (caught) {
        setPanelError(caught instanceof Error ? caught.message : 'Unable to update event type.');
      } finally {
        endBusy(action);
      }
    },
    [apiBaseUrl, beginBusy, endBusy, eventTypeUpdateForm, eventTypeUpdateId, refreshOrganizerState, session],
  );

  const handleToggleEventTypeActive = useCallback(
    async (eventTypeId: string, isActive: boolean) => {
      if (!session) {
        return;
      }

      const action = `eventTypeToggle:${eventTypeId}`;
      beginBusy(action);
      setPanelError(null);
      setPanelMessage(null);

      try {
        await organizerApi.updateEventType(apiBaseUrl, session, eventTypeId, {
          isActive: !isActive,
        });
        setPanelMessage('Event type status updated.');
        await refreshOrganizerState();
      } catch (caught) {
        setPanelError(caught instanceof Error ? caught.message : 'Unable to update event type status.');
      } finally {
        endBusy(action);
      }
    },
    [apiBaseUrl, beginBusy, endBusy, refreshOrganizerState, session],
  );

  const handleSaveRules = useCallback(async () => {
    if (!session) {
      return;
    }

    const action = 'rulesSave';
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      const parsedRules = parseJsonArray<AvailabilityRuleInput>(
        rulesDraft,
        'Rules payload',
        isAvailabilityRuleInput,
      );

      await organizerApi.replaceAvailabilityRules(apiBaseUrl, session, parsedRules);
      setPanelMessage('Availability rules updated.');
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to update availability rules.');
    } finally {
      endBusy(action);
    }
  }, [apiBaseUrl, beginBusy, endBusy, refreshOrganizerState, rulesDraft, session]);

  const handleSaveOverrides = useCallback(async () => {
    if (!session) {
      return;
    }

    const action = 'overridesSave';
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      const parsedOverrides = parseJsonArray<AvailabilityOverrideInput>(
        overridesDraft,
        'Overrides payload',
        isAvailabilityOverrideInput,
      );

      await organizerApi.replaceAvailabilityOverrides(apiBaseUrl, session, parsedOverrides);
      setPanelMessage('Availability overrides updated.');
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to update availability overrides.');
    } finally {
      endBusy(action);
    }
  }, [apiBaseUrl, beginBusy, endBusy, overridesDraft, refreshOrganizerState, session]);

  const handleCreateTeam = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!session) {
        return;
      }

      const action = 'teamCreate';
      beginBusy(action);
      setPanelError(null);
      setPanelMessage(null);

      try {
        await organizerApi.createTeam(apiBaseUrl, session, {
          name: teamCreateForm.name.trim(),
          slug: teamCreateForm.slug.trim().toLowerCase(),
        });

        setTeamCreateForm({ name: '', slug: '' });
        setPanelMessage('Team created.');
        await refreshOrganizerState();
      } catch (caught) {
        setPanelError(caught instanceof Error ? caught.message : 'Unable to create team.');
      } finally {
        endBusy(action);
      }
    },
    [apiBaseUrl, beginBusy, endBusy, refreshOrganizerState, session, teamCreateForm],
  );

  const handleAddTeamMember = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!session || !selectedTeamId) {
        return;
      }

      const action = 'teamMemberCreate';
      beginBusy(action);
      setPanelError(null);
      setPanelMessage(null);

      try {
        await organizerApi.addTeamMember(apiBaseUrl, session, selectedTeamId, {
          userId: teamMemberForm.userId.trim(),
          role: teamMemberForm.role,
        });
        setTeamMemberForm({
          userId: '',
          role: 'member',
        });
        setPanelMessage('Team member added.');
        await refreshTeamDetails(selectedTeamId);
        await refreshOrganizerState();
      } catch (caught) {
        setPanelError(caught instanceof Error ? caught.message : 'Unable to add team member.');
      } finally {
        endBusy(action);
      }
    },
    [apiBaseUrl, beginBusy, endBusy, refreshOrganizerState, refreshTeamDetails, selectedTeamId, session, teamMemberForm],
  );

  const handleCreateTeamEventType = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!session || !selectedTeamId) {
        return;
      }

      const action = 'teamEventTypeCreate';
      beginBusy(action);
      setPanelError(null);
      setPanelMessage(null);

      const requiredMemberUserIds = teamEventTypeForm.requiredMemberUserIds
        .split(',')
        .map((userId) => userId.trim())
        .filter(Boolean);

      try {
        await organizerApi.createTeamEventType(apiBaseUrl, session, {
          teamId: selectedTeamId,
          name: teamEventTypeForm.name.trim(),
          slug: teamEventTypeForm.slug.trim().toLowerCase(),
          durationMinutes: Number.parseInt(teamEventTypeForm.durationMinutes, 10),
          mode: teamEventTypeForm.mode,
          locationType: teamEventTypeForm.locationType,
          locationValue: toNullableString(teamEventTypeForm.locationValue),
          ...(requiredMemberUserIds.length > 0 ? { requiredMemberUserIds } : {}),
        });
        setTeamEventTypeForm({
          name: '',
          slug: '',
          durationMinutes: '30',
          mode: 'round_robin',
          locationType: 'video',
          locationValue: '',
          requiredMemberUserIds: '',
        });
        setPanelMessage('Team event type created.');
        await refreshTeamDetails(selectedTeamId);
        await refreshOrganizerState();
      } catch (caught) {
        setPanelError(caught instanceof Error ? caught.message : 'Unable to create team event type.');
      } finally {
        endBusy(action);
      }
    },
    [
      apiBaseUrl,
      beginBusy,
      endBusy,
      refreshOrganizerState,
      refreshTeamDetails,
      selectedTeamId,
      session,
      teamEventTypeForm,
    ],
  );

  const selectedWebhookEvents = useMemo(() => {
    const events: Array<'booking.created' | 'booking.canceled' | 'booking.rescheduled'> = [];
    if (webhookForm.bookingCreated) {
      events.push('booking.created');
    }
    if (webhookForm.bookingCanceled) {
      events.push('booking.canceled');
    }
    if (webhookForm.bookingRescheduled) {
      events.push('booking.rescheduled');
    }
    return events;
  }, [webhookForm.bookingCanceled, webhookForm.bookingCreated, webhookForm.bookingRescheduled]);

  const handleCreateWebhook = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!session) {
        return;
      }

      const action = 'webhookCreate';
      beginBusy(action);
      setPanelError(null);
      setPanelMessage(null);

      try {
        if (selectedWebhookEvents.length === 0) {
          setPanelError('Select at least one webhook event.');
          return;
        }

        await organizerApi.createWebhook(apiBaseUrl, session, {
          url: webhookForm.url.trim(),
          secret: webhookForm.secret,
          events: selectedWebhookEvents,
        });
        setWebhookForm({
          url: '',
          secret: '',
          bookingCreated: true,
          bookingCanceled: false,
          bookingRescheduled: false,
        });
        setPanelMessage('Webhook created.');
        await refreshOrganizerState();
      } catch (caught) {
        setPanelError(caught instanceof Error ? caught.message : 'Unable to create webhook.');
      } finally {
        endBusy(action);
      }
    },
    [apiBaseUrl, beginBusy, endBusy, refreshOrganizerState, selectedWebhookEvents, session, webhookForm],
  );

  const handleToggleWebhookActive = useCallback(
    async (webhookId: string, isActive: boolean) => {
      if (!session) {
        return;
      }

      const action = `webhookToggle:${webhookId}`;
      beginBusy(action);
      setPanelError(null);
      setPanelMessage(null);

      try {
        await organizerApi.updateWebhook(apiBaseUrl, session, webhookId, {
          isActive: !isActive,
        });
        setPanelMessage('Webhook status updated.');
        await refreshOrganizerState();
      } catch (caught) {
        setPanelError(caught instanceof Error ? caught.message : 'Unable to update webhook status.');
      } finally {
        endBusy(action);
      }
    },
    [apiBaseUrl, beginBusy, endBusy, refreshOrganizerState, session],
  );

  const handleRunWebhookDeliveries = useCallback(async () => {
    if (!session) {
      return;
    }

    const action = 'webhookRun';
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      const payload = await organizerApi.runWebhookDeliveries(
        apiBaseUrl,
        session,
        parseIntegerOrUndefined(webhookRunLimit),
      );

      setPanelMessage(
        `Webhook run complete: processed=${payload.processed}, succeeded=${payload.succeeded}, retried=${payload.retried}, failed=${payload.failed}.`,
      );
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to run webhook deliveries.');
    } finally {
      endBusy(action);
    }
  }, [apiBaseUrl, beginBusy, endBusy, refreshOrganizerState, session, webhookRunLimit]);

  const handleStartCalendarConnect = useCallback(
    async (provider: 'google' | 'microsoft') => {
      if (!session) {
        return;
      }

      const action = `calendarConnect:${provider}`;
      beginBusy(action);
      setPanelError(null);
      setPanelMessage(null);

      try {
        const redirectUri = `${window.location.origin}/settings/calendar/${provider}/callback`;
        const payload =
          provider === 'google'
            ? await organizerApi.startGoogleConnect(apiBaseUrl, session, { redirectUri })
            : await organizerApi.startMicrosoftConnect(apiBaseUrl, session, { redirectUri });

        window.location.assign(payload.authUrl);
      } catch (caught) {
        setPanelError(
          caught instanceof Error
            ? caught.message
            : `Unable to start ${provider === 'google' ? 'Google' : 'Microsoft'} connect flow.`,
        );
        endBusy(action);
      }
    },
    [apiBaseUrl, beginBusy, endBusy, session],
  );

  const handleCalendarSync = useCallback(
    async (provider: 'google' | 'microsoft') => {
      if (!session) {
        return;
      }

      const action = `calendarSync:${provider}`;
      beginBusy(action);
      setPanelError(null);
      setPanelMessage(null);

      try {
        const result =
          provider === 'google'
            ? await organizerApi.syncGoogle(apiBaseUrl, session)
            : await organizerApi.syncMicrosoft(apiBaseUrl, session);

        setPanelMessage(
          `${provider === 'google' ? 'Google' : 'Microsoft'} sync complete: ${result.busyWindowCount} busy windows refreshed.`,
        );
        await refreshOrganizerState();
      } catch (caught) {
        setPanelError(
          caught instanceof Error ? caught.message : `Unable to sync ${provider === 'google' ? 'Google' : 'Microsoft'} calendar.`,
        );
      } finally {
        endBusy(action);
      }
    },
    [apiBaseUrl, beginBusy, endBusy, refreshOrganizerState, session],
  );

  const handleCalendarDisconnect = useCallback(
    async (provider: 'google' | 'microsoft') => {
      if (!session) {
        return;
      }

      const action = `calendarDisconnect:${provider}`;
      beginBusy(action);
      setPanelError(null);
      setPanelMessage(null);

      try {
        if (provider === 'google') {
          await organizerApi.disconnectGoogle(apiBaseUrl, session);
        } else {
          await organizerApi.disconnectMicrosoft(apiBaseUrl, session);
        }
        setPanelMessage(`${provider === 'google' ? 'Google' : 'Microsoft'} calendar disconnected.`);
        await refreshOrganizerState();
      } catch (caught) {
        setPanelError(
          caught instanceof Error
            ? caught.message
            : `Unable to disconnect ${provider === 'google' ? 'Google' : 'Microsoft'} calendar.`,
        );
      } finally {
        endBusy(action);
      }
    },
    [apiBaseUrl, beginBusy, endBusy, refreshOrganizerState, session],
  );

  const handleRunWritebackQueue = useCallback(async () => {
    if (!session) {
      return;
    }

    const action = 'writebackRun';
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      const payload = await organizerApi.runWritebackQueue(
        apiBaseUrl,
        session,
        parseIntegerOrUndefined(writebackRunLimit),
      );
      setPanelMessage(
        `Writeback run complete: processed=${payload.processed}, succeeded=${payload.succeeded}, retried=${payload.retried}, failed=${payload.failed}.`,
      );
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to run writeback queue.');
    } finally {
      endBusy(action);
    }
  }, [apiBaseUrl, beginBusy, endBusy, refreshOrganizerState, session, writebackRunLimit]);

  if (!ready || authChecking) {
    return (
      <main className={styles.page}>
        <section className={styles.heroCard}>
          <p className={styles.kicker}>Feature 12</p>
          <h1>Organizer Console</h1>
          <p>Restoring your session…</p>
        </section>
      </main>
    );
  }

  if (!session || !authedUser) {
    return (
      <main className={styles.page}>
        <section className={styles.heroCard}>
          <p className={styles.kicker}>Authentication required</p>
          <h1>Organizer Console</h1>
          <p>Sign in with magic-link auth to manage event types, teams, webhooks, and calendars.</p>
          {authError ? <p className={styles.error}>{authError}</p> : null}
          <div className={styles.rowActions}>
            <Link className={styles.primaryButton} href="/auth/sign-in">
              Sign in
            </Link>
            <Link className={styles.secondaryButton} href="/demo/intro-call">
              Booking demo
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.heroCard}>
        <p className={styles.kicker}>Feature 12</p>
        <h1>Organizer Console (v1)</h1>
        <p>
          Manage all shipped organizer APIs from UI: event types, availability, teams, webhooks, calendar
          sync, and writeback queue controls.
        </p>
        <div className={styles.metaStrip}>
          <span>
            Signed in as <strong>{authedUser.email}</strong>
          </span>
          <span>Timezone: {authedUser.timezone}</span>
          <button type="button" className={styles.linkButton} onClick={clear}>
            Sign out
          </button>
        </div>

        <div className={styles.rowActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void refreshOrganizerState()}
            disabled={isRefreshing || busyActions.size > 0}
          >
            {isRefreshing ? 'Refreshing…' : 'Refresh console data'}
          </button>
          <Link className={styles.secondaryButton} href="/dashboard">
            Open analytics dashboard
          </Link>
        </div>

        {globalError ? <p className={styles.error}>{globalError}</p> : null}
        {panelError ? <p className={styles.error}>{panelError}</p> : null}
        {panelMessage ? <p className={styles.success}>{panelMessage}</p> : null}
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHeader}>
          <h2>Event types</h2>
          <p>Create, list, and edit one-on-one event types.</p>
        </div>

        {eventTypes.length === 0 ? (
          <p className={styles.empty}>No event types found yet.</p>
        ) : (
          <div className={styles.listGrid}>
            {eventTypes.map((eventType) => (
              <article key={eventType.id} className={styles.itemCard}>
                <div className={styles.itemHead}>
                  <strong>{eventType.name}</strong>
                  <span className={styles.badge}>{eventType.slug}</span>
                </div>
                <p>
                  {eventType.durationMinutes} min · {eventType.locationType}
                </p>
                <p>Status: {eventType.isActive ? 'Active' : 'Inactive'}</p>
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={() => void handleToggleEventTypeActive(eventType.id, eventType.isActive)}
                  disabled={isBusy(`eventTypeToggle:${eventType.id}`)}
                >
                  {isBusy(`eventTypeToggle:${eventType.id}`)
                    ? 'Saving…'
                    : eventType.isActive
                      ? 'Deactivate'
                      : 'Activate'}
                </button>
              </article>
            ))}
          </div>
        )}

        <div className={styles.splitGrid}>
          <form className={styles.form} onSubmit={handleCreateEventType}>
            <h3>Create event type</h3>
            <label className={styles.label}>
              Name
              <input
                className={styles.input}
                value={eventTypeCreateForm.name}
                onChange={(event) => setEventTypeCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </label>
            <label className={styles.label}>
              Slug
              <input
                className={styles.input}
                value={eventTypeCreateForm.slug}
                onChange={(event) => setEventTypeCreateForm((prev) => ({ ...prev, slug: event.target.value }))}
                placeholder="intro-call"
                required
              />
            </label>
            <label className={styles.label}>
              Duration (minutes)
              <input
                className={styles.input}
                type="number"
                min={5}
                max={240}
                value={eventTypeCreateForm.durationMinutes}
                onChange={(event) =>
                  setEventTypeCreateForm((prev) => ({ ...prev, durationMinutes: event.target.value }))
                }
                required
              />
            </label>
            <label className={styles.label}>
              Location type
              <select
                className={styles.select}
                value={eventTypeCreateForm.locationType}
                onChange={(event) =>
                  setEventTypeCreateForm((prev) => ({
                    ...prev,
                    locationType: event.target.value as OrganizerEventType['locationType'],
                  }))
                }
              >
                <option value="video">video</option>
                <option value="phone">phone</option>
                <option value="in_person">in_person</option>
                <option value="custom">custom</option>
              </select>
            </label>
            <label className={styles.label}>
              Location value (optional)
              <input
                className={styles.input}
                value={eventTypeCreateForm.locationValue}
                onChange={(event) =>
                  setEventTypeCreateForm((prev) => ({ ...prev, locationValue: event.target.value }))
                }
                placeholder="https://meet.example.com/room"
              />
            </label>
            <button type="submit" className={styles.primaryButton} disabled={isBusy('eventTypeCreate')}>
              {isBusy('eventTypeCreate') ? 'Creating…' : 'Create event type'}
            </button>
          </form>

          <form className={styles.form} onSubmit={handleUpdateEventType}>
            <h3>Edit event type</h3>
            <label className={styles.label}>
              Event type
              <select
                className={styles.select}
                value={eventTypeUpdateId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setEventTypeUpdateId(nextId);
                  const selected = eventTypes.find((eventType) => eventType.id === nextId);
                  if (selected) {
                    setEventTypeUpdateForm({
                      name: selected.name,
                      slug: selected.slug,
                      durationMinutes: String(selected.durationMinutes),
                      locationType: selected.locationType,
                      locationValue: selected.locationValue ?? '',
                      isActive: selected.isActive,
                    });
                  }
                }}
                required
              >
                {eventTypes.map((eventType) => (
                  <option key={eventType.id} value={eventType.id}>
                    {eventType.name} ({eventType.slug})
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.label}>
              Name
              <input
                className={styles.input}
                value={eventTypeUpdateForm.name}
                onChange={(event) => setEventTypeUpdateForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </label>
            <label className={styles.label}>
              Slug
              <input
                className={styles.input}
                value={eventTypeUpdateForm.slug}
                onChange={(event) => setEventTypeUpdateForm((prev) => ({ ...prev, slug: event.target.value }))}
                required
              />
            </label>
            <label className={styles.label}>
              Duration (minutes)
              <input
                className={styles.input}
                type="number"
                min={5}
                max={240}
                value={eventTypeUpdateForm.durationMinutes}
                onChange={(event) =>
                  setEventTypeUpdateForm((prev) => ({ ...prev, durationMinutes: event.target.value }))
                }
                required
              />
            </label>
            <label className={styles.label}>
              Location type
              <select
                className={styles.select}
                value={eventTypeUpdateForm.locationType}
                onChange={(event) =>
                  setEventTypeUpdateForm((prev) => ({
                    ...prev,
                    locationType: event.target.value as OrganizerEventType['locationType'],
                  }))
                }
              >
                <option value="video">video</option>
                <option value="phone">phone</option>
                <option value="in_person">in_person</option>
                <option value="custom">custom</option>
              </select>
            </label>
            <label className={styles.label}>
              Location value (optional)
              <input
                className={styles.input}
                value={eventTypeUpdateForm.locationValue}
                onChange={(event) =>
                  setEventTypeUpdateForm((prev) => ({ ...prev, locationValue: event.target.value }))
                }
              />
            </label>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={eventTypeUpdateForm.isActive}
                onChange={(event) =>
                  setEventTypeUpdateForm((prev) => ({ ...prev, isActive: event.target.checked }))
                }
              />
              Active
            </label>
            <button type="submit" className={styles.primaryButton} disabled={isBusy('eventTypeUpdate')}>
              {isBusy('eventTypeUpdate') ? 'Saving…' : 'Save event type'}
            </button>
          </form>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHeader}>
          <h2>Availability rules + overrides</h2>
          <p>Read and replace organizer availability definitions used by slot computation.</p>
        </div>

        <div className={styles.splitGrid}>
          <div className={styles.form}>
            <h3>Current rules</h3>
            {availabilityRules.length === 0 ? (
              <p className={styles.empty}>No recurring rules configured.</p>
            ) : (
              <ul>
                {availabilityRules.map((rule) => (
                  <li key={rule.id}>
                    {dayLabels[rule.dayOfWeek] ?? `Day ${rule.dayOfWeek}`}: {toClockTime(rule.startMinute)} -{' '}
                    {toClockTime(rule.endMinute)} (buffers: {rule.bufferBeforeMinutes}m /{' '}
                    {rule.bufferAfterMinutes}m)
                  </li>
                ))}
              </ul>
            )}

            <label className={styles.label}>
              Rules JSON
              <textarea
                className={styles.textarea}
                value={rulesDraft}
                onChange={(event) => setRulesDraft(event.target.value)}
                spellCheck={false}
              />
            </label>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleSaveRules()}
              disabled={isBusy('rulesSave')}
            >
              {isBusy('rulesSave') ? 'Saving…' : 'Save rules'}
            </button>
          </div>

          <div className={styles.form}>
            <h3>Current overrides</h3>
            {availabilityOverrides.length === 0 ? (
              <p className={styles.empty}>No date overrides configured.</p>
            ) : (
              <ul>
                {availabilityOverrides.map((override) => (
                  <li key={override.id}>
                    {override.isAvailable ? 'Available' : 'Unavailable'}: {formatDateTime(override.startAt)} -{' '}
                    {formatDateTime(override.endAt)}
                    {override.reason ? ` (${override.reason})` : ''}
                  </li>
                ))}
              </ul>
            )}

            <label className={styles.label}>
              Overrides JSON
              <textarea
                className={styles.textarea}
                value={overridesDraft}
                onChange={(event) => setOverridesDraft(event.target.value)}
                spellCheck={false}
              />
            </label>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleSaveOverrides()}
              disabled={isBusy('overridesSave')}
            >
              {isBusy('overridesSave') ? 'Saving…' : 'Save overrides'}
            </button>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHeader}>
          <h2>Teams + members + team event types</h2>
          <p>Create teams, add members, and configure round-robin / collective event types.</p>
        </div>

        <div className={styles.splitGrid}>
          <form className={styles.form} onSubmit={handleCreateTeam}>
            <h3>Create team</h3>
            <label className={styles.label}>
              Team name
              <input
                className={styles.input}
                value={teamCreateForm.name}
                onChange={(event) => setTeamCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </label>
            <label className={styles.label}>
              Team slug
              <input
                className={styles.input}
                value={teamCreateForm.slug}
                onChange={(event) => setTeamCreateForm((prev) => ({ ...prev, slug: event.target.value }))}
                required
              />
            </label>
            <button type="submit" className={styles.primaryButton} disabled={isBusy('teamCreate')}>
              {isBusy('teamCreate') ? 'Creating…' : 'Create team'}
            </button>
          </form>

          <div className={styles.form}>
            <h3>Select team</h3>
            {teams.length === 0 ? (
              <p className={styles.empty}>No teams created yet.</p>
            ) : (
              <>
                <label className={styles.label}>
                  Team
                  <select
                    className={styles.select}
                    value={selectedTeamId}
                    onChange={(event) => setSelectedTeamId(event.target.value)}
                  >
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name} ({team.slug})
                      </option>
                    ))}
                  </select>
                </label>
                <ul>
                  {teams.map((team) => (
                    <li key={team.id}>
                      {team.name} - members: {team.memberCount}, team event types: {team.teamEventTypeCount}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        {selectedTeam ? (
          <div className={styles.teamPanel}>
            <h3>Team details: {selectedTeam.name}</h3>
            {teamDetailsLoading ? <p>Loading team members and event types…</p> : null}
            {teamDetailsError ? <p className={styles.error}>{teamDetailsError}</p> : null}

            <div className={styles.splitGrid}>
              <form className={styles.form} onSubmit={handleAddTeamMember}>
                <h4>Add member</h4>
                <p className={styles.helperText}>
                  Enter a user UUID. Seed users are created by `npm run db:seed`.
                </p>
                <label className={styles.label}>
                  User ID (UUID)
                  <input
                    className={styles.input}
                    value={teamMemberForm.userId}
                    onChange={(event) =>
                      setTeamMemberForm((prev) => ({ ...prev, userId: event.target.value }))
                    }
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    required
                  />
                </label>
                <label className={styles.label}>
                  Role
                  <select
                    className={styles.select}
                    value={teamMemberForm.role}
                    onChange={(event) =>
                      setTeamMemberForm((prev) => ({
                        ...prev,
                        role: event.target.value as 'owner' | 'member',
                      }))
                    }
                  >
                    <option value="member">member</option>
                    <option value="owner">owner</option>
                  </select>
                </label>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={isBusy('teamMemberCreate')}
                >
                  {isBusy('teamMemberCreate') ? 'Adding…' : 'Add member'}
                </button>

                {teamMembers.length === 0 ? (
                  <p className={styles.empty}>No members found.</p>
                ) : (
                  <ul>
                    {teamMembers.map((member) => (
                      <li key={member.id}>
                        {member.user.displayName} ({member.user.email}) - {member.role}
                        <br />
                        <span className={styles.helperText}>{member.userId}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </form>

              <form className={styles.form} onSubmit={handleCreateTeamEventType}>
                <h4>Create team event type</h4>
                <label className={styles.label}>
                  Name
                  <input
                    className={styles.input}
                    value={teamEventTypeForm.name}
                    onChange={(event) =>
                      setTeamEventTypeForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className={styles.label}>
                  Slug
                  <input
                    className={styles.input}
                    value={teamEventTypeForm.slug}
                    onChange={(event) =>
                      setTeamEventTypeForm((prev) => ({ ...prev, slug: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className={styles.label}>
                  Duration (minutes)
                  <input
                    className={styles.input}
                    type="number"
                    min={5}
                    max={240}
                    value={teamEventTypeForm.durationMinutes}
                    onChange={(event) =>
                      setTeamEventTypeForm((prev) => ({ ...prev, durationMinutes: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className={styles.label}>
                  Mode
                  <select
                    className={styles.select}
                    value={teamEventTypeForm.mode}
                    onChange={(event) =>
                      setTeamEventTypeForm((prev) => ({
                        ...prev,
                        mode: event.target.value as 'round_robin' | 'collective',
                      }))
                    }
                  >
                    <option value="round_robin">round_robin</option>
                    <option value="collective">collective</option>
                  </select>
                </label>
                <label className={styles.label}>
                  Location type
                  <select
                    className={styles.select}
                    value={teamEventTypeForm.locationType}
                    onChange={(event) =>
                      setTeamEventTypeForm((prev) => ({
                        ...prev,
                        locationType: event.target.value as 'video' | 'phone' | 'in_person' | 'custom',
                      }))
                    }
                  >
                    <option value="video">video</option>
                    <option value="phone">phone</option>
                    <option value="in_person">in_person</option>
                    <option value="custom">custom</option>
                  </select>
                </label>
                <label className={styles.label}>
                  Location value (optional)
                  <input
                    className={styles.input}
                    value={teamEventTypeForm.locationValue}
                    onChange={(event) =>
                      setTeamEventTypeForm((prev) => ({ ...prev, locationValue: event.target.value }))
                    }
                  />
                </label>
                <label className={styles.label}>
                  Required member IDs (comma-separated, optional)
                  <input
                    className={styles.input}
                    value={teamEventTypeForm.requiredMemberUserIds}
                    onChange={(event) =>
                      setTeamEventTypeForm((prev) => ({
                        ...prev,
                        requiredMemberUserIds: event.target.value,
                      }))
                    }
                    placeholder="uuid-1, uuid-2"
                  />
                </label>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={isBusy('teamEventTypeCreate')}
                >
                  {isBusy('teamEventTypeCreate') ? 'Creating…' : 'Create team event type'}
                </button>

                {teamEventTypes.length === 0 ? (
                  <p className={styles.empty}>No team event types configured.</p>
                ) : (
                  <div className={styles.listGrid}>
                    {teamEventTypes.map((item) => (
                      <article key={item.id} className={styles.itemCard}>
                        <div className={styles.itemHead}>
                          <strong>{item.eventType.name}</strong>
                          <span className={styles.badge}>{item.mode}</span>
                        </div>
                        <p>
                          {item.eventType.slug} · {item.eventType.durationMinutes} min
                        </p>
                        <p>Required members: {item.requiredMemberUserIds.length}</p>
                      </article>
                    ))}
                  </div>
                )}
              </form>
            </div>
          </div>
        ) : null}
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHeader}>
          <h2>Webhooks + delivery runner</h2>
          <p>Create/list/update subscriptions and trigger delivery processing.</p>
        </div>

        <div className={styles.splitGrid}>
          <form className={styles.form} onSubmit={handleCreateWebhook}>
            <h3>Create webhook</h3>
            <label className={styles.label}>
              URL
              <input
                className={styles.input}
                type="url"
                value={webhookForm.url}
                onChange={(event) => setWebhookForm((prev) => ({ ...prev, url: event.target.value }))}
                placeholder="https://example.com/webhooks/opencalendly"
                required
              />
            </label>
            <label className={styles.label}>
              Secret
              <input
                className={styles.input}
                type="password"
                autoComplete="new-password"
                value={webhookForm.secret}
                onChange={(event) => setWebhookForm((prev) => ({ ...prev, secret: event.target.value }))}
                minLength={8}
                required
              />
            </label>
            <fieldset className={styles.checkboxGroup}>
              <legend>Events</legend>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={webhookForm.bookingCreated}
                  onChange={(event) =>
                    setWebhookForm((prev) => ({ ...prev, bookingCreated: event.target.checked }))
                  }
                />
                booking.created
              </label>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={webhookForm.bookingCanceled}
                  onChange={(event) =>
                    setWebhookForm((prev) => ({ ...prev, bookingCanceled: event.target.checked }))
                  }
                />
                booking.canceled
              </label>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={webhookForm.bookingRescheduled}
                  onChange={(event) =>
                    setWebhookForm((prev) => ({ ...prev, bookingRescheduled: event.target.checked }))
                  }
                />
                booking.rescheduled
              </label>
            </fieldset>

            <button type="submit" className={styles.primaryButton} disabled={isBusy('webhookCreate')}>
              {isBusy('webhookCreate') ? 'Creating…' : 'Create webhook'}
            </button>

            <div className={styles.inlineActions}>
              <label className={styles.labelCompact}>
                Run limit
                <input
                  className={styles.input}
                  value={webhookRunLimit}
                  onChange={(event) => setWebhookRunLimit(event.target.value)}
                  inputMode="numeric"
                />
              </label>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void handleRunWebhookDeliveries()}
                disabled={isBusy('webhookRun')}
              >
                {isBusy('webhookRun') ? 'Running…' : 'Run delivery worker'}
              </button>
            </div>
          </form>

          <div className={styles.form}>
            <h3>Webhook subscriptions</h3>
            {webhooks.length === 0 ? (
              <p className={styles.empty}>No webhook subscriptions configured.</p>
            ) : (
              <div className={styles.listGrid}>
                {webhooks.map((webhook) => (
                  <article key={webhook.id} className={styles.itemCard}>
                    <div className={styles.itemHead}>
                      <strong>{webhook.url}</strong>
                      <span className={styles.badge}>{webhook.isActive ? 'active' : 'inactive'}</span>
                    </div>
                    <p>Events: {webhook.events.join(', ')}</p>
                    <button
                      type="button"
                      className={styles.ghostButton}
                      onClick={() => void handleToggleWebhookActive(webhook.id, webhook.isActive)}
                      disabled={isBusy(`webhookToggle:${webhook.id}`)}
                    >
                      {isBusy(`webhookToggle:${webhook.id}`)
                        ? 'Saving…'
                        : webhook.isActive
                          ? 'Disable'
                          : 'Enable'}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHeader}>
          <h2>Calendar integrations (Google + Microsoft)</h2>
          <p>Connect, sync, and disconnect provider calendars using the existing API contracts.</p>
        </div>

        {calendarStatuses.length === 0 ? (
          <p className={styles.empty}>No provider statuses available.</p>
        ) : (
          <div className={styles.listGrid}>
            {calendarStatuses.map((status) => (
              <article key={status.provider} className={styles.itemCard}>
                <div className={styles.itemHead}>
                  <strong>{status.provider === 'google' ? 'Google Calendar' : 'Microsoft Calendar'}</strong>
                  <span className={styles.badge}>{status.connected ? 'connected' : 'not connected'}</span>
                </div>
                <p>Email: {status.externalEmail ?? 'n/a'}</p>
                <p>
                  Last sync:{' '}
                  {status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : 'never'}
                </p>
                <p>
                  Next sync:{' '}
                  {status.nextSyncAt ? new Date(status.nextSyncAt).toLocaleString() : 'not scheduled'}
                </p>
                {status.lastError ? <p className={styles.error}>{status.lastError}</p> : null}

                <div className={styles.inlineActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void handleStartCalendarConnect(status.provider)}
                    disabled={isBusy(`calendarConnect:${status.provider}`)}
                  >
                    {isBusy(`calendarConnect:${status.provider}`) ? 'Starting…' : 'Connect'}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void handleCalendarSync(status.provider)}
                    disabled={isBusy(`calendarSync:${status.provider}`)}
                  >
                    {isBusy(`calendarSync:${status.provider}`) ? 'Syncing…' : 'Sync now'}
                  </button>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => void handleCalendarDisconnect(status.provider)}
                    disabled={isBusy(`calendarDisconnect:${status.provider}`)}
                  >
                    {isBusy(`calendarDisconnect:${status.provider}`) ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHeader}>
          <h2>Calendar writeback queue</h2>
          <p>Inspect pending/failed writebacks and trigger retry processing.</p>
        </div>

        {writebackStatus ? (
          <div className={styles.statGrid}>
            <div>
              <strong>{writebackStatus.summary.pending}</strong>
              <span>Pending</span>
            </div>
            <div>
              <strong>{writebackStatus.summary.succeeded}</strong>
              <span>Succeeded</span>
            </div>
            <div>
              <strong>{writebackStatus.summary.failed}</strong>
              <span>Failed</span>
            </div>
          </div>
        ) : (
          <p className={styles.empty}>Writeback status not loaded yet.</p>
        )}

        <div className={styles.inlineActions}>
          <label className={styles.labelCompact}>
            Run limit
            <input
              className={styles.input}
              value={writebackRunLimit}
              onChange={(event) => setWritebackRunLimit(event.target.value)}
              inputMode="numeric"
            />
          </label>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void handleRunWritebackQueue()}
            disabled={isBusy('writebackRun')}
          >
            {isBusy('writebackRun') ? 'Running…' : 'Run writeback queue'}
          </button>
        </div>

        {writebackStatus && writebackStatus.failures.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Operation</th>
                  <th>Attempt</th>
                  <th>Next attempt</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {writebackStatus.failures.map((failure) => (
                  <tr key={failure.id}>
                    <td>{failure.provider}</td>
                    <td>{failure.operation}</td>
                    <td>
                      {failure.attemptCount}/{failure.maxAttempts}
                    </td>
                    <td>{new Date(failure.nextAttemptAt).toLocaleString()}</td>
                    <td>{failure.lastError ?? 'n/a'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.empty}>No failed writeback rows.</p>
        )}
      </section>
    </main>
  );
}
