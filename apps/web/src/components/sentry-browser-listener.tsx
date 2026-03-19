'use client';

import { useEffect } from 'react';

import { captureBrowserException } from '../lib/sentry-browser';

export default function SentryBrowserListener() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      void captureBrowserException(event.error ?? event.message, {
        name: 'browser_runtime_error',
        tags: { trigger: 'window.error' },
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      void captureBrowserException(event.reason, {
        name: 'browser_unhandled_rejection',
        tags: { trigger: 'window.unhandledrejection' },
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
}
