import type { AuthSession } from '../../lib/auth-session';
import type { OrganizerConsoleUser } from '../../features/organizer/types';

export type OrganizerConsolePageState =
  | 'auth-loading'
  | 'signed-out'
  | 'data-loading'
  | 'ready';

export const getOrganizerConsolePageState = ({
  ready,
  authChecking,
  session,
  authedUser,
  hasResolvedInitialLoad,
}: {
  ready: boolean;
  authChecking: boolean;
  session: AuthSession | null;
  authedUser: OrganizerConsoleUser | null;
  hasResolvedInitialLoad: boolean;
}): OrganizerConsolePageState => {
  if (!ready || authChecking) {
    return 'auth-loading';
  }

  if (!session || !authedUser) {
    return 'signed-out';
  }

  if (!hasResolvedInitialLoad) {
    return 'data-loading';
  }

  return 'ready';
};
