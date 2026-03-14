import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCommonWebSecurityHeaders,
  buildSensitivePageHeaders,
} from './security-headers.mjs';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(appDir, '..', '..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: workspaceRoot,
  async headers() {
    const securityHeaders = buildCommonWebSecurityHeaders({
      appBaseUrl: process.env.APP_BASE_URL,
      apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL,
      clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      isDevelopment: process.env.NODE_ENV !== 'production',
    });

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/dashboard/:path*',
        headers: buildSensitivePageHeaders(),
      },
      {
        source: '/organizer/:path*',
        headers: buildSensitivePageHeaders(),
      },
      {
        source: '/auth/:path*',
        headers: buildSensitivePageHeaders(),
      },
      {
        source: '/settings/:path*',
        headers: buildSensitivePageHeaders(),
      },
      {
        source: '/bookings/actions/:path*',
        headers: buildSensitivePageHeaders(),
      },
    ];
  },
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
