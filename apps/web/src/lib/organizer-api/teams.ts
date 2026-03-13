import { authedGetJson, authedPostJson } from '../api-client';
import type { AuthSession } from '../auth-session';
import { organizerApiFallback as fallback } from './fallback';
import type {
  OrganizerEventQuestion,
  TeamEventType,
  TeamMember,
  TeamMemberRole,
  TeamSummary,
} from './types';

export const organizerTeamsApi = {
  listTeams: async (apiBaseUrl: string, session: AuthSession | null) => {
    return authedGetJson<{ ok: true; teams: TeamSummary[] }>({
      url: `${apiBaseUrl}/v0/teams`,
      session,
      fallbackError: fallback.teamsList,
    });
  },

  createTeam: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    body: {
      name: string;
      slug: string;
    },
  ) => {
    return authedPostJson<{
      ok: true;
      team: {
        id: string;
        ownerUserId: string;
        name: string;
        slug: string;
      };
    }>({
      url: `${apiBaseUrl}/v0/teams`,
      session,
      body,
      fallbackError: fallback.teamCreate,
    });
  },

  listTeamMembers: async (apiBaseUrl: string, session: AuthSession | null, teamId: string) => {
    return authedGetJson<{ ok: true; members: TeamMember[] }>({
      url: `${apiBaseUrl}/v0/teams/${encodeURIComponent(teamId)}/members`,
      session,
      fallbackError: fallback.teamMembersList,
    });
  },

  addTeamMember: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    teamId: string,
    body: {
      userId: string;
      role: TeamMemberRole;
    },
  ) => {
    return authedPostJson<{ ok: true; member: TeamMember }>({
      url: `${apiBaseUrl}/v0/teams/${encodeURIComponent(teamId)}/members`,
      session,
      body,
      fallbackError: fallback.teamMemberCreate,
    });
  },

  listTeamEventTypes: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    teamId: string,
  ) => {
    return authedGetJson<{
      ok: true;
      team: {
        id: string;
        ownerUserId: string;
        slug: string;
        name: string;
      };
      eventTypes: TeamEventType[];
    }>({
      url: `${apiBaseUrl}/v0/teams/${encodeURIComponent(teamId)}/event-types`,
      session,
      fallbackError: fallback.teamEventTypesList,
    });
  },

  createTeamEventType: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    body: {
      teamId: string;
      name: string;
      slug: string;
      durationMinutes: number;
      dailyBookingLimit?: number | null;
      weeklyBookingLimit?: number | null;
      monthlyBookingLimit?: number | null;
      mode: 'round_robin' | 'collective';
      locationType?: 'video' | 'phone' | 'in_person' | 'custom';
      locationValue?: string | null;
      questions?: OrganizerEventQuestion[];
      requiredMemberUserIds?: string[];
    },
  ) => {
    return authedPostJson<{ ok: true; teamEventType: TeamEventType }>({
      url: `${apiBaseUrl}/v0/team-event-types`,
      session,
      body,
      fallbackError: fallback.teamEventTypeCreate,
    });
  },
};
