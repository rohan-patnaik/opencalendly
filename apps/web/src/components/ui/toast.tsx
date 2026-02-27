import type { ReactNode } from 'react';

import styles from './primitives.module.css';

type ToastVariant = 'info' | 'success' | 'error';

type ToastProps = {
  variant?: ToastVariant;
  children: ReactNode;
  className?: string;
};

const variantClass = (variant: ToastVariant): string => {
  if (variant === 'success') {
    return styles.toastSuccess ?? '';
  }
  if (variant === 'error') {
    return styles.toastError ?? '';
  }
  return styles.toastInfo ?? '';
};

export function Toast({ variant = 'info', children, className }: ToastProps) {
  const isError = variant === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={[styles.toast, variantClass(variant), className ?? ''].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}
