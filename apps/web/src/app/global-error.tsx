'use client';

import { useEffect } from 'react';

import { captureBrowserException } from '../lib/sentry-browser';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void captureBrowserException(error, {
      name: 'next_global_error',
      tags: { trigger: 'global-error-boundary' },
      ...(error.digest ? { extra: { digest: error.digest } } : {}),
    });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: 'var(--font-inter, sans-serif)', margin: 0 }}>
        <main style={{ margin: '4rem auto', maxWidth: 720, padding: '0 1.5rem', textAlign: 'center' }}>
          <h1>Something went wrong</h1>
          <p>The error has been recorded. Refresh the page or try again.</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: '#111',
              border: 'none',
              borderRadius: 999,
              color: '#fff',
              cursor: 'pointer',
              fontSize: '1rem',
              padding: '0.875rem 1.5rem',
            }}
          >
            Retry
          </button>
        </main>
      </body>
    </html>
  );
}
