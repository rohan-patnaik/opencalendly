import Link from 'next/link';

import styles from '../marketing-pages.module.css';

const plans = [
  {
    title: 'Community',
    subtitle: 'Build and evaluate the full scheduling stack.',
    points: [
      'One-on-one + team scheduling routes',
      'Organizer console and analytics dashboard',
      'Embeds, webhooks, and lifecycle emails',
    ],
  },
  {
    title: 'Operator',
    subtitle: 'For teams actively running scheduling operations.',
    points: [
      'Calendar sync + writeback runner controls',
      'Operational queue visibility and retries',
      'Action-link based cancel/reschedule UX',
    ],
  },
  {
    title: 'Enterprise-ready',
    subtitle: 'Self-hosted control with architecture ownership.',
    points: [
      'Neon + Cloudflare deployment model',
      'Typed API contracts and OSS review workflow',
      'Extensible frontend parity track',
    ],
  },
];

export default function PricingPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.kicker}>Pricing</p>
        <h1>Transparent pricing model for an open scheduling stack.</h1>
        <p>
          OpenCalendly keeps product capabilities visible up front so teams can map infra cost to
          real scheduling volume before scaling.
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
        <h2>Validate with live flows first</h2>
        <p>Run the demos, then evaluate organizer operations with your own environment values.</p>
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
