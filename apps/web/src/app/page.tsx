import Link from 'next/link';
import { LinkButton } from '../components/ui/button';
import styles from './page.module.css';

const heroSignals = [
  { label: 'Conflict safe commits', value: 'Txn checked' },
  { label: 'Calendar writeback', value: 'Google + Microsoft' },
  { label: 'Public scheduling', value: '1:1, team, embed' },
];

const calendarArt = [
  '            xx      xx                    ',
  '         xxxxxx  xxxxxx                   ',
  '       xxooooxxxxxxooooxx                 ',
  '      xxoooooooooooooooooxx               ',
  '     xxoooooooooooooooooooox              ',
  '     xxoo  oo  oo  oo  oo  oxx            ',
  '     xxoo  oo  oo  oo  oo  oxx            ',
  '     xx                          xx       ',
  '     xx   xx   xx   xx   xx   xx xx       ',
  '     xx   xx   xx   xx   xx   xx xx       ',
  '     xx   xx   xx   oo   oo   xx xx       ',
  '     xx   xx   xx   oo   oo   xx xx       ',
  '     xx   xx   xx   xx   xx   xx xx       ',
  '     xx   oo   oo   xx   xx   xx xx       ',
  '     xx   oo   oo   xx   xx   xx xx       ',
  '     xx                          xx       ',
  '     xxoooooo    oooooooooo     xx        ',
  '      xxooooooooooooooooooo   xxx         ',
  '       xxxxxxxxxxxxxxxxxxxxxxxxx          ',
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

const calendarArtWidth = Math.max(...calendarArt.map((row) => row.length));

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
              <LinkButton className={styles.primaryButton ?? ''} href="/demo/intro-call" variant="primary" size="lg">
                Start booking demo
              </LinkButton>
              <LinkButton className={styles.secondaryButton ?? ''} href="/organizer" variant="secondary" size="lg">
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

          <div className={styles.heroArtPanel}>
            <div className={styles.artFrame}>
              <div className={styles.artHeader}>
                <span className={styles.artEyebrow}>Calendar sketch</span>
                <span className={styles.artBadge}>UTC aware</span>
              </div>
              <div
                className={styles.calendarArt}
                style={{ gridTemplateColumns: `repeat(${calendarArtWidth}, minmax(0, 1fr))` }}
                aria-hidden="true"
              >
                {calendarArt.flatMap((row, rowIndex) =>
                  row.padEnd(calendarArtWidth, ' ').split('').map((cell, columnIndex) => (
                    <span
                      key={`${rowIndex}-${columnIndex}`}
                      className={[
                        styles.artCell,
                        cell === 'x' ? styles.artCellFilled : '',
                        cell === 'o' ? styles.artCellAccent : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    />
                  )),
                )}
              </div>
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
              <LinkButton href={item.cta.href} className={styles.secondaryButton ?? ''} variant="secondary" size="lg">
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
          <LinkButton className={styles.primaryButton ?? ''} href="/auth/sign-in" variant="primary" size="lg">
            Sign in to organizer
          </LinkButton>
          <LinkButton className={styles.secondaryButton ?? ''} href="/resources" variant="secondary" size="lg">
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
