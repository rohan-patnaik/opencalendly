import Link from 'next/link';
import styles from './page.module.css';

const proofStrip = [
  { value: '10+', label: 'Feature streams shipped' },
  { value: '40+', label: 'API routes in v1' },
  { value: 'Neon', label: 'Single supported database' },
  { value: 'OSS', label: 'Open source stack ownership' },
];

const platformPillars = [
  {
    title: 'Scheduling that rechecks correctness at commit',
    copy: 'Slot conflicts are validated at booking mutation time with transaction-safe guarantees and idempotency keys.',
  },
  {
    title: 'Organizer operations without hidden dashboards',
    copy: 'Event types, availability, teams, webhooks, calendar sync, and writeback controls are exposed in product UI.',
  },
  {
    title: 'Public flows ready for real traffic',
    copy: 'One-on-one booking, team booking, cancel/reschedule links, and embed scripts all route to implemented APIs.',
  },
];

const workflowBlocks = [
  {
    title: '1. Publish event types',
    copy: 'Create one-on-one or team event types, define location mode, and control active state from organizer UI.',
  },
  {
    title: '2. Open booking links',
    copy: 'Share public booking pages with timezone handling, buffer-aware slot generation, and duplicate-request protection.',
  },
  {
    title: '3. Operate at runtime',
    copy: 'Track analytics, run webhook deliveries, sync calendars, and clear writeback failures from authenticated surfaces.',
  },
];

const integrationCards = [
  { title: 'Google Calendar', copy: 'OAuth connect, sync, busy-window conflict blocking, and writeback retries.' },
  { title: 'Microsoft Calendar', copy: 'Provider parity with connection lifecycle, sync scheduling, and failure visibility.' },
  { title: 'Resend', copy: 'Booking lifecycle emails with delivery telemetry and action-link support.' },
  { title: 'Cloudflare Workers', copy: 'Low-cost API runtime with Hyperdrive bridge to Neon.' },
];

const pricingPreview = [
  {
    tier: 'Starter OSS',
    points: ['One-on-one + team booking', 'Organizer console + analytics', 'Embeds + webhook runners'],
    cta: { href: '/pricing', label: 'See pricing model' },
  },
  {
    tier: 'Operator Focused',
    points: ['Calendar sync + writeback controls', 'Action links + lifecycle emails', 'Rate-limit and idempotency hardening'],
    cta: { href: '/features', label: 'See feature matrix' },
  },
];

const routeLinks = [
  { label: 'Book one-on-one demo', href: '/demo/intro-call', kind: 'Public' },
  { label: 'Book team demo', href: '/team/demo-team/team-intro-call', kind: 'Public' },
  { label: 'Open embed playground', href: '/embed/playground', kind: 'Public' },
  { label: 'Open organizer console', href: '/organizer', kind: 'Auth' },
  { label: 'Open analytics dashboard', href: '/dashboard', kind: 'Auth' },
];

export default function HomePage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroOrbit} aria-hidden="true" />
        <div className={styles.heroContent}>
          <p className={styles.kicker}>OpenCalendly alternative</p>
          <h1>Calendly-grade scheduling UX, fully owned by your stack.</h1>
          <p>
            Run scheduling on Neon + Cloudflare with modern booking flows, operational tooling, and
            public embeds without vendor lock-in.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryButton} href="/demo/intro-call">
              Start booking demo
            </Link>
            <Link className={styles.secondaryButton} href="/features">
              Explore feature surface
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.proofStrip}>
        {proofStrip.map((item) => (
          <article key={item.label} className={styles.proofCard}>
            <p className={styles.proofValue}>{item.value}</p>
            <p className={styles.proofLabel}>{item.label}</p>
          </article>
        ))}
      </section>

      <section className={styles.valueGrid}>
        {platformPillars.map((card) => (
          <article key={card.title} className={styles.valueCard}>
            <h2>{card.title}</h2>
            <p>{card.copy}</p>
          </article>
        ))}
      </section>

      <section className={styles.workflowPanel}>
        <h2>How teams run OpenCalendly</h2>
        <div className={styles.workflowGrid}>
          {workflowBlocks.map((block) => (
            <article key={block.title} className={styles.workflowCard}>
              <h3>{block.title}</h3>
              <p>{block.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.routePanel}>
        <h2>Live product routes</h2>
        <p>All links below are wired to currently implemented product functionality.</p>
        <div className={styles.routeGrid}>
          {routeLinks.map((item) => (
            <Link key={item.href} href={item.href} className={styles.routeCard}>
              <span className={styles.badge}>{item.kind}</span>
              <strong>{item.label}</strong>
              <span>{item.href}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.integrationPanel}>
        <h2>Integrations + platform</h2>
        <div className={styles.integrationGrid}>
          {integrationCards.map((item) => (
            <article key={item.title} className={styles.integrationCard}>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.pricingPanel}>
        <h2>Pricing clarity before scale</h2>
        <div className={styles.pricingGrid}>
          {pricingPreview.map((item) => (
            <article key={item.tier} className={styles.pricingCard}>
              <h3>{item.tier}</h3>
              <ul>
                {item.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <Link href={item.cta.href} className={styles.secondaryButton}>
                {item.cta.label}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.ctaBand}>
        <div>
          <h2>Ready to own your scheduling stack?</h2>
          <p>Start with demos, then move into organizer workflows and analytics without changing infra.</p>
        </div>
        <div className={styles.heroActions}>
          <Link className={styles.primaryButton} href="/auth/sign-in">
            Sign in to organizer
          </Link>
          <Link className={styles.secondaryButton} href="/resources">
            Read implementation resources
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <div>
          <h3>OpenCalendly</h3>
          <p>Open-source scheduling for free-tier constraints.</p>
        </div>
        <div className={styles.footerLinks}>
          <Link href="/features">Features</Link>
          <Link href="/solutions">Solutions</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/resources">Resources</Link>
          <Link href="/embed/playground">Embed playground</Link>
          <Link href="/organizer">Organizer console</Link>
          <Link href="/dashboard">Analytics dashboard</Link>
          <Link href="/demo/intro-call">Booking demo</Link>
        </div>
      </footer>
    </main>
  );
}
