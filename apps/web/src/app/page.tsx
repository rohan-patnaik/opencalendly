import Link from 'next/link';
import { useId } from 'react';
import { GlobeCanvas } from '../components/globe-canvas';
import { LinkButton } from '../components/ui/button';
import { HeroArtCarousel } from './hero-art-carousel';
import { HomepageTimezoneBadge } from './homepage-timezone-badge';
import styles from './page.module.css';

const heroSignals = [
  { label: 'Safe booking writes', value: 'Txn checked' },
  { label: 'Calendar sync', value: 'Google + Microsoft' },
  { label: 'Booking surfaces', value: '1:1, team, embed' },
];

const proofStrip = [
  { value: '10+', label: 'Shipped feature tracks' },
  { value: '40+', label: 'API routes in v1' },
  { value: 'Neon', label: 'Supported database' },
  { value: 'OSS', label: 'You own the stack' },
];

const platformPillars = [
  {
    title: 'Availability is checked twice',
    copy: 'Slots stay fast to browse, and booking is checked again right before it is written.',
  },
  {
    title: 'Operators keep control',
    copy: 'Your team can manage event types, availability, webhooks, and calendars from the app itself.',
  },
  {
    title: 'Shipping stays portable',
    copy: 'Neon, Cloudflare, Clerk, and Resend stay visible and replaceable because the code is yours.',
  },
];

const workflowBlocks = [
  {
    title: '1. Publish booking links',
    copy: 'Launch one-on-one and team pages with sensible buffers and timezone support.',
  },
  {
    title: '2. Route real traffic',
    copy: 'Guests book through public pages, embeds, and action links backed by the same APIs.',
  },
  {
    title: '3. Operate from one console',
    copy: 'Organizers can check analytics, calendar status, and queue health without jumping to scripts.',
  },
];

const integrationCards = [
  { title: 'Google Calendar', copy: 'Busy sync, connect flow, and writeback retries.' },
  { title: 'Microsoft Calendar', copy: 'The same core sync and event controls for Microsoft accounts.' },
  { title: 'Resend', copy: 'Clear booking, cancel, and reschedule emails.' },
  { title: 'Cloudflare + Neon', copy: 'Edge delivery with transactional storage underneath.' },
];

const pricingPreview = [
  {
    tier: 'Open starter',
    points: ['One-on-one + team booking', 'Organizer + analytics', 'Embeds + webhooks'],
    cta: { href: '/pricing', label: 'See pricing' },
  },
  {
    tier: 'Operator ready',
    points: ['Calendar sync + writeback', 'Cancel + reschedule links', 'Auth and deploy guardrails'],
    cta: { href: '/features', label: 'See features' },
  },
];

const routeLinks = [
  { label: 'Try one-on-one demo', href: '/demo/intro-call', kind: 'Public' },
  { label: 'Try team demo', href: '/team/demo-team/team-intro-call', kind: 'Public' },
  { label: 'Open embed playground', href: '/embed/playground', kind: 'Public' },
  { label: 'Open organizer', href: '/organizer', kind: 'Auth' },
  { label: 'Open analytics', href: '/dashboard', kind: 'Auth' },
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
            <p className={styles.kicker}>Open scheduling, built with care.</p>
            <h1>Polished scheduling on infrastructure your team owns.</h1>
            <p className={styles.heroLead}>
              OpenCalendly gives teams a clean booking experience without hiding the stack. Run it
              with the services you choose and the APIs you control.
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
              <HeroArtCarousel labels={['Calendar view', 'Globe view']}>
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
          <h2>Start with a real flow</h2>
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
          <h2>Built for real ownership</h2>
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
          <h2>Simple plan shape, clear tradeoffs</h2>
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
          <h2>Try the demos, then step into the operator tools.</h2>
          <p>
            Get a booking link live quickly, keep the workflow easy to follow, and stay in control
            as the app grows.
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
          <p>Open-source scheduling for teams that want a polished product and a readable stack.</p>
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
