const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

const isLocalHostname = (hostname: string): boolean => {
  return LOCAL_HOSTNAMES.has(hostname.trim().toLowerCase());
};

const parseUrlHostname = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname.trim().toLowerCase();
  } catch {
    return null;
  }
};

export const isDevAuthBootstrapEnabled = (value: string | undefined): boolean => {
  return value?.trim().toLowerCase() === 'true';
};

export const isLocalOriginValue = (value: string | null): boolean => {
  const hostname = parseUrlHostname(value);
  return hostname ? isLocalHostname(hostname) : false;
};

export const isLocalBootstrapRequest = (request: Request): boolean => {
  const requestHostname = parseUrlHostname(request.url);
  if (!requestHostname || !isLocalHostname(requestHostname)) {
    return false;
  }

  const origin = request.headers.get('origin');
  if (origin && !isLocalOriginValue(origin)) {
    return false;
  }

  const referer = request.headers.get('referer');
  if (referer && !isLocalOriginValue(referer)) {
    return false;
  }

  return true;
};
