export const resolveApiBaseUrl = (routeName: string): string => {
  const configured =
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || process.env.API_BASE_URL?.trim();

  if (!configured) {
    console.warn(
      `Missing NEXT_PUBLIC_API_BASE_URL or API_BASE_URL for ${routeName}; falling back to http://127.0.0.1:8787.`,
    );
    return 'http://127.0.0.1:8787';
  }

  return configured.replace(/\/$/, '');
};
