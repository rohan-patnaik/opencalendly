import Link from 'next/link';
import { useId } from 'react';
import { GlobeCanvas } from '../components/globe-canvas';
import { LinkButton } from '../components/ui/button';
import { HeroArtCarousel } from './hero-art-carousel';
import { HomepageTimezoneBadge } from './homepage-timezone-badge';
import styles from './page.module.css';

const heroSignals = [
  { label: 'Conflict safe commits', value: 'Txn checked' },
  { label: 'Calendar writeback', value: 'Google + Microsoft' },
  { label: 'Public scheduling', value: '1:1, team, embed' },
];

const proofStrip = [
  { value: '10+', label: 'Feature streams shipped' },
  { value: '40+', label: 'API routes in v1' },
  { value: 'Neon', label: 'Single supported database' },
  { value: 'OSS', label: 'Open source stack ownership' },
];

const platformPillars = [
  {
    title: 'Availability is checked twice',
    copy: 'OpenCalendly recomputes booking correctness at commit time so public pages stay fast without trusting stale slot reads.',
  },
  {
    title: 'Operators keep control',
    copy: 'Teams can manage event types, availability, webhooks, and calendar sync from product surfaces instead of hidden ops scripts.',
  },
  {
    title: 'Shipping stays portable',
    copy: 'Neon, Cloudflare, Clerk, and Resend stay replaceable because the app is implemented as code you own end to end.',
  },
];

const workflowBlocks = [
  {
    title: '1. Publish booking links',
    copy: 'Launch one-on-one and team event types with buffer-aware, timezone-safe scheduling pages.',
  },
  {
    title: '2. Route real traffic',
    copy: 'Invitees book through public flows, embeds, and action links that hit the same correctness-safe booking APIs.',
  },
  {
    title: '3. Operate from one console',
    copy: 'Organizers review analytics, calendar status, and runtime health without leaving the product surface.',
  },
];

const integrationCards = [
  { title: 'Google Calendar', copy: 'Busy sync, OAuth connection lifecycle, and writeback retries.' },
  { title: 'Microsoft Calendar', copy: 'Provider parity for conflicts, event updates, and operator visibility.' },
  { title: 'Resend', copy: 'Lifecycle email delivery for confirmations, cancellations, and action links.' },
  { title: 'Cloudflare + Neon', copy: 'Edge runtime plus transactional storage tuned for free-tier constraints.' },
];

const pricingPreview = [
  {
    tier: 'Starter OSS',
    points: ['One-on-one + team booking', 'Organizer console + analytics', 'Embeds + webhook runners'],
    cta: { href: '/pricing', label: 'See pricing model' },
  },
  {
    tier: 'Operator Focused',
    points: ['Calendar sync + writeback controls', 'Action-link cancel/reschedule UX', 'Auth, reviews, and deployment guardrails'],
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

type CalendarCell = 0 | 1 | 2;

const calendarRows: CalendarCell[][] = [
  [0, 1, 0, 1, 0, 0, 1, 0],
  [0, 0, 1, 1, 0, 1, 0, 0],
  [1, 0, 0, 2, 0, 0, 1, 0],
  [0, 0, 1, 0, 0, 1, 0, 1],
  [0, 1, 0, 0, 2, 0, 0, 0],
  [1, 0, 0, 1, 0, 0, 1, 0],
];

function CalendarDotArt() {
  const uid = useId();
  const baseId = `${uid}-calendar-dot-base`;
  const accentId = `${uid}-calendar-dot-accent`;

  return (
    <svg
      className={styles.calendarArt}
      viewBox="0 0 560 420"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id={baseId} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1" fill="var(--text-primary)" opacity="0.4" />
        </pattern>
        <pattern id={accentId} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1" fill="var(--brand-primary)" />
        </pattern>
      </defs>

      <rect
        x="50"
        y="30"
        width="340"
        height="310"
        rx="12"
        fill="none"
        stroke="var(--border-strong)"
        strokeOpacity="0.9"
        strokeWidth="10"
      />
      <rect x="74" y="54" width="292" height="48" rx="6" fill={`url(#${accentId})`} />
      <rect x="110" y="16" width="16" height="48" rx="6" fill={`url(#${baseId})`} />
      <rect x="200" y="16" width="16" height="48" rx="6" fill={`url(#${baseId})`} />
      <rect x="290" y="16" width="16" height="48" rx="6" fill={`url(#${baseId})`} />
      <line
        x1="74"
        y1="116"
        x2="366"
        y2="116"
        stroke="var(--border-strong)"
        strokeOpacity="0.75"
        strokeWidth="6"
        strokeLinecap="round"
      />

      {calendarRows.flatMap((row, rowIndex) =>
        row.map((cell, columnIndex) => {
          if (cell === 0) {
            return null;
          }

          const x = 82 + columnIndex * 36;
          const y = 130 + rowIndex * 32;
          const fill = cell === 2 ? `url(#${accentId})` : `url(#${baseId})`;

          return <rect key={`${rowIndex}-${columnIndex}`} x={x} y={y} width="24" height="24" rx="4" fill={fill} />;
        }),
      )}

      {/* Extra ambient dot fields to fill more space */}
      <rect x="420" y="40" width="120" height="140" rx="6" fill={`url(#${baseId})`} opacity="0.5" />
      <rect x="420" y="200" width="120" height="120" rx="6" fill={`url(#${accentId})`} opacity="0.25" />
      <rect x="10" y="360" width="540" height="50" rx="6" fill={`url(#${baseId})`} opacity="0.3" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Open scheduling, quietly opinionated.</p>
            <h1>Calendly-class booking flows on infrastructure your team actually owns.</h1>
            <p className={styles.heroLead}>
              OpenCalendly keeps the booking surface polished while the runtime stays transparent:
              Neon for data, Cloudflare for delivery, Clerk for auth, and product flows wired
              directly to the APIs you operate.
            </p>
            <div className={styles.heroActions}>
              <LinkButton
                className={styles.primaryButton ?? ''}
                href="/demo/intro-call"
                variant="primary"
                size="lg"
              >
                Start booking demo
              </LinkButton>
              <LinkButton
                className={styles.secondaryButton ?? ''}
                href="/organizer"
                variant="secondary"
                size="lg"
              >
                Open organizer console
              </LinkButton>
            </div>
            <div className={styles.signalGrid}>
              {heroSignals.map((item) => (
                <article key={item.label} className={styles.signalCard}>
                  <p className={styles.signalValue}>{item.value}</p>
                  <p className={styles.signalLabel}>{item.label}</p>
                </article>
              ))}
            </div>
          </div>

          <div className={styles.heroArtPanel} aria-hidden="true">
            <div className={styles.artFrame}>
              <HomepageTimezoneBadge />
              <HeroArtCarousel>
                <CalendarDotArt />
                <GlobeCanvas />
              </HeroArtCarousel>
              <div className={styles.artLegend}>
                <div>
                  <span className={styles.legendDot} />
                  <span>open slots</span>
                </div>
                <div>
                  <span className={`${styles.legendDot} ${styles.legendDotAccent}`} />
                  <span>selected flow</span>
                </div>
              </div>
            </div>
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
        <div className={styles.sectionHeading}>
          <p className={styles.sectionEyebrow}>Product loop</p>
          <h2>How teams run OpenCalendly</h2>
        </div>
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
        <div className={styles.sectionHeading}>
          <p className={styles.sectionEyebrow}>Live routes</p>
          <h2>Every link below is wired to a real product flow</h2>
        </div>
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
        <div className={styles.sectionHeading}>
          <p className={styles.sectionEyebrow}>Platform stack</p>
          <h2>Built for practical ownership, not vendor theater</h2>
        </div>
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
        <div className={styles.sectionHeading}>
          <p className={styles.sectionEyebrow}>Plan preview</p>
          <h2>Pricing clarity before any team scales usage</h2>
        </div>
        <div className={styles.pricingGrid}>
          {pricingPreview.map((item) => (
            <article key={item.tier} className={styles.pricingCard}>
              <h3>{item.tier}</h3>
              <ul>
                {item.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <LinkButton href={item.cta.href} variant="secondary" size="lg">
                {item.cta.label}
              </LinkButton>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.ctaBand}>
        <div>
          <p className={styles.sectionEyebrow}>Next move</p>
          <h2>Use the public demos, then step into the operator surfaces.</h2>
          <p>
            The goal is still simple: get a booking link live fast, keep the workflow readable, and
            avoid hidden dependencies when the app grows.
          </p>
        </div>
        <div className={styles.heroActions}>
          <LinkButton
            className={styles.primaryButton ?? ''}
            href="/auth/sign-in"
            variant="primary"
            size="lg"
          >
            Sign in to organizer
          </LinkButton>
          <LinkButton
            className={styles.secondaryButton ?? ''}
            href="/resources"
            variant="secondary"
            size="lg"
          >
            Read implementation notes
          </LinkButton>
        </div>
      </section>

      <footer className={styles.footer}>
        <div>
          <h3>OpenCalendly</h3>
          <p>Open-source scheduling for teams that want product polish without opaque runtime tradeoffs.</p>
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
