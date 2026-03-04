'use client';

import { SignIn, useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { Card, LinkButton, PageShell, Toast } from '../../../components/ui';
import uiStyles from '../../../components/ui/primitives.module.css';
import styles from '../shared.module.css';

export default function SignInPageClient() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace('/dashboard');
    }
  }, [isLoaded, isSignedIn, router]);

  if (!clerkPublishableKey) {
    return (
      <PageShell
        eyebrow="Authentication"
        title="Sign in"
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
      title="Sign in"
      description="Use email or Google sign-in to start your OpenCalendly session."
    >
      <Card>
        <div className={styles.clerkContainer}>
          <SignIn
            path="/auth/sign-in"
            routing="path"
            forceRedirectUrl="/dashboard"
            fallbackRedirectUrl="/dashboard"
          />
        </div>
        <div className={uiStyles.actions}>
          <LinkButton href="/demo/intro-call" variant="secondary">
            Back to booking demo
          </LinkButton>
        </div>
      </Card>
    </PageShell>
  );
}
