'use client';

import { useClerk } from '@clerk/nextjs';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { resolveApiBaseUrl } from '../lib/api-base-url';
import { revokeApiSession } from '../lib/api-client';
import { useAuthSession } from '../lib/use-auth-session';
import styles from './app-chrome.module.css';
import { ThemeToggle } from './theme-toggle';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/demo/intro-call', label: 'Book Demo' },
  { href: '/organizer', label: 'Organizer' },
];

const mobileOnlyLinks = [
  { href: '/solutions', label: 'Solutions' },
  { href: '/resources', label: 'Resources' },
  { href: '/team/demo-team/team-intro-call', label: 'Team Demo' },
  { href: '/embed/playground', label: 'Embed' },
  { href: '/dashboard', label: 'Dashboard' },
];

const isActive = (pathname: string, href: string): boolean => {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname.startsWith(href);
};

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const apiBaseUrl = resolveApiBaseUrl('app chrome sign-out');
  const pathname = usePathname();
  const { session, ready, clear } = useAuthSession();
  const { signOut } = useClerk();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const handleSignOut = useCallback(async () => {
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
        console.error('Clerk sign-out failed after API session revocation:', error);
      } else {
        console.error('API session revocation failed:', error);
      }
      if (isClerkAPIResponseError(error)) {
        const detail = error.errors[0]?.longMessage ?? error.errors[0]?.message;
        console.error('Clerk sign-out failed:', detail ?? 'unknown clerk error');
        setSignOutError(detail ?? 'Unable to sign out right now. Please retry.');
        return;
      }
      setSignOutError('Unable to sign out right now. Please retry.');
    }
  }, [apiBaseUrl, clear, signOut]);

  useEffect(() => {
    closeMobileNav();
  }, [closeMobileNav, pathname]);

  useEffect(() => {
    if (!mobileNavOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1101px)');
    const onMediaChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setMobileNavOpen(false);
      }
    };

    mediaQuery.addEventListener('change', onMediaChange);
    if (mediaQuery.matches) {
      setMobileNavOpen(false);
    }

    return () => {
      mediaQuery.removeEventListener('change', onMediaChange);
    };
  }, []);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.brandGroup}>
          <button
            type="button"
            className={styles.mobileMenuButton}
            onClick={() => setMobileNavOpen((previous) => !previous)}
            aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-navigation"
          >
            <span />
            <span />
            <span />
          </button>

          <Link className={styles.brand} href="/">
            OpenCalendly
          </Link>
        </div>

        <nav className={styles.nav} aria-label="Main navigation">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.navLink} ${isActive(pathname, link.href) ? styles.navLinkActive : ''}`.trim()}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className={styles.right}>
          <ThemeToggle />
          {ready && session ? (
            <>
              <span className={styles.sessionChip}>{session.user.email}</span>
              <Link href="/organizer" className={styles.goToAppButton}>
                Go to app →
              </Link>
              <button type="button" className={styles.signOutLink} onClick={() => void handleSignOut()}>
                Sign out
              </button>
            </>
          ) : (
            <Link href="/auth/sign-in" className={styles.goToAppButton}>
              Go to app →
            </Link>
          )}
        </div>
      </header>

      <div
        className={`${styles.mobileOverlay} ${mobileNavOpen ? styles.mobileOverlayOpen : ''}`.trim()}
        onClick={closeMobileNav}
        aria-hidden="true"
      />
      <aside
        id="mobile-navigation"
        className={`${styles.mobileDrawer} ${mobileNavOpen ? styles.mobileDrawerOpen : ''}`.trim()}
        aria-label="Mobile navigation"
        aria-hidden={!mobileNavOpen}
        inert={!mobileNavOpen}
      >
        <div className={styles.mobileDrawerHeader}>
          <p>Navigate</p>
          <button
            type="button"
            className={styles.mobileCloseButton}
            onClick={closeMobileNav}
          >
            Close
          </button>
        </div>
        <nav className={styles.mobileNav} aria-label="Mobile main navigation">
          {[...navLinks, ...mobileOnlyLinks].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={closeMobileNav}
              className={`${styles.mobileNavLink} ${isActive(pathname, link.href) ? styles.mobileNavLinkActive : ''}`.trim()}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>

      {signOutError ? (
        <div className={styles.signOutError} role="alert">
          {signOutError}
        </div>
      ) : null}

      <div className={styles.content}>{children}</div>
    </div>
  );
}
