'use client';

import { SignUp, useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { Card, LinkButton, PageShell, Toast } from '../../../../components/ui';
import { useAuthSession } from '../../../../lib/use-auth-session';
import uiStyles from '../../../../components/ui/primitives.module.css';
import styles from '../../shared.module.css';

export default function SignUpPageClient() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { ready: sessionReady, session } = useAuthSession();
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

  useEffect(() => {
    if (isLoaded && isSignedIn && sessionReady && session) {
      router.replace('/dashboard');
    }
  }, [isLoaded, isSignedIn, router, session, sessionReady]);

  if (!clerkPublishableKey) {
    return (
      <PageShell
        eyebrow="Authentication"
        title="Create account"
        description="Clerk is required for authentication in this build."
      >
        <Card>
          <Toast variant="error">
            Missing <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code>. Add it to <code>.env</code>{' '}
            and restart <code>npm run dev:web</code>.
          </Toast>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Authentication"
      title="Create your account"
      description="Use email, Google, or Microsoft to create your OpenCalendly account."
    >
      <Card>
        <div className={styles.clerkContainer}>
          <SignUp
            path="/auth/sign-up"
            routing="path"
            signInUrl="/auth/sign-in"
            forceRedirectUrl="/dashboard"
            fallbackRedirectUrl="/dashboard"
          />
        </div>
        <div className={uiStyles.actions}>
          <LinkButton href="/auth/sign-in" variant="secondary">
            Back to sign in
          </LinkButton>
        </div>
      </Card>
    </PageShell>
  );
}
