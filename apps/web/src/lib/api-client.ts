import { API_REQUEST_CREDENTIALS, type AuthSession } from './auth-session';
import { normalizeLocalBrowserUrl } from './api-base-url';

type ApiErrorPayload = {
  ok?: boolean;
  error?: string;
};

const toErrorMessage = (payload: ApiErrorPayload | null, fallback: string): string => {
  if (payload?.error && payload.error.trim()) {
    return payload.error;
  }
  return fallback;
};

const readJsonSafely = async <T>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const authedJson = async <T>(input: {
  url: string;
  session: AuthSession | null;
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  fallbackError: string;
}): Promise<T> => {
  const hasBody = input.method !== 'GET';
  const headers: Record<string, string> = {};
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }

  const normalizedUrl = normalizeLocalBrowserUrl(input.url);
  const response = await fetch(normalizedUrl, {
    method: input.method,
    cache: 'no-store',
    credentials: API_REQUEST_CREDENTIALS,
    headers,
    ...(hasBody ? { body: JSON.stringify(input.body ?? {}) } : {}),
  });

  const payload = await readJsonSafely<T & ApiErrorPayload>(response);
  if (!response.ok || !payload || payload.ok === false) {
    throw new Error(toErrorMessage(payload, input.fallbackError));
  }
  return payload;
};

export const authedGetJson = async <T>(input: {
  url: string;
  session: AuthSession | null;
  fallbackError: string;
}): Promise<T> => {
  return authedJson<T>({
    ...input,
    method: 'GET',
  });
};

export const authedPostJson = async <T>(input: {
  url: string;
  session: AuthSession | null;
  body?: unknown;
  fallbackError: string;
}): Promise<T> => {
  return authedJson<T>({
    ...input,
    method: 'POST',
  });
};

export const authedPatchJson = async <T>(input: {
  url: string;
  session: AuthSession | null;
  body?: unknown;
  fallbackError: string;
}): Promise<T> => {
  return authedJson<T>({
    ...input,
    method: 'PATCH',
  });
};

export const authedPutJson = async <T>(input: {
  url: string;
  session: AuthSession | null;
  body?: unknown;
  fallbackError: string;
}): Promise<T> => {
  return authedJson<T>({
    ...input,
    method: 'PUT',
  });
};

export const authedDeleteJson = async <T>(input: {
  url: string;
  session: AuthSession | null;
  body?: unknown;
  fallbackError: string;
}): Promise<T> => {
  return authedJson<T>({
    ...input,
    method: 'DELETE',
  });
};

export const revokeApiSession = async (apiBaseUrl: string): Promise<void> => {
  const response = await fetch(normalizeLocalBrowserUrl(`${apiBaseUrl}/v0/auth/logout`), {
    method: 'POST',
    cache: 'no-store',
    credentials: API_REQUEST_CREDENTIALS,
  });

  const payload = await readJsonSafely<ApiErrorPayload>(response);
  if (!response.ok || payload?.ok === false) {
    throw new Error(toErrorMessage(payload, 'Unable to sign out right now. Please retry.'));
  }
};
