const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

const isLocalHostname = (hostname: string): boolean => {
  return LOCAL_HOSTNAMES.has(hostname.trim().toLowerCase().replace(/^\[(.*)\]$/, '$1'));
};

const resolvePreferredLocalHostname = (): string | null => {
  if (typeof window !== 'undefined' && isLocalHostname(window.location.hostname)) {
    return window.location.hostname;
  }

  const configuredAppBaseUrl = process.env.APP_BASE_URL?.trim();
  if (!configuredAppBaseUrl) {
    return null;
  }

  try {
    const appUrl = new URL(configuredAppBaseUrl);
    return isLocalHostname(appUrl.hostname) ? appUrl.hostname : null;
  } catch {
    return null;
  }
};

const rewriteLocalHostnameInUrl = (value: string): string => {
  try {
    const url = new URL(value);
    if (!isLocalHostname(url.hostname)) {
      return value.replace(/\/$/, '');
    }

    const preferredHostname = resolvePreferredLocalHostname();
    if (!preferredHostname || preferredHostname === url.hostname) {
      return value.replace(/\/$/, '');
    }

    url.hostname = preferredHostname;
    return url.toString().replace(/\/$/, '');
  } catch {
    return value.replace(/\/$/, '');
  }
};

const normalizeLocalApiBaseUrl = (configured: string): string => {
  return rewriteLocalHostnameInUrl(configured);
};

export const normalizeLocalBrowserUrl = (value: string): string => {
  return rewriteLocalHostnameInUrl(value);
};

export const resolveApiBaseUrl = (routeName: string): string => {
  const configured =
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || process.env.API_BASE_URL?.trim();

  if (!configured) {
    console.warn(
      `Missing NEXT_PUBLIC_API_BASE_URL or API_BASE_URL for ${routeName}; falling back to http://localhost:8787.`,
    );
    return 'http://localhost:8787';
  }

  return normalizeLocalApiBaseUrl(configured);
};
