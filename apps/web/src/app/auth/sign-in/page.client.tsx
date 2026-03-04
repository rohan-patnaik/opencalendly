'use client';

import { SignIn, useAuth } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Card, LinkButton, PageShell, Toast } from '../../../components/ui';
import { resolveApiBaseUrl } from '../../../lib/api-base-url';
import { useAuthSession } from '../../../lib/use-auth-session';
import uiStyles from '../../../components/ui/primitives.module.css';
import styles from '../shared.module.css';

type LegacyVerifyResponse = {
  ok: boolean;
  sessionToken: string;
  expiresAt: string;
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    timezone: string;
  };
  error?: string;
};

export default function SignInPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();
  const { ready: sessionReady, session, save } = useAuthSession();
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  const apiBaseUrl = resolveApiBaseUrl('Auth sign-in page');
  const legacyToken = searchParams.get('token')?.trim() ?? '';
  const handledLegacyTokenRef = useRef('');
  const [legacyVerifying, setLegacyVerifying] = useState(false);
  const [legacyError, setLegacyError] = useState<string | null>(null);

  useEffect(() => {
    if (!legacyToken || session || handledLegacyTokenRef.current === legacyToken) {
      return;
    }
    handledLegacyTokenRef.current = legacyToken;
    setLegacyVerifying(true);
    setLegacyError(null);

    let cancelled = false;
    const verifyLegacyToken = async () => {
      const response = await fetch(`${apiBaseUrl}/v0/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({ token: legacyToken }),
      });

      const payload = (await response.json().catch(() => null)) as LegacyVerifyResponse | null;
      if (!response.ok || !payload || !payload.ok) {
        throw new Error(payload?.error || 'Legacy sign-in token is invalid or expired.');
      }

      if (cancelled) {
        return;
      }

      save({
        sessionToken: payload.sessionToken,
        expiresAt: payload.expiresAt,
        issuer: 'legacy',
        user: payload.user,
      });
      router.replace('/dashboard');
    };

    void verifyLegacyToken()
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setLegacyError(error instanceof Error ? error.message : 'Unable to verify legacy token.');
      })
      .finally(() => {
        if (!cancelled) {
          setLegacyVerifying(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, legacyToken, router, save, session]);

  useEffect(() => {
    if (isLoaded && isSignedIn && sessionReady && session) {
      router.replace('/dashboard');
    }
  }, [isLoaded, isSignedIn, router, session, sessionReady]);

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
        {legacyVerifying ? <Toast variant="info">Verifying legacy sign-in token…</Toast> : null}
        {legacyError ? <Toast variant="error">{legacyError}</Toast> : null}
        <div className={styles.clerkContainer}>
          <SignIn
            path="/auth/sign-in"
            routing="path"
            forceRedirectUrl="/auth/sign-in"
            fallbackRedirectUrl="/auth/sign-in"
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
