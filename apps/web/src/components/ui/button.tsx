import Link from 'next/link';
import type { LinkProps } from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import styles from './primitives.module.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

type BaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
  children: ReactNode;
};

type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement>;
type LinkButtonProps = BaseProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> &
  LinkProps;

const variantClass = (variant: ButtonVariant): string => {
  if (variant === 'primary') {
    return styles.buttonPrimary ?? '';
  }
  if (variant === 'secondary') {
    return styles.buttonSecondary ?? '';
  }
  if (variant === 'danger') {
    return styles.buttonDanger ?? '';
  }
  return styles.buttonGhost ?? '';
};

const sizeClass = (size: ButtonSize): string => {
  if (size === 'sm') {
    return styles.buttonSm ?? '';
  }
  if (size === 'lg') {
    return styles.buttonLg ?? '';
  }
  return '';
};

const buildClassName = (
  variant: ButtonVariant,
  size: ButtonSize,
  block: boolean,
  className: string | undefined,
): string => {
  return [
    styles.button,
    variantClass(variant),
    sizeClass(size),
    block ? styles.buttonBlock : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
};

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button className={buildClassName(variant, size, block, className)} {...props}>
      {children}
    </button>
  );
}

export function LinkButton({
  variant = 'secondary',
  size = 'md',
  block = false,
  className,
  children,
  ...props
}: LinkButtonProps) {
  return (
    <Link className={buildClassName(variant, size, block, className)} {...props}>
      {children}
    </Link>
  );
}
