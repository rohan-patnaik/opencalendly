'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuthSession } from '../../../lib/use-auth-session';
import styles from '../auth.module.css';

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

type AuthMeResponse = {
  ok: boolean;
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

        const meResponse = await fetch(`${apiBaseUrl}/v0/auth/me`, {
          method: 'GET',
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${verifyPayload.sessionToken}`,
          },
        });

        const mePayload = (await meResponse.json().catch(() => null)) as AuthMeResponse | null;
        if (!meResponse.ok || !mePayload || !mePayload.ok) {
          throw new Error(mePayload?.error || 'Session bootstrap failed after verification.');
        }

        save({
          sessionToken: verifyPayload.sessionToken,
          expiresAt: verifyPayload.expiresAt,
          user: mePayload.user,
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
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.kicker}>Authentication</p>
        <h1>Verify magic-link token</h1>
        <p>
          This step converts your one-time magic-link token into a bearer session and loads
          organizer dashboard access.
        </p>

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void verifyToken(token);
          }}
        >
          <label className={styles.label}>
            Magic-link token
            <input
              className={styles.input}
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
          </label>

          <div className={styles.actions}>
            <button className={styles.primaryButton} type="submit" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify and continue'}
            </button>
            <Link className={styles.secondaryButton} href="/auth/sign-in">
              Back to sign in
            </Link>
          </div>
        </form>

        {error ? <p className={styles.error}>{error}</p> : null}
        {success ? <p className={styles.success}>{success}</p> : null}
      </section>
    </main>
  );
}
