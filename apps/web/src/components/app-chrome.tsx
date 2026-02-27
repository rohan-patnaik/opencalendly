'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAuthSession } from '../lib/use-auth-session';
import ThemeToggle from './theme-toggle';
import styles from './app-chrome.module.css';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/demo/intro-call', label: 'Book Demo' },
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

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          OpenCalendly
        </Link>

        <nav className={styles.nav} aria-label="Main">
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
              <button type="button" className={styles.actionLink} onClick={clear}>
                Sign out
              </button>
            </>
          ) : (
            <Link href="/auth/sign-in" className={styles.actionLink}>
              Sign in
            </Link>
          )}
        </div>
      </header>

      <div className={styles.content}>{children}</div>
    </div>
  );
}
