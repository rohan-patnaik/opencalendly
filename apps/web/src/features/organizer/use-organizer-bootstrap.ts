'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AuthSession } from '../../lib/auth-session';
import { organizerApi } from '../../lib/organizer-api';
import type { OrganizerConsoleUser, OrganizerSectionsState } from './types';

type UseOrganizerBootstrapInput = {
  apiBaseUrl: string;
  session: AuthSession | null;
  authedUser: OrganizerConsoleUser | null;
  refreshDemoQuota: () => Promise<unknown> | void;
};

const emptyState: OrganizerSectionsState = {
  eventTypes: [],
  availabilityRules: [],
  availabilityOverrides: [],
  timeOffBlocks: [],
  teams: [],
  webhooks: [],
  calendarStatuses: [],
  writebackStatus: null,
};

export const useOrganizerBootstrap = ({
  apiBaseUrl,
  session,
  authedUser,
  refreshDemoQuota,
}: UseOrganizerBootstrapInput) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasResolvedInitialLoad, setHasResolvedInitialLoad] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [state, setState] = useState<OrganizerSectionsState>(emptyState);
  const [selectedTeamId, setSelectedTeamId] = useState('');

  const refreshOrganizerState = useCallback(async () => {
    if (!session) {
      return;
    }

    setIsRefreshing(true);
    setGlobalError(null);

    try {
      const refreshDemoQuotaPromise = refreshDemoQuota();
      const [
        eventTypePayload,
        availabilityPayload,
        timeOffPayload,
        teamPayload,
        webhookPayload,
        calendarPayload,
        writebackPayload,
      ] = await Promise.all([
        organizerApi.listEventTypes(apiBaseUrl, session),
        organizerApi.getAvailability(apiBaseUrl, session),
        organizerApi.listTimeOffBlocks(apiBaseUrl, session),
        organizerApi.listTeams(apiBaseUrl, session),
        organizerApi.listWebhooks(apiBaseUrl, session),
        organizerApi.getCalendarSyncStatus(apiBaseUrl, session),
        organizerApi.getWritebackStatus(apiBaseUrl, session),
      ]);
      await refreshDemoQuotaPromise;

      setState({
        eventTypes: eventTypePayload.eventTypes,
        availabilityRules: availabilityPayload.rules,
        availabilityOverrides: availabilityPayload.overrides,
        timeOffBlocks: timeOffPayload.timeOffBlocks,
        teams: teamPayload.teams,
        webhooks: webhookPayload.webhooks,
        calendarStatuses: calendarPayload.providers,
        writebackStatus: {
          summary: writebackPayload.summary,
          failures: writebackPayload.failures,
        },
      });

      setSelectedTeamId((currentTeamId) => {
        if (teamPayload.teams.length === 0) {
          return '';
        }
        if (currentTeamId && teamPayload.teams.some((team) => team.id === currentTeamId)) {
          return currentTeamId;
        }
        return teamPayload.teams[0]?.id ?? '';
      });
    } catch (caught) {
      setGlobalError(caught instanceof Error ? caught.message : 'Unable to load organizer console.');
    } finally {
      setHasResolvedInitialLoad(true);
      setIsRefreshing(false);
    }
  }, [apiBaseUrl, refreshDemoQuota, session]);

  useEffect(() => {
    if (!session) {
      setState(emptyState);
      setSelectedTeamId('');
      setGlobalError(null);
      setHasResolvedInitialLoad(false);
      return;
    }

    if (!authedUser) {
      return;
    }

    void refreshOrganizerState();
  }, [authedUser, refreshOrganizerState, session]);

  const selectedTeam = useMemo(() => {
    return state.teams.find((team) => team.id === selectedTeamId) ?? null;
  }, [selectedTeamId, state.teams]);

  const organizerSummary = useMemo(() => {
    const connectedCalendars = state.calendarStatuses.filter((status) => status.connected).length;
    const totalTeamMembers = state.teams.reduce((count, team) => count + team.memberCount, 0);

    return [
      { label: 'Event types', value: String(state.eventTypes.length) },
      { label: 'Teams', value: String(state.teams.length) },
      { label: 'Team members', value: String(totalTeamMembers) },
      { label: 'Webhooks', value: String(state.webhooks.length) },
      { label: 'Calendars connected', value: String(connectedCalendars) },
      { label: 'Writeback failures', value: String(state.writebackStatus?.summary.failed ?? 0) },
    ];
  }, [state.calendarStatuses, state.eventTypes.length, state.teams, state.webhooks.length, state.writebackStatus?.summary.failed]);

  return {
    hasResolvedInitialLoad,
    isRefreshing,
    globalError,
    state,
    selectedTeamId,
    setSelectedTeamId,
    selectedTeam,
    organizerSummary,
    refreshOrganizerState,
  };
};
