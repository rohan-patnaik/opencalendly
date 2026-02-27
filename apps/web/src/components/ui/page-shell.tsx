import type { ReactNode } from 'react';

import styles from './primitives.module.css';

type PageShellProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
};

export function PageShell({ eyebrow, title, description, children }: PageShellProps) {
  return (
    <main className={styles.pageShell}>
      <div className={styles.pageStack}>
        <header className={styles.pageIntro}>
          {eyebrow ? <p className={styles.pageEyebrow}>{eyebrow}</p> : null}
          <h1 className={styles.pageTitle}>{title}</h1>
          {description ? <p className={styles.pageDescription}>{description}</p> : null}
        </header>
        {children}
      </div>
    </main>
  );
}
