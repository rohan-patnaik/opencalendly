'use client';

type BrowserSentryContext = {
  name: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

type ParsedSentryDsn = {
  publicKey: string;
  projectId: string;
  storeUrl: string;
};

const resolveBrowserDsn = (): string | null => {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN_WEB?.trim();
  return dsn ? dsn : null;
};

const parseSentryDsn = (dsn: string): ParsedSentryDsn | null => {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const projectId = pathSegments.at(-1);
    if (!publicKey || !projectId) {
      return null;
    }

    const pathPrefix = pathSegments.slice(0, -1).join('/');
    const storePath = pathPrefix ? `/${pathPrefix}/api/${projectId}/store/` : `/api/${projectId}/store/`;

    return {
      publicKey,
      projectId,
      storeUrl: `${url.protocol}//${url.host}${storePath}`,
    };
  } catch {
    return null;
  }
};

const createEventId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }

  let value = Date.now().toString(16);
  while (value.length < 32) {
    value += Math.random().toString(16).slice(2);
  }
  return value.slice(0, 32);
};

const parseStackFrame = (line: string) => {
  const trimmed = line.trim();
  const match = trimmed.match(/^at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
  if (!match) {
    return { filename: trimmed, in_app: true };
  }

  const frameFunction = match[1] ?? '<anonymous>';
  const frameFilename = match[2] ?? trimmed;
  const frameLine = Number.parseInt(match[3] ?? '0', 10);
  const frameColumn = Number.parseInt(match[4] ?? '0', 10);

  return {
    function: frameFunction,
    filename: frameFilename,
    lineno: frameLine,
    colno: frameColumn,
    in_app: true,
  };
};

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      type: error.name || 'Error',
      value: error.message || 'Unexpected browser error',
      stacktrace: error.stack
        ? { frames: error.stack.split('\n').slice(0, 20).map(parseStackFrame) }
        : undefined,
    };
  }

  return {
    type: 'Error',
    value: typeof error === 'string' ? error : 'Unexpected browser error',
  };
};

export const captureBrowserException = async (
  error: unknown,
  context: BrowserSentryContext,
): Promise<void> => {
  const dsn = resolveBrowserDsn();
  if (!dsn) {
    return;
  }

  const parsed = parseSentryDsn(dsn);
  if (!parsed) {
    return;
  }

  const event = {
    event_id: createEventId(),
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',
    level: 'error',
    logger: 'opencalendly-web',
    tags: {
      surface: 'web',
      ...context.tags,
    },
    extra: {
      ...context.extra,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    },
    exception: {
      values: [serializeError(error)],
    },
    message: context.name,
  };

  await fetch(parsed.storeUrl, {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=opencalendly-web/1.0`,
    },
    body: JSON.stringify(event),
  }).catch(() => undefined);
};
