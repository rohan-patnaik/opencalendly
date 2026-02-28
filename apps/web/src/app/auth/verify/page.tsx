import { Suspense } from 'react';

import { resolveApiBaseUrl } from '../../../lib/api-base-url';
import VerifyPageClient from './page.client';

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyPageFallback />}>
      <VerifyPageClient apiBaseUrl={resolveApiBaseUrl('magic-link verification')} />
    </Suspense>
  );
}

function VerifyPageFallback() {
  return (
    <main
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{ margin: '3rem auto', maxWidth: 720, padding: '0 1rem' }}
    >
      <h1>Verify magic-link token</h1>
      <p>Preparing verification...</p>
    </main>
  );
}
