import Link from 'next/link';

import styles from './page.module.css';

type FeatureRow = {
  id: string;
  scope: string;
  routes: Array<{ label: string; href: string }>;
};

const quickLinks = [
  { label: 'One-on-one booking demo', href: '/demo/intro-call' },
  { label: 'Team booking demo', href: '/team/demo-team/team-intro-call' },
  { label: 'Magic-link sign-in', href: '/auth/sign-in' },
  { label: 'Organizer console', href: '/organizer' },
  { label: 'Analytics dashboard', href: '/dashboard' },
  { label: 'Embed playground', href: '/embed/playground' },
];

const featureRows: FeatureRow[] = [
  {
    id: 'Feature 0',
    scope: 'Bootstrap + docs + infra baseline',
    routes: [{ label: 'Repo baseline page', href: '/' }],
  },
  {
    id: 'Feature 1',
    scope: 'One-on-one booking, timezone/buffers, transaction-safe commit, confirmation email path',
    routes: [
      { label: 'Public booking', href: '/demo/intro-call' },
      { label: 'Public event API', href: 'http://127.0.0.1:8787/v0/users/demo/event-types/intro-call' },
    ],
  },
  {
    id: 'Feature 2',
    scope: 'Cancel/reschedule action tokens + flows',
    routes: [
      { label: 'Action page pattern', href: '/bookings/actions/example-token' },
      { label: 'Action lookup API pattern', href: 'http://127.0.0.1:8787/v0/bookings/actions/example-token' },
    ],
  },
  {
    id: 'Feature 3',
    scope: 'Demo credits pool + waitlist',
    routes: [{ label: 'Demo credits consume API', href: 'http://127.0.0.1:8787/v0/demo/credits/consume' }],
  },
  {
    id: 'Feature 4',
    scope: 'Embeds + webhooks v1',
    routes: [
      { label: 'Embed playground UI', href: '/embed/playground' },
      { label: 'Webhook subscriptions UI', href: '/organizer' },
    ],
  },
  {
    id: 'Feature 5',
    scope: 'Team scheduling modes (round-robin + collective)',
    routes: [
      { label: 'Team booking route', href: '/team/demo-team/team-intro-call' },
      {
        label: 'Team event API',
        href: 'http://127.0.0.1:8787/v0/teams/demo-team/event-types/team-intro-call',
      },
    ],
  },
  {
    id: 'Feature 6',
    scope: 'Google busy sync + conflict blocking',
    routes: [{ label: 'Calendar integration controls', href: '/organizer' }],
  },
  {
    id: 'Feature 7',
    scope: 'Outlook sync + provider writeback queue',
    routes: [{ label: 'Writeback and provider controls', href: '/organizer' }],
  },
  {
    id: 'Feature 8',
    scope: 'Analytics + operator dashboard',
    routes: [{ label: 'Dashboard', href: '/dashboard' }],
  },
  {
    id: 'Feature 9',
    scope: 'Reliability hardening: rate limits + idempotency + guardrails',
    routes: [{ label: 'Public booking route (rate-limited)', href: '/demo/intro-call' }],
  },
  {
    id: 'Feature 10',
    scope: 'v1 launch readiness docs + release checks',
    routes: [
      {
        label: 'Release notes (GitHub)',
        href: 'https://github.com/rohan-patnaik/opencalendly/blob/main/docs/releases/v1.0.0.md',
      },
    ],
  },
  {
    id: 'Feature 11',
    scope: 'UI foundation + theme toggle + magic-link auth UX',
    routes: [
      { label: 'Theme + global nav', href: '/' },
      { label: 'Sign-in', href: '/auth/sign-in' },
      { label: 'Verify', href: '/auth/verify' },
    ],
  },
  {
    id: 'Feature 12',
    scope: 'Organizer console parity over implemented APIs',
    routes: [{ label: 'Organizer console', href: '/organizer' }],
  },
  {
    id: 'Feature 13',
    scope: 'Public parity (one-on-one/team/action pages/embed)',
    routes: [
      { label: 'One-on-one public', href: '/demo/intro-call' },
      { label: 'Team public', href: '/team/demo-team/team-intro-call' },
      { label: 'Embed playground', href: '/embed/playground' },
    ],
  },
];

const isExternal = (href: string): boolean => href.startsWith('http://') || href.startsWith('https://');

export default function HomePage() {
  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <h1>OpenCalendly barebones UI</h1>
        <p>
          This build intentionally uses a low-decoration interface so flow and functionality can be
          redesigned without visual lock-in.
        </p>
      </section>

      <section className={styles.panel}>
        <h2>Primary routes</h2>
        <ul className={styles.linkList}>
          {quickLinks.map((link) => (
            <li key={link.href}>
              <Link href={link.href}>{link.label}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.panel}>
        <h2>Implemented feature index</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Scope</th>
                <th>Routes / APIs</th>
              </tr>
            </thead>
            <tbody>
              {featureRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.scope}</td>
                  <td>
                    <ul className={styles.routeList}>
                      {row.routes.map((route) => (
                        <li key={route.href}>
                          {isExternal(route.href) ? (
                            <a href={route.href} target="_blank" rel="noreferrer">
                              {route.label}
                            </a>
                          ) : (
                            <Link href={route.href}>{route.label}</Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
