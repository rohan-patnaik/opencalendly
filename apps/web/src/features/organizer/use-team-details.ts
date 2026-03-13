'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { AuthSession } from '../../lib/auth-session';
import { organizerApi, type TeamEventType, type TeamMember } from '../../lib/organizer-api';

type UseTeamDetailsInput = {
  apiBaseUrl: string;
  session: AuthSession | null;
  selectedTeamId: string;
};

export const useTeamDetails = ({ apiBaseUrl, session, selectedTeamId }: UseTeamDetailsInput) => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamEventTypes, setTeamEventTypes] = useState<TeamEventType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refreshTeamDetails = useCallback(
    async (teamId: string) => {
      if (!session || !teamId) {
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setLoading(true);
      setError(null);

      try {
        const [membersPayload, teamEventTypePayload] = await Promise.all([
          organizerApi.listTeamMembers(apiBaseUrl, session, teamId),
          organizerApi.listTeamEventTypes(apiBaseUrl, session, teamId),
        ]);
        if (requestId === requestIdRef.current) {
          setTeamMembers(membersPayload.members);
          setTeamEventTypes(teamEventTypePayload.eventTypes);
        }
      } catch (caught) {
        if (requestId === requestIdRef.current) {
          setTeamMembers([]);
          setTeamEventTypes([]);
          setError(caught instanceof Error ? caught.message : 'Unable to load team details.');
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [apiBaseUrl, session],
  );

  useEffect(() => {
    if (!selectedTeamId) {
      setTeamMembers([]);
      setTeamEventTypes([]);
      setError(null);
      return;
    }
    void refreshTeamDetails(selectedTeamId);
  }, [refreshTeamDetails, selectedTeamId]);

  return {
    teamMembers,
    teamEventTypes,
    teamDetailsLoading: loading,
    teamDetailsError: error,
    refreshTeamDetails,
  };
};
