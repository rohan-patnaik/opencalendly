'use client';

import { useCallback, useMemo, useState } from 'react';

import { authedGetJson } from '../../lib/api-client';
import type { AuthSession } from '../../lib/auth-session';
import type { FunnelResponse, OperatorHealthResponse, TeamResponse } from './types';
import { buildDefaultDashboardRange } from './utils';

type UseDashboardDataInput = {
  apiBaseUrl: string;
  session: AuthSession | null;
};

export const useDashboardData = ({ apiBaseUrl, session }: UseDashboardDataInput) => {
  const defaultRange = useMemo(() => buildDefaultDashboardRange(), []);

  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [eventTypeId, setEventTypeId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [funnel, setFunnel] = useState<FunnelResponse | null>(null);
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [operatorHealth, setOperatorHealth] = useState<OperatorHealthResponse | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) {
      params.set('startDate', startDate);
    }
    if (endDate) {
      params.set('endDate', endDate);
    }
    if (eventTypeId.trim()) {
      params.set('eventTypeId', eventTypeId.trim());
    }
    if (teamId.trim()) {
      params.set('teamId', teamId.trim());
    }
    return params.toString();
  }, [endDate, eventTypeId, startDate, teamId]);

  const resetFilters = useCallback(() => {
    setStartDate(defaultRange.startDate);
    setEndDate(defaultRange.endDate);
    setEventTypeId('');
    setTeamId('');
  }, [defaultRange.endDate, defaultRange.startDate]);

  const clearData = useCallback(() => {
    setFunnel(null);
    setTeam(null);
    setOperatorHealth(null);
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!session) {
      setError('Sign in first to access dashboard analytics.');
      return;
    }

    if (startDate && endDate && startDate > endDate) {
      clearData();
      setError('Start date must be on or before end date.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [funnelPayload, teamPayload, operatorPayload] = await Promise.all([
        authedGetJson<FunnelResponse>({
          url: `${apiBaseUrl}/v0/analytics/funnel?${queryString}`,
          session,
          fallbackError: 'Unable to load funnel analytics.',
        }),
        authedGetJson<TeamResponse>({
          url: `${apiBaseUrl}/v0/analytics/team?${queryString}`,
          session,
          fallbackError: 'Unable to load team analytics.',
        }),
        authedGetJson<OperatorHealthResponse>({
          url: `${apiBaseUrl}/v0/analytics/operator/health?${queryString}`,
          session,
          fallbackError: 'Unable to load operator health analytics.',
        }),
      ]);

      setFunnel(funnelPayload);
      setTeam(teamPayload);
      setOperatorHealth(operatorPayload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load analytics dashboard.');
      clearData();
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, clearData, endDate, queryString, session, startDate]);

  return {
    defaultRange,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    eventTypeId,
    setEventTypeId,
    teamId,
    setTeamId,
    loading,
    error,
    funnel,
    team,
    operatorHealth,
    resetFilters,
    loadDashboard,
    clearData,
  };
};
