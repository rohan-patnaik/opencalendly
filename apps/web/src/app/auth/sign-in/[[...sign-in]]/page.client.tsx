'use client';

import { SignIn, useAuth } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { Card, LinkButton, PageShell, Toast } from '../../../../components/ui';
import { useAuthSession } from '../../../../lib/use-auth-session';
import uiStyles from '../../../../components/ui/primitives.module.css';
import styles from '../../shared.module.css';

const sanitizeRedirectPath = (value: string | null): string => {
  if (!value || !value.startsWith('/')) {
    return '/dashboard';
  }
  return value;
};

export default function SignInPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();
  const { ready: sessionReady, session } = useAuthSession();
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  const redirectPath = sanitizeRedirectPath(searchParams.get('redirect_url'));

  useEffect(() => {
    if (isLoaded && isSignedIn && sessionReady && session) {
      router.replace(redirectPath);
    }
  }, [isLoaded, isSignedIn, redirectPath, router, session, sessionReady]);

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
            signUpUrl="/auth/sign-up"
            forceRedirectUrl={redirectPath}
            fallbackRedirectUrl={redirectPath}
          />
        </div>
        {isLoaded && isSignedIn && sessionReady && !session ? (
          <Toast variant="info">Finalizing your OpenCalendly session…</Toast>
        ) : null}
        <div className={uiStyles.actions}>
          <LinkButton href="/demo/intro-call" variant="secondary">
            Back to booking demo
          </LinkButton>
        </div>
      </Card>
    </PageShell>
  );
}
