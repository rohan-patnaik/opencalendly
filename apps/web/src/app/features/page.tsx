import Link from 'next/link';

import styles from '../marketing-pages.module.css';

const featureGroups = [
  {
    title: 'Booking correctness',
    items: [
      'Transactional booking commit with unique slot constraints',
      'Request idempotency keys for conflict-safe retries',
      'Recheck external busy windows before booking write',
    ],
  },
  {
    title: 'Organizer operations',
    items: [
      'Event type create/edit/list controls',
      'Availability rule + override management',
      'Team member and team event type administration',
    ],
  },
  {
    title: 'Lifecycle automation',
    items: [
      'Resend-backed confirmation/cancel/reschedule emails',
      'Webhook subscriptions and delivery runner',
      'Calendar writeback queue with retry visibility',
    ],
  },
];

export default function FeaturesPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.kicker}>Features</p>
        <h1>Every major scheduling capability is exposed in product and API.</h1>
        <p>
          Feature development is tracked by PR-gated milestones and keeps parity between backend
          correctness and web experience surfaces.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Capability matrix</h2>
        <div className={styles.grid}>
          {featureGroups.map((group) => (
            <article key={group.title} className={styles.card}>
              <h3>{group.title}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.cta}>
        <h2>Try the flows behind the matrix</h2>
        <div className={styles.actions}>
          <Link href="/team/demo-team/team-intro-call" className={styles.primaryButton}>
            Try team booking
          </Link>
          <Link href="/dashboard" className={styles.secondaryButton}>
            Open analytics dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
