'use client';

import { useMemo, useState } from 'react';

import { type AuthSession } from '../lib/auth-session';
import {
  joinDemoWaitlist,
  type DemoFeatureCostKey,
  type DemoQuotaStatusResponse,
} from '../lib/demo-quota';
import { Button, Card, LinkButton, Toast } from './ui';
import styles from './demo-quota-card.module.css';

type DemoQuotaCardProps = {
  apiBaseUrl: string;
  session: AuthSession | null;
  status: DemoQuotaStatusResponse | null;
  loading?: boolean;
  error?: string | null;
  signInHref?: string;
  waitlistSource: string;
  title?: string;
  description?: string;
  featureKeys?: DemoFeatureCostKey[];
  onStatusChange?: () => unknown | Promise<unknown>;
};

const formatResetAt = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'tomorrow';
  }
  return parsed.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

export function DemoQuotaCard({
  apiBaseUrl,
  session,
  status,
  loading = false,
  error = null,
  signInHref,
  waitlistSource,
  title = 'Launch demo status',
  description = 'Daily admissions and credits reset at midnight UTC.',
  featureKeys,
  onStatusChange,
}: DemoQuotaCardProps) {
  const [waitlistEmail, setWaitlistEmail] = useState(session?.user.email ?? '');
  const [waitlistPending, setWaitlistPending] = useState(false);
  const [waitlistMessage, setWaitlistMessage] = useState<string | null>(null);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);

  const visibleCosts = useMemo(() => {
    if (!status) {
      return [];
    }
    if (!featureKeys || featureKeys.length === 0) {
      return status.featureCosts;
    }
    const keySet = new Set(featureKeys);
    return status.featureCosts.filter((feature) => keySet.has(feature.key));
  }, [featureKeys, status]);

  const accountSummary = (() => {
    if (!status?.account) {
      return 'Sign in to see your personal demo credits.';
    }
    if (status.account.isBypass) {
      return 'Dev bypass active. This account is not charged against demo limits.';
    }
    if (!status.account.admitted) {
      return 'Your first paid action claims a slot if today’s pool still has room.';
    }
    return `Using ${status.account.creditsUsed} of ${status.account.creditsLimit ?? 0} credits today.`;
  })();

  const showWaitlist = status
    ? status.admissions.isExhausted && !status.account?.isBypass && !status.account?.admitted
    : false;

  const handleJoinWaitlist = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWaitlistPending(true);
    setWaitlistMessage(null);
    setWaitlistError(null);

    try {
      const email = (waitlistEmail || session?.user.email || '').trim();
      if (!email) {
        throw new Error('Enter an email address to join the waitlist.');
      }

      const result = await joinDemoWaitlist({
        apiBaseUrl,
        email,
        source: waitlistSource,
        metadata: {
          fromSignedInSession: Boolean(session),
        },
      });
      setWaitlistMessage(
        result.joined
          ? 'You are on the waitlist for the next reset window.'
          : 'This email is already on today’s waitlist.',
      );
      if (onStatusChange) {
        await onStatusChange();
      }
    } catch (joinError) {
      setWaitlistError(joinError instanceof Error ? joinError.message : 'Unable to join the waitlist.');
    } finally {
      setWaitlistPending(false);
    }
  };

  return (
    <Card title={title} description={description}>
      <div className={styles.card}>
        {loading ? <Toast variant="info">Loading demo quota…</Toast> : null}
        {error ? <Toast variant="error">{error}</Toast> : null}

        {status ? (
          <>
            <div className={styles.metrics}>
              <article className={styles.metric}>
                <p className={styles.metricLabel}>Daily slots</p>
                <p className={styles.metricValue}>
                  {status.admissions.remaining} / {status.admissions.dailyLimit}
                </p>
                <p className={styles.metricHint}>
                  {status.admissions.admittedCount} accounts admitted today
                </p>
              </article>

              <article className={styles.metric}>
                <p className={styles.metricLabel}>Your credits</p>
                <p className={styles.metricValue}>
                  {status.account?.isBypass
                    ? 'Unlimited'
                    : status.account?.remaining ?? status.account?.creditsLimit ?? 'Sign in'}
                </p>
                <p className={styles.metricHint}>{accountSummary}</p>
              </article>
            </div>

            <p className={styles.helper}>Reset window: {formatResetAt(status.resetAt)}</p>

            {visibleCosts.length > 0 ? (
              <ul className={styles.costList}>
                {visibleCosts.map((feature) => (
                  <li key={feature.key} className={styles.costItem}>
                    <span className={styles.costName}>{feature.label}</span>
                    <span className={styles.costValue}>{feature.cost} credits</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {!session && signInHref ? (
              <div className={styles.actions}>
                <LinkButton href={signInHref} variant="primary">
                  Sign in to use the demo
                </LinkButton>
              </div>
            ) : null}

            {showWaitlist ? (
              <form className={styles.waitlistForm} onSubmit={handleJoinWaitlist}>
                <div className={styles.waitlistField}>
                  <label htmlFor={`waitlist-email-${waitlistSource}`}>Waitlist email</label>
                  <input
                    id={`waitlist-email-${waitlistSource}`}
                    className={styles.input}
                    type="email"
                    value={waitlistEmail}
                    onChange={(event) => setWaitlistEmail(event.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <div className={styles.actions}>
                  <Button type="submit" variant="secondary" disabled={waitlistPending}>
                    {waitlistPending ? 'Joining…' : 'Join waitlist'}
                  </Button>
                </div>
                {waitlistMessage ? <Toast variant="success">{waitlistMessage}</Toast> : null}
                {waitlistError ? <Toast variant="error">{waitlistError}</Toast> : null}
              </form>
            ) : null}
          </>
        ) : null}
      </div>
    </Card>
  );
}
