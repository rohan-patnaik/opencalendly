import { getAuthHeader, type AuthSession } from './auth-session';

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

export const authedGetJson = async <T>(input: {
  url: string;
  session: AuthSession | null;
  fallbackError: string;
}): Promise<T> => {
  const response = await fetch(input.url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      ...getAuthHeader(input.session),
    },
  });

  const payload = await readJsonSafely<T & ApiErrorPayload>(response);
  if (!response.ok || !payload || payload.ok === false) {
    throw new Error(toErrorMessage(payload, input.fallbackError));
  }
  return payload;
};

export const authedPostJson = async <T>(input: {
  url: string;
  session: AuthSession | null;
  body?: unknown;
  fallbackError: string;
}): Promise<T> => {
  const response = await fetch(input.url, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(input.session),
    },
    body: input.body ? JSON.stringify(input.body) : '{}',
  });

  const payload = await readJsonSafely<T & ApiErrorPayload>(response);
  if (!response.ok || !payload || payload.ok === false) {
    throw new Error(toErrorMessage(payload, input.fallbackError));
  }
  return payload;
};
