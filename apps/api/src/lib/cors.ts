const LOCAL_WEB_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'] as const;

export const toCorsOrigin = (raw: string | undefined): string | null => {
  if (!raw) {
    return null;
  }

  const value = raw.trim();
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (parsed.origin === 'null') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
};

export const resolveAllowedCorsOrigins = (appBaseUrl: string | undefined): Set<string> => {
  const allowedOrigins = new Set<string>(LOCAL_WEB_ORIGINS);
  const appBaseOrigin = toCorsOrigin(appBaseUrl);
  if (appBaseOrigin) {
    allowedOrigins.add(appBaseOrigin);
  }
  return allowedOrigins;
};
