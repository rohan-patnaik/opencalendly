'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button, Card, FormField, LinkButton, PageShell, Toast } from '../../../components/ui';
import uiStyles from '../../../components/ui/primitives.module.css';
import { useAuthSession } from '../../../lib/use-auth-session';
import styles from '../shared.module.css';

type VerifyPageClientProps = {
  apiBaseUrl: string;
};

type VerifyResponse = {
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

export default function VerifyPageClient({ apiBaseUrl }: VerifyPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { save } = useAuthSession();

  const initialToken = searchParams.get('token')?.trim() || '';

  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const attemptedAutoVerifyRef = useRef(false);

  const verifyToken = useCallback(
    async (tokenValue: string) => {
      const value = tokenValue.trim();
      if (!value) {
        setError('Token is required.');
        return;
      }

      setLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const verifyResponse = await fetch(`${apiBaseUrl}/v0/auth/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          body: JSON.stringify({ token: value }),
        });

        const verifyPayload = (await verifyResponse
          .json()
          .catch(() => null)) as VerifyResponse | null;
        if (!verifyResponse.ok || !verifyPayload || !verifyPayload.ok) {
          throw new Error(verifyPayload?.error || 'Token verification failed.');
        }

        save({
          sessionToken: verifyPayload.sessionToken,
          expiresAt: verifyPayload.expiresAt,
          user: verifyPayload.user,
        });

        setSuccess('Session verified. Redirecting to dashboard…');
        router.replace('/dashboard');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Token verification failed.');
      } finally {
        setLoading(false);
      }
    },
    [apiBaseUrl, router, save],
  );

  useEffect(() => {
    if (attemptedAutoVerifyRef.current || !initialToken) {
      return;
    }
    attemptedAutoVerifyRef.current = true;
    void verifyToken(initialToken);
  }, [initialToken, verifyToken]);

  return (
    <PageShell
      eyebrow="Authentication"
      title="Verify magic-link token"
      description="This step exchanges your one-time token for a session and grants organizer dashboard access."
    >
      <Card>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void verifyToken(token);
          }}
        >
          <FormField label="Magic-link token">
            <input
              className={uiStyles.input}
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste token"
              autoComplete="one-time-code"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </FormField>

          <div className={uiStyles.actions}>
            <Button type="submit" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify and continue'}
            </Button>
            <LinkButton href="/auth/sign-in" variant="secondary">
              Back to sign in
            </LinkButton>
          </div>
        </form>

        {error ? <Toast variant="error">{error}</Toast> : null}
        {success ? <Toast variant="success">{success}</Toast> : null}
      </Card>
    </PageShell>
  );
}
