export const AUTH_SESSION_BRIDGE_RETRY_EVENT = 'opencalendly:auth-session-bridge-retry';

export const requestAuthSessionBridgeRetry = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(AUTH_SESSION_BRIDGE_RETRY_EVENT));
};
