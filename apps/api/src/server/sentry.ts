import type { Bindings } from './types';

type ApiSentryContext = {
  route?: string;
  method?: string;
  requestId?: string | null;
  statusCode?: number;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

type ParsedSentryDsn = {
  publicKey: string;
  projectId: string;
  storeUrl: string;
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
    return { filename: trimmed };
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
  };
};

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      type: error.name || 'Error',
      value: error.message || 'Unexpected server error',
      stacktrace: error.stack
        ? {
            frames: error.stack.split('\n').slice(0, 30).map(parseStackFrame),
          }
        : undefined,
    };
  }

  return {
    type: 'Error',
    value: typeof error === 'string' ? error : 'Unexpected server error',
  };
};

const resolveApiSentryConfig = (env: Bindings) => {
  const dsn = env.SENTRY_DSN_API?.trim();
  if (!dsn) {
    return null;
  }

  const parsed = parseSentryDsn(dsn);
  if (!parsed) {
    return null;
  }

  return {
    ...parsed,
    environment: env.SENTRY_ENVIRONMENT?.trim() || 'development',
  };
};

export const captureApiException = async (
  env: Bindings,
  error: unknown,
  context: ApiSentryContext = {},
): Promise<void> => {
  const config = resolveApiSentryConfig(env);
  if (!config) {
    return;
  }

  const event = {
    event_id: createEventId(),
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    environment: config.environment,
    level: 'error',
    logger: 'opencalendly-api',
    tags: {
      surface: 'api',
      ...context.tags,
      ...(context.route ? { route: context.route } : {}),
      ...(context.method ? { method: context.method } : {}),
    },
    extra: {
      ...context.extra,
      requestId: context.requestId ?? undefined,
      statusCode: context.statusCode ?? undefined,
    },
    exception: {
      values: [serializeError(error)],
    },
    message: context.route ? `api_error:${context.route}` : 'api_error',
  };

  await fetch(config.storeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${config.publicKey}, sentry_client=opencalendly-api/1.0`,
    },
    body: JSON.stringify(event),
  }).catch(() => undefined);
};
