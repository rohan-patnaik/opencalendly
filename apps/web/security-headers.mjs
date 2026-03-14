const CLERK_FALLBACK_ORIGINS = [
  'https://*.clerk.com',
  'https://*.clerk.accounts.dev',
];

const CLERK_IMAGE_ORIGINS = [
  'https://img.clerk.com',
];

const normalizeOrigin = (value) => {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

export const resolveClerkFrontendApiOrigin = (publishableKey) => {
  const trimmed = publishableKey?.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^pk_(?:test|live)_(.+)$/);
  if (!match?.[1]) {
    return null;
  }

  const payload = match[1].replace(/\$/g, '');
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);

  try {
    const decoded = Buffer.from(padded, 'base64').toString('utf8').replace(/\$$/, '');
    return decoded.startsWith('http://') || decoded.startsWith('https://')
      ? new URL(decoded).origin
      : `https://${decoded}`;
  } catch {
    return null;
  }
};

const toDirective = (name, values) => `${name} ${Array.from(new Set(values)).join(' ')}`;

export const buildWebCsp = (input = {}) => {
  const isDevelopment = input.isDevelopment === true;
  const appOrigin = normalizeOrigin(input.appBaseUrl) ?? 'http://localhost:3000';
  const apiOrigin = normalizeOrigin(input.apiBaseUrl) ?? 'http://localhost:8787';
  const clerkOrigin = resolveClerkFrontendApiOrigin(input.clerkPublishableKey);

  const clerkSources = clerkOrigin ? [clerkOrigin] : CLERK_FALLBACK_ORIGINS;
  const connectSrc = [
    "'self'",
    appOrigin,
    apiOrigin,
    ...clerkSources,
  ];
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
    apiOrigin,
    'https://challenges.cloudflare.com',
    ...clerkSources,
  ];
  const frameSrc = [
    "'self'",
    appOrigin,
    'https://challenges.cloudflare.com',
    ...clerkSources,
  ];
  const imgSrc = [
    "'self'",
    'data:',
    'blob:',
    ...CLERK_IMAGE_ORIGINS,
  ];
  const styleSrc = ["'self'", "'unsafe-inline'"];
  const fontSrc = ["'self'", 'data:', 'https:'];
  const workerSrc = ["'self'", 'blob:'];
  const formAction = ["'self'", appOrigin, ...clerkSources];

  return [
    toDirective('default-src', ["'self'"]),
    toDirective('base-uri', ["'self'"]),
    toDirective('object-src', ["'none'"]),
    toDirective('form-action', formAction),
    toDirective('script-src', scriptSrc),
    toDirective('connect-src', connectSrc),
    toDirective('img-src', imgSrc),
    toDirective('style-src', styleSrc),
    toDirective('font-src', fontSrc),
    toDirective('worker-src', workerSrc),
    toDirective('frame-src', frameSrc),
  ].join('; ');
};

export const buildCommonWebSecurityHeaders = (input = {}) => {
  const csp = buildWebCsp(input);
  return [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
    },
  ];
};

export const buildSensitivePageHeaders = () => {
  return [
    { key: 'X-Frame-Options', value: 'DENY' },
  ];
};
