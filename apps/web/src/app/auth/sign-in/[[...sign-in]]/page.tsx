import { Suspense } from 'react';

import SignInPageClient from './page.client';

export const runtime = 'edge';

function SignInPageFallback() {
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
      <p style={{ margin: 0, opacity: 0.8 }}>Preparing sign-in…</p>
    </section>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInPageFallback />}>
      <SignInPageClient />
    </Suspense>
  );
}
