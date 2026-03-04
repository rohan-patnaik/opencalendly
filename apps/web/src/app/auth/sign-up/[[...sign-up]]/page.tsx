import { Suspense } from 'react';

import SignUpPageClient from './page.client';

function SignUpPageFallback() {
  return (
    <section
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        margin: '4rem auto',
        maxWidth: 680,
        padding: '1.25rem',
      }}
    >
      <p style={{ margin: 0, opacity: 0.8 }}>Preparing sign-up…</p>
    </section>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<SignUpPageFallback />}>
      <SignUpPageClient />
    </Suspense>
  );
}
