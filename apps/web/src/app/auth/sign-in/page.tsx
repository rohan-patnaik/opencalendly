import { Suspense } from 'react';

import SignInPageClient from './page.client';

function SignInPageFallback() {
  return (
    <section
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
