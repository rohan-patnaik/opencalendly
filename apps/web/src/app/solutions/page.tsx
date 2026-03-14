import Link from 'next/link';

import styles from '../marketing-pages.module.css';

const solutions = [
  {
    title: 'Founder-led product teams',
    copy: 'Launch one-on-one and team scheduling without waiting on enterprise tooling.',
  },
  {
    title: 'Ops and support teams',
    copy: 'Manage availability, recover queues, and keep scheduling moving from one console.',
  },
  {
    title: 'Developer-first orgs',
    copy: 'Extend typed APIs and UI primitives while keeping review standards high.',
  },
];

export default function SolutionsPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.kicker}>Solutions</p>
        <h1>Built for teams that want more control over scheduling.</h1>
        <p>
          OpenCalendly fits teams that care about speed, cost, and knowing exactly how the stack
          works.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Who this fits best</h2>
        <div className={styles.grid}>
          {solutions.map((solution) => (
            <article key={solution.title} className={styles.card}>
              <h3>{solution.title}</h3>
              <p>{solution.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.cta}>
        <h2>Move from trial to day-to-day use</h2>
        <p>Start with the public booking flows, then move into organizer and analytics.</p>
        <div className={styles.actions}>
          <Link href="/demo/intro-call" className={styles.primaryButton}>
            Start with one-on-one demo
          </Link>
          <Link href="/organizer" className={styles.secondaryButton}>
            Go to organizer console
          </Link>
        </div>
      </section>
    </main>
  );
}
