import { authedGetJson, authedPatchJson, authedPostJson } from '../api-client';
import type { AuthSession } from '../auth-session';
import { organizerApiFallback as fallback } from './fallback';

export type OrganizerProfile = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  timezone: string;
  onboardingCompleted: boolean;
};

export const organizerProfileApi = {
  getProfile: async (apiBaseUrl: string, session: AuthSession | null) => {
    return authedGetJson<{ ok: true; user: OrganizerProfile }>({
      url: `${apiBaseUrl}/v0/profile`,
      session,
      fallbackError: fallback.profileGet,
    });
  },

  updateProfile: async (
    apiBaseUrl: string,
    session: AuthSession | null,
    body: {
      username?: string;
      displayName?: string;
      timezone?: string;
    },
  ) => {
    return authedPatchJson<{ ok: true; user: OrganizerProfile }>({
      url: `${apiBaseUrl}/v0/profile`,
      session,
      body,
      fallbackError: fallback.profileUpdate,
    });
  },

  completeOnboarding: async (apiBaseUrl: string, session: AuthSession | null) => {
    return authedPostJson<{ ok: true; user: OrganizerProfile }>({
      url: `${apiBaseUrl}/v0/onboarding/complete`,
      session,
      body: {},
      fallbackError: fallback.onboardingComplete,
    });
  },
};
