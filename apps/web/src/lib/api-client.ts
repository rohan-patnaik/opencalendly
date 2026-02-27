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

const authedJson = async <T>(input: {
  url: string;
  session: AuthSession | null;
  method: 'GET' | 'POST' | 'PATCH' | 'PUT';
  body?: unknown;
  fallbackError: string;
}): Promise<T> => {
  const hasBody = input.method !== 'GET';
  const headers: Record<string, string> = {
    ...getAuthHeader(input.session),
  };
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(input.url, {
    method: input.method,
    cache: 'no-store',
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
