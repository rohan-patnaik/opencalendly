import { afterEach, describe, expect, it, vi } from 'vitest';

const restoreEnv = () => {
  delete process.env.APP_BASE_URL;
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  delete process.env.API_BASE_URL;
  delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  delete process.env.NODE_ENV;
};

describe('next config security headers', () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it('applies deny-framing headers to authenticated and sensitive pages', async () => {
    process.env.APP_BASE_URL = 'https://opencalendly.com';
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.opencalendly.com';
    process.env.NODE_ENV = 'production';

    const nextConfigModule = await import('./next.config.mjs');
    const routes = await nextConfigModule.default.headers();

    for (const source of [
      '/dashboard/:path*',
      '/organizer/:path*',
      '/auth/:path*',
      '/settings/:path*',
      '/bookings/actions/:path*',
    ]) {
      expect(routes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source,
            headers: [{ key: 'X-Frame-Options', value: 'DENY' }],
          }),
        ]),
      );
    }
  });

  it('builds the common CSP with the configured app origin', async () => {
    process.env.APP_BASE_URL = 'https://opencalendly.com';
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.opencalendly.com';
    process.env.NODE_ENV = 'production';

    const nextConfigModule = await import('./next.config.mjs');
    const routes = await nextConfigModule.default.headers();
    const commonRoute = routes.find((route) => route.source === '/:path*');
    const csp = commonRoute?.headers.find((header) => header.key === 'Content-Security-Policy');

    expect(csp?.value).toContain('https://opencalendly.com');
    expect(csp?.value).not.toContain('http://localhost:3000');
  });

  it('does not apply sensitive deny-framing headers to the embed playground route', async () => {
    process.env.APP_BASE_URL = 'https://opencalendly.com';
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.opencalendly.com';
    process.env.NODE_ENV = 'production';

    const nextConfigModule = await import('./next.config.mjs');
    const routes = await nextConfigModule.default.headers();
    const embedRoute = routes.find((route) => route.source === '/embed/:path*');

    expect(embedRoute).toBeUndefined();
  });
});
