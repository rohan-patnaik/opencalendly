'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { useAuthSession } from '../lib/use-auth-session';
import ThemeToggle from './theme-toggle';
import styles from './app-chrome.module.css';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/demo/intro-call', label: 'Book Demo' },
  { href: '/team/demo-team/team-intro-call', label: 'Team Demo' },
  { href: '/embed/playground', label: 'Embed' },
  { href: '/organizer', label: 'Organizer' },
  { href: '/dashboard', label: 'Dashboard' },
];

const isActive = (pathname: string, href: string): boolean => {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname.startsWith(href);
};

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session, ready, clear } = useAuthSession();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

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
          <ThemeToggle className={styles.themeButton} />
          {ready && session ? (
            <>
              <span className={styles.sessionChip}>{session.user.email}</span>
              <button type="button" className={styles.actionButton} onClick={clear}>
                Sign out
              </button>
            </>
          ) : (
            <Link href="/auth/sign-in" className={styles.actionButton}>
              Sign in
            </Link>
          )}
        </div>
      </header>

      <div
        className={`${styles.mobileOverlay} ${mobileNavOpen ? styles.mobileOverlayOpen : ''}`.trim()}
        onClick={closeMobileNav}
      />
      <aside
        id="mobile-navigation"
        className={`${styles.mobileDrawer} ${mobileNavOpen ? styles.mobileDrawerOpen : ''}`.trim()}
        aria-label="Mobile navigation"
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
          {navLinks.map((link) => (
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

      <div className={styles.content}>{children}</div>
    </div>
  );
}
