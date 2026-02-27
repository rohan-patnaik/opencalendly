import Link from 'next/link';

import styles from '../marketing-pages.module.css';

const solutions = [
  {
    title: 'Founder-led product teams',
    copy: 'Ship one-on-one and team scheduling without waiting for enterprise plan upgrades.',
  },
  {
    title: 'Ops and support teams',
    copy: 'Use organizer controls to manage availability, recover failed queues, and rerun automations quickly.',
  },
  {
    title: 'Developer-first orgs',
    copy: 'Extend typed APIs and frontend primitives while keeping review gates strict across every feature PR.',
  },
];

export default function SolutionsPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.kicker}>Solutions</p>
        <h1>Built for teams that want control over scheduling architecture.</h1>
        <p>
          OpenCalendly is optimized for teams balancing product speed, infra spend, and audit-ready
          engineering workflows.
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
        <h2>Move from evaluation to operation</h2>
        <p>Start with public booking routes, then switch into organizer and analytics surfaces.</p>
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
