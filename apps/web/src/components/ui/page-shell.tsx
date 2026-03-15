import type { ReactNode } from 'react';

import styles from './primitives.module.css';

type PageShellProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string | undefined;
  stackClassName?: string | undefined;
  introClassName?: string | undefined;
  children: ReactNode;
};

export function PageShell({
  eyebrow,
  title,
  description,
  className,
  stackClassName,
  introClassName,
  children,
}: PageShellProps) {
  const shellClassName = [styles.pageShell, className ?? ''].filter(Boolean).join(' ');
  const stackMergedClassName = [styles.pageStack, stackClassName ?? ''].filter(Boolean).join(' ');
  const introMergedClassName = [styles.pageIntro, introClassName ?? ''].filter(Boolean).join(' ');

  return (
    <main className={shellClassName}>
      <div className={stackMergedClassName}>
        <header className={introMergedClassName}>
          {eyebrow ? <p className={styles.pageEyebrow}>{eyebrow}</p> : null}
          <h1 className={styles.pageTitle}>{title}</h1>
          {description ? <p className={styles.pageDescription}>{description}</p> : null}
        </header>
        {children}
      </div>
    </main>
  );
}
