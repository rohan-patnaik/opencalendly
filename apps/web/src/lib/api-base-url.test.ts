import { afterEach, describe, expect, it, vi } from 'vitest';

const restoreEnv = () => {
  delete process.env.API_BASE_URL;
  delete process.env.APP_BASE_URL;
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
};

describe('resolveApiBaseUrl', () => {
  afterEach(() => {
    restoreEnv();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('keeps configured non-local origins unchanged', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.opencalendly.com/';

    const { resolveApiBaseUrl } = await import('./api-base-url');

    expect(resolveApiBaseUrl('test route')).toBe('https://api.opencalendly.com');
  });

  it('normalizes local api origin to the current browser hostname', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:8787';
    vi.stubGlobal('window', {
      location: {
        hostname: 'localhost',
      },
    });

    const { resolveApiBaseUrl } = await import('./api-base-url');

    expect(resolveApiBaseUrl('test route')).toBe('http://localhost:8787');
  });

  it('falls back to app base hostname during server rendering for local dev', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:8787';
    process.env.APP_BASE_URL = 'http://localhost:3000';

    const { resolveApiBaseUrl } = await import('./api-base-url');

    expect(resolveApiBaseUrl('test route')).toBe('http://localhost:8787');
  });
});

describe('normalizeLocalBrowserUrl', () => {
  afterEach(() => {
    restoreEnv();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('normalizes local browser URLs to the active hostname', async () => {
    vi.stubGlobal('window', {
      location: {
        hostname: 'localhost',
      },
    });

    const { normalizeLocalBrowserUrl } = await import('./api-base-url');

    expect(normalizeLocalBrowserUrl('http://127.0.0.1:8787/v0/test')).toBe(
      'http://localhost:8787/v0/test',
    );
  });

  it('preserves non-local browser URLs', async () => {
    const { normalizeLocalBrowserUrl } = await import('./api-base-url');

    expect(normalizeLocalBrowserUrl('https://api.example.com/v0/test')).toBe(
      'https://api.example.com/v0/test',
    );
  });
});
