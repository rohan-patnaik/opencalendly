'use client';

import { useClerk } from '@clerk/nextjs';
import Link from 'next/link';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { useState } from 'react';

import { resolveApiBaseUrl } from '../lib/api-base-url';
import { revokeApiSession } from '../lib/api-client';
import { useAuthSession } from '../lib/use-auth-session';
import styles from './page.module.css';

export function HomepageHeroActions() {
  const apiBaseUrl = resolveApiBaseUrl('homepage hero');
  const { signOut } = useClerk();
  const { ready, session, clear } = useAuthSession();
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setSignOutError(null);
    let apiSessionRevoked = false;

    try {
      await revokeApiSession(apiBaseUrl);
      apiSessionRevoked = true;
      clear();
      await signOut({ redirectUrl: '/auth/sign-in' });
    } catch (error) {
      if (apiSessionRevoked) {
        clear();
      }
      if (isClerkAPIResponseError(error)) {
        const detail = error.errors[0]?.longMessage ?? error.errors[0]?.message;
        setSignOutError(detail ?? 'Unable to sign out right now.');
        return;
      }
      setSignOutError('Unable to sign out right now.');
    }
  };

  if (ready && session) {
    return (
      <>
        <div className={styles.heroActions}>
          <Link className={`${styles.authButton} ${styles.authButtonGoogle}`} href="/organizer">
            Open organizer
          </Link>
          <Link className={`${styles.authButton} ${styles.authButtonMicrosoft}`} href="/dashboard">
            View dashboard
          </Link>
          <button
            type="button"
            className={`${styles.authButton} ${styles.authButtonEmail}`}
            onClick={() => void handleSignOut()}
          >
            Sign out
          </button>
        </div>
        {signOutError ? <p className={styles.heroInlineError}>{signOutError}</p> : null}
      </>
    );
  }

  return (
    <div className={styles.heroActions}>
      <Link className={`${styles.authButton} ${styles.authButtonGoogle}`} href="/auth/sign-up">
        <span className={styles.authIcon}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 1 12c0 1.94.46 3.77 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
        </span>
        Sign up with Google
      </Link>
      <Link className={`${styles.authButton} ${styles.authButtonMicrosoft}`} href="/auth/sign-up">
        <span className={styles.authIcon}>
          <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
          </svg>
        </span>
        Sign up with Microsoft
      </Link>
      <span className={styles.authDivider}>or</span>
      <Link className={`${styles.authButton} ${styles.authButtonEmail}`} href="/auth/sign-up">
        Sign up with email →
      </Link>
    </div>
  );
}
