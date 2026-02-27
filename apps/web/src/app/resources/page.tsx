import Link from 'next/link';

import styles from '../marketing-pages.module.css';

const resources = [
  {
    title: 'Backlog and acceptance criteria',
    description: 'Roadmap source of truth for feature slices and merge gates.',
    href: 'https://github.com/rohan-patnaik/opencalendly/blob/main/docs/BACKLOG.md',
    external: true,
  },
  {
    title: 'API contracts',
    description: 'REST routes, payload contracts, and auth requirements.',
    href: 'https://github.com/rohan-patnaik/opencalendly/blob/main/docs/API.md',
    external: true,
  },
  {
    title: 'Architecture notes',
    description: 'System structure across web, API, db, and deployment policies.',
    href: 'https://github.com/rohan-patnaik/opencalendly/blob/main/docs/ARCHITECTURE.md',
    external: true,
  },
  {
    title: 'GitHub repository',
    description: 'Implementation history, PR reviews, and retained feature branches.',
    href: 'https://github.com/rohan-patnaik/opencalendly',
    external: true,
  },
];

export default function ResourcesPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.kicker}>Resources</p>
        <h1>Docs-first implementation workflow.</h1>
        <p>
          Product scope, API behavior, and architecture decisions remain visible so contributors can
          ship features in-policy with review traceability.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Reference links</h2>
        <div className={styles.grid}>
          {resources.map((resource) => (
            <article key={resource.title} className={styles.card}>
              <h3>{resource.title}</h3>
              <p>{resource.description}</p>
              {resource.external ? (
                <a href={resource.href} className={styles.secondaryButton} target="_blank" rel="noreferrer">
                  Open resource
                </a>
              ) : (
                <Link href={resource.href} className={styles.secondaryButton}>
                  Open resource
                </Link>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className={styles.cta}>
        <h2>Prefer to start from product flows?</h2>
        <div className={styles.actions}>
          <Link href="/embed/playground" className={styles.primaryButton}>
            Open embed playground
          </Link>
          <Link href="/auth/sign-in" className={styles.secondaryButton}>
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
