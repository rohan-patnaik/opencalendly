import type { ReactNode } from 'react';

import styles from './primitives.module.css';

type FormFieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function FormField({ label, hint, children, className }: FormFieldProps) {
  return (
    <label className={[styles.field, className ?? ''].filter(Boolean).join(' ')}>
      <span className={styles.label}>{label}</span>
      {children}
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  );
}
