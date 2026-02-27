import type { HTMLAttributes, ReactNode } from 'react';

import styles from './primitives.module.css';

type CardProps = HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  description?: ReactNode;
  tight?: boolean;
};

export function Card({ title, description, tight = false, className, children, ...props }: CardProps) {
  const mergedClassName = [styles.card, tight ? styles.cardTight : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <section className={mergedClassName} {...props}>
      {title ? <h2 className={styles.cardTitle}>{title}</h2> : null}
      {description ? <p className={styles.cardDescription}>{description}</p> : null}
      {children}
    </section>
  );
}
