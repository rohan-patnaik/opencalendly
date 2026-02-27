import Link from 'next/link';
import styles from './page.module.css';

const valueCards = [
  {
    title: 'No lock-in architecture',
    copy: 'Cloudflare Workers + Pages, Neon Postgres, and OSS-first contracts across every booking flow.',
  },
  {
    title: 'Correctness-first booking',
    copy: 'Transactional commits, unique slot constraints, idempotency keys, and external calendar conflict rechecks.',
  },
  {
    title: 'Team scheduling included',
    copy: 'Round-robin and collective team modes are available in the API and public booking routes.',
  },
];

const experienceLinks = [
  { label: 'One-on-one booking demo', href: '/demo/intro-call', badge: 'Public' },
  { label: 'Organizer console', href: '/organizer', badge: 'Auth' },
  { label: 'Organizer analytics dashboard', href: '/dashboard', badge: 'Auth' },
  { label: 'Sign in / start session', href: '/auth/sign-in', badge: 'Auth' },
];

export default function HomePage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroOrbit} aria-hidden="true" />
        <div className={styles.heroContent}>
          <p className={styles.kicker}>OpenCalendly alternative</p>
          <h1>Own your scheduling stack without sacrificing product polish.</h1>
          <p>
            OpenCalendly now ships the full v1 backend capability set. The next stage is parity UI:
            modern experience surfaces for organizer and public flows.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryButton} href="/demo/intro-call">
              Book demo route
            </Link>
            <Link className={styles.secondaryButton} href="/auth/sign-in">
              Sign in to organizer area
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.valueGrid}>
        {valueCards.map((card) => (
          <article key={card.title} className={styles.valueCard}>
            <h2>{card.title}</h2>
            <p>{card.copy}</p>
          </article>
        ))}
      </section>

      <section className={styles.routePanel}>
        <h2>Live experiences</h2>
        <p>
          These routes are connected to implemented API flows today. Additional organizer and action
          pages are being expanded in the new parity track.
        </p>
        <div className={styles.routeGrid}>
          {experienceLinks.map((item) => (
            <Link key={item.href} href={item.href} className={styles.routeCard}>
              <span className={styles.badge}>{item.badge}</span>
              <strong>{item.label}</strong>
              <span>{item.href}</span>
            </Link>
          ))}
        </div>

        <div className={styles.metaStrip}>
          <div>
            <p className={styles.metaNumber}>10+</p>
            <p>Feature deliveries merged</p>
          </div>
          <div>
            <p className={styles.metaNumber}>40+</p>
            <p>API endpoints available</p>
          </div>
          <div>
            <p className={styles.metaNumber}>Neon-only</p>
            <p>Database policy enforced</p>
          </div>
        </div>
      </section>
    </main>
  );
}
