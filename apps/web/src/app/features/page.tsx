import Link from 'next/link';

import styles from '../marketing-pages.module.css';

const featureGroups = [
  {
    title: 'Booking correctness',
    items: [
      'Booking writes are checked inside a transaction',
      'Idempotency keys keep retries safe',
      'External busy windows are checked again before save',
    ],
  },
  {
    title: 'Organizer operations',
    items: [
      'Create, edit, and review event types',
      'Manage availability rules and overrides',
      'Run teams and team event types from one place',
    ],
  },
  {
    title: 'Lifecycle automation',
    items: [
      'Confirmation, cancel, and reschedule emails',
      'Webhook subscriptions with delivery controls',
      'Writeback queue visibility and retries',
    ],
  },
];

export default function FeaturesPage() {
  return (
    <main className={styles.page}>
      <section className={`${styles.hero} ${styles.heroCentered}`}>
        <h1>Scheduling features you can use in the app and the API.</h1>
        <p>
          OpenCalendly keeps the product experience and backend behavior close together, so what you
          click in the UI matches what runs underneath.
        </p>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeadingCentered}>
          <h2>Capability matrix</h2>
        </div>
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
        <h2>Try the live flows</h2>
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
