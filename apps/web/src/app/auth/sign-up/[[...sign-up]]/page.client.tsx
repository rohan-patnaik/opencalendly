'use client';

import { SignUp, useAuth, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Card, LinkButton, PageShell, Toast } from '../../../../components/ui';
import { useAuthSession } from '../../../../lib/use-auth-session';
import uiStyles from '../../../../components/ui/primitives.module.css';
import styles from '../../shared.module.css';

export default function SignUpPageClient() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const { ready: sessionReady, session } = useAuthSession();
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  const [sessionBridgeTimedOut, setSessionBridgeTimedOut] = useState(false);

  useEffect(() => {
    if (isLoaded && isSignedIn && sessionReady && session) {
      router.replace('/dashboard');
    }
  }, [isLoaded, isSignedIn, router, session, sessionReady]);

  useEffect(() => {
    if (!(isLoaded && isSignedIn && sessionReady && !session)) {
      setSessionBridgeTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      setSessionBridgeTimedOut(true);
    }, 20_000);

    return () => {
      clearTimeout(timer);
    };
  }, [isLoaded, isSignedIn, session, sessionReady]);

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
            forceRedirectUrl="/auth/sign-in"
            fallbackRedirectUrl="/auth/sign-in"
          />
        </div>
        {isLoaded && isSignedIn && sessionReady && !session ? (
          sessionBridgeTimedOut ? (
            <Toast variant="error">
              Session setup is taking longer than expected.
              <button
                type="button"
                className={uiStyles.inlineActionButton}
                onClick={() => {
                  setSessionBridgeTimedOut(false);
                  router.refresh();
                }}
              >
                Retry
              </button>{' '}
              <button
                type="button"
                className={uiStyles.inlineActionButton}
                onClick={() => {
                  void signOut();
                }}
              >
                Sign out
              </button>
            </Toast>
          ) : (
            <Toast variant="info">Finalizing your OpenCalendly session…</Toast>
          )
        ) : null}
        <div className={uiStyles.actions}>
          <LinkButton href="/auth/sign-in" variant="secondary">
            Back to sign in
          </LinkButton>
        </div>
      </Card>
    </PageShell>
  );
}
