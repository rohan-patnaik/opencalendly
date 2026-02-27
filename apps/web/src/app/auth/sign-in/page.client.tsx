'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import {
  Button,
  Card,
  FormField,
  LinkButton,
  PageShell,
  Toast,
} from '../../../components/ui';
import uiStyles from '../../../components/ui/primitives.module.css';
import styles from '../shared.module.css';

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
    <PageShell
      eyebrow="Authentication"
      title="Sign in with magic link"
      description="Enter your email to start a session. For first sign-in with a new email, include username and display name."
    >
      <Card>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void requestMagicLink();
          }}
        >
          <FormField label="Email">
            <input
              className={uiStyles.input}
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </FormField>

          <div className={styles.grid}>
            <FormField label="Username (first sign-in only)">
              <input
                className={uiStyles.input}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="e.g. rohan-patnaik"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </FormField>

            <FormField label="Display name (first sign-in only)">
              <input
                className={uiStyles.input}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="e.g. Rohan Patnaik"
              />
            </FormField>
          </div>

          <FormField
            label="Timezone"
            hint="Existing users can submit with email only. New users should include username and display name."
          >
            <input
              className={uiStyles.input}
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              placeholder="Asia/Kolkata"
            />
          </FormField>

          <div className={uiStyles.actions}>
            <Button type="submit" disabled={loading}>
              {loading ? 'Requesting...' : 'Continue'}
            </Button>
            <LinkButton href="/demo/intro-call" variant="secondary">
              Back to booking demo
            </LinkButton>
          </div>
        </form>

        {error ? <Toast variant="error">{error}</Toast> : null}

        {magicToken ? (
          <>
            <Toast variant="success">Magic link generated. Redirecting to token verification…</Toast>
            <p className={styles.tokenPreview}>{tokenPreview}</p>
            <div className={styles.meta}>
              <span>Expires: {new Date(expiresAt || '').toLocaleString()}</span>
            </div>
          </>
        ) : null}
      </Card>
    </PageShell>
  );
}
