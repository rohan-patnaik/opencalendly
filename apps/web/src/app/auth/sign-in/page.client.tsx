'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import styles from '../auth.module.css';

type SignInPageClientProps = {
  apiBaseUrl: string;
};

type MagicLinkResponse = {
  ok: boolean;
  magicLinkToken: string;
  expiresAt: string;
  error?: string;
};

const getBrowserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export default function SignInPageClient({ apiBaseUrl }: SignInPageClientProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState(getBrowserTimezone());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicToken, setMagicToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const tokenPreview = useMemo(() => {
    if (!magicToken) {
      return '';
    }
    return `${magicToken.slice(0, 16)}...${magicToken.slice(-8)}`;
  }, [magicToken]);

  const requestMagicLink = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Email is required.');
      return;
    }

    setLoading(true);
    setError(null);
    setMagicToken(null);
    setExpiresAt(null);

    try {
      const response = await fetch(`${apiBaseUrl}/v0/auth/magic-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          email: normalizedEmail,
          username: username.trim() || undefined,
          displayName: displayName.trim() || undefined,
          timezone: timezone.trim() || undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as MagicLinkResponse | null;
      if (!response.ok || !payload || !payload.ok || !payload.magicLinkToken) {
        throw new Error(payload?.error || 'Unable to create magic link token.');
      }

      setMagicToken(payload.magicLinkToken);
      setExpiresAt(payload.expiresAt);
      router.push(`/auth/verify?token=${encodeURIComponent(payload.magicLinkToken)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create magic link token.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.kicker}>Authentication</p>
        <h1>Sign in with magic link</h1>
        <p>
          Enter your email to start a session. If this is your first sign-in with this email, also
          provide username and display name.
        </p>

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void requestMagicLink();
          }}
        >
          <label className={styles.label}>
            Email
            <input
              className={styles.input}
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>

          <div className={styles.grid}>
            <label className={styles.label}>
              Username (first sign-in only)
              <input
                className={styles.input}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="e.g. rohan-patnaik"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>

            <label className={styles.label}>
              Display name (first sign-in only)
              <input
                className={styles.input}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="e.g. Rohan Patnaik"
              />
            </label>
          </div>

          <label className={styles.label}>
            Timezone
            <input
              className={styles.input}
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              placeholder="Asia/Kolkata"
            />
          </label>

          <p className={styles.hint}>
            Existing users can submit with email only. New users must include username and display
            name.
          </p>

          <div className={styles.actions}>
            <button className={styles.primaryButton} type="submit" disabled={loading}>
              {loading ? 'Requesting...' : 'Continue'}
            </button>
            <Link className={styles.secondaryButton} href="/demo/intro-call">
              Back to booking demo
            </Link>
          </div>
        </form>

        {error ? <p className={styles.error}>{error}</p> : null}

        {magicToken ? (
          <>
            <p className={styles.success}>
              Magic link generated. Redirecting to token verification…
            </p>
            <div className={styles.tokenBox}>{tokenPreview}</div>
            <div className={styles.meta}>
              <span>Expires: {new Date(expiresAt || '').toLocaleString()}</span>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
