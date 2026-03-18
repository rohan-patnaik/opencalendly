import Link from 'next/link';

import styles from '../marketing-pages.module.css';

const resources = [
  {
    title: 'User FAQ',
    description: 'Answers to common sign-in, calendar connection, and booking questions.',
    href: 'https://github.com/rohan-patnaik/opencalendly/blob/main/docs/FAQ.md',
    external: true,
  },
  {
    title: 'Backlog and acceptance criteria',
    description: 'The running plan for feature slices and merge gates.',
    href: 'https://github.com/rohan-patnaik/opencalendly/blob/main/docs/BACKLOG.md',
    external: true,
  },
  {
    title: 'API contracts',
    description: 'Routes, payloads, and auth expectations.',
    href: 'https://github.com/rohan-patnaik/opencalendly/blob/main/docs/API.md',
    external: true,
  },
  {
    title: 'Architecture notes',
    description: 'How web, API, database, and deploy choices fit together.',
    href: 'https://github.com/rohan-patnaik/opencalendly/blob/main/docs/ARCHITECTURE.md',
    external: true,
  },
  {
    title: 'GitHub repository',
    description: 'Implementation history, PRs, and retained feature branches.',
    href: 'https://github.com/rohan-patnaik/opencalendly',
    external: true,
  },
];

export default function ResourcesPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.kicker}>Resources</p>
        <h1>Docs that make the product easier to work with.</h1>
        <p>
          Product scope, API behavior, and architecture notes stay visible so contributors can move
          quickly without guessing.
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
                <a
                  href={resource.href}
                  className={styles.secondaryButton}
                  target="_blank"
                  rel="noreferrer"
                >
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
        <h2>Want to start in the product instead?</h2>
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
