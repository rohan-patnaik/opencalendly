import Link from 'next/link';

import styles from '../marketing-pages.module.css';

const plans = [
  {
    title: 'Community',
    subtitle: 'A good place to build and explore.',
    points: [
      'One-on-one + team scheduling routes',
      'Organizer and analytics surfaces',
      'Embeds, webhooks, and lifecycle emails',
    ],
  },
  {
    title: 'Operator',
    subtitle: 'For teams running scheduling every day.',
    points: [
      'Calendar sync and writeback controls',
      'Queue visibility and retries',
      'Cancel and reschedule links',
    ],
  },
  {
    title: 'Enterprise-ready',
    subtitle: 'For teams that want ownership and room to extend.',
    points: [
      'Neon + Cloudflare deployment model',
      'Typed API contracts and review workflow',
      'Extensible frontend architecture',
    ],
  },
];

export default function PricingPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.kicker}>Pricing</p>
        <h1>Clear pricing for teams that want control.</h1>
        <p>
          See the product shape up front, try the live flows, and decide what fits before you scale
          usage.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Plan preview</h2>
        <div className={styles.grid}>
          {plans.map((plan) => (
            <article key={plan.title} className={styles.card}>
              <h3>{plan.title}</h3>
              <p>{plan.subtitle}</p>
              <ul>
                {plan.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.cta}>
        <h2>Try the product first</h2>
        <p>Run the demos, then test the organizer flow with your own environment values.</p>
        <div className={styles.actions}>
          <Link href="/demo/intro-call" className={styles.primaryButton}>
            Open booking demo
          </Link>
          <Link href="/organizer" className={styles.secondaryButton}>
            Open organizer console
          </Link>
        </div>
      </section>
    </main>
  );
}
