import Link from 'next/link';
import { useId } from 'react';
import { GlobeCanvas } from '../components/globe-canvas';
import { LinkButton } from '../components/ui/button';
import { PROJECT_LICENSE, PROJECT_REPO_URL } from '../lib/project-metadata';
import { HeroArtCarousel } from './hero-art-carousel';
import { HomepageTimezoneBadge } from './homepage-timezone-badge';
import styles from './page.module.css';

const proofStrip = [
  { value: '10+', label: 'Feature tracks' },
  { value: '40+', label: 'API routes' },
  { value: 'Neon', label: 'Database' },
  { value: 'OSS', label: 'You own it' },
];

const platformPillars = [
  {
    title: 'Checked twice',
    copy: 'Slots load fast, but the booking is verified again inside a transaction before it is written.',
  },
  {
    title: 'Operator control',
    copy: 'Manage event types, availability, webhooks, and calendars from a single organizer console.',
  },
  {
    title: 'Portable stack',
    copy: 'Neon, Cloudflare, Clerk, and Resend stay visible and replaceable because the code is yours.',
  },
];

const workflowBlocks = [
  {
    title: '1. Publish',
    copy: 'Launch one-on-one and team booking pages with sensible buffers and timezone support.',
  },
  {
    title: '2. Route',
    copy: 'Guests book through public pages, embeds, and action links backed by the same APIs.',
  },
  {
    title: '3. Operate',
    copy: 'Check analytics, calendar status, and queue health from one console.',
  },
];

const integrationCards = [
  { title: 'Google Calendar', copy: 'Busy sync and writeback retries.' },
  { title: 'Microsoft Calendar', copy: 'Same sync and event controls.' },
  { title: 'Resend', copy: 'Booking, cancel, and reschedule emails.' },
  { title: 'Cloudflare + Neon', copy: 'Edge delivery with txn storage.' },
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
          <circle cx="3" cy="3" r="1" fill="var(--text-primary)" opacity="0.65" />
        </pattern>
        <pattern id={accentId} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.1" fill="var(--brand-primary)" />
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
      <rect x="420" y="40" width="120" height="140" rx="6" fill={`url(#${baseId})`} opacity="0.7" />
      <rect x="420" y="200" width="120" height="120" rx="6" fill={`url(#${accentId})`} opacity="0.4" />
      <rect x="10" y="360" width="540" height="50" rx="6" fill={`url(#${baseId})`} opacity="0.5" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main className={styles.page}>
      {/* ────── Hero: centered single-column ────── */}
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Open scheduling, built with care.</p>
          <h1>Polished scheduling on infrastructure you own.</h1>
          <p className={styles.heroLead}>
            Calendar sync, transaction-safe booking, and a clean UI — on a stack you control.
            Google &amp; Microsoft calendars, 1:1 &amp; team pages, embeds, and webhooks included.
          </p>
          <div className={styles.heroActions}>
            <Link
              className={`${styles.authButton} ${styles.authButtonGoogle}`}
              href="/auth/sign-up"
            >
              <span className={styles.authIcon}>
                {/* Google "G" logo */}
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 1 12c0 1.94.46 3.77 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </span>
              Sign up with Google
            </Link>
            <Link
              className={`${styles.authButton} ${styles.authButtonMicrosoft}`}
              href="/auth/sign-up"
            >
              <span className={styles.authIcon}>
                {/* Microsoft 4-square logo */}
                <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                </svg>
              </span>
              Sign up with Microsoft
            </Link>
            <span className={styles.authDivider}>or</span>
            <Link
              className={`${styles.authButton} ${styles.authButtonEmail}`}
              href="/auth/sign-up"
            >
              Sign up with email →
            </Link>
          </div>
        </div>

        <div className={styles.heroArtPanel} aria-hidden="true">
          <div className={styles.artFrame}>
            <HomepageTimezoneBadge />
            <HeroArtCarousel>
              <CalendarDotArt />
              <GlobeCanvas />
            </HeroArtCarousel>
          </div>
        </div>
      </section>

      {/* ────── Proof strip: compact stats ────── */}
      <section className={styles.proofStrip}>
        {proofStrip.map((item) => (
          <article key={item.label} className={styles.proofCard}>
            <p className={styles.proofValue}>{item.value}</p>
            <p className={styles.proofLabel}>{item.label}</p>
          </article>
        ))}
      </section>

      {/* ────── Platform pillars ────── */}
      <section>
        <div className={styles.sectionHeading}>
          <p className={styles.sectionEyebrow}>Core principles</p>
          <h2>Built for correctness and control</h2>
        </div>
        <div className={styles.valueGrid}>
          {platformPillars.map((card) => (
            <article key={card.title} className={styles.valueCard}>
              <h2>{card.title}</h2>
              <p>{card.copy}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ────── Workflow ────── */}
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

      {/* ────── Live routes ────── */}
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

      {/* ────── Integrations ────── */}
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

      {/* ────── Pricing ────── */}
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

      {/* ────── CTA band ────── */}
      <section className={styles.ctaBand}>
        <p className={styles.sectionEyebrow}>Next move</p>
        <h2>Try the demos, then step into the operator tools.</h2>
        <p>
          Get a booking link live, keep the workflow simple, stay in control as the app grows.
        </p>
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
            Read the docs
          </LinkButton>
        </div>
      </section>

      {/* ────── Footer ────── */}
      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <div className={styles.footerBrand}>
            <h3>OpenCalendly</h3>
            <Link
              href={PROJECT_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className={styles.footerRepoLink}
            >
              GitHub repository
            </Link>
          </div>
          <div className={styles.footerColumns}>
            <div className={styles.footerColumn}>
              <h4>Product</h4>
              <Link href="/features">Features</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/demo/intro-call">Book a demo</Link>
              <Link href="/embed/playground">Embed</Link>
            </div>
            <div className={styles.footerColumn}>
              <h4>Resources</h4>
              <Link href="/resources">Docs</Link>
              <Link href="/solutions">Solutions</Link>
              <Link href="/dashboard">Dashboard</Link>
            </div>
            <div className={styles.footerColumn}>
              <h4>App</h4>
              <Link href="/organizer">Organizer</Link>
              <Link href="/auth/sign-in">Sign in</Link>
              <Link href="/auth/sign-up">Create account</Link>
            </div>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span>© {new Date().getFullYear()} OpenCalendly</span>
          <span>{`Open source · ${PROJECT_LICENSE}`}</span>
        </div>
      </footer>
    </main>
  );
}
