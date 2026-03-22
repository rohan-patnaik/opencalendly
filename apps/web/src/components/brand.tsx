type BrandMarkProps = {
  className?: string | undefined;
  title?: string | undefined;
};

export function BrandMark({ className, title = 'OpenCalendly' }: BrandMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 128 128"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <ellipse
        cx="64"
        cy="64"
        rx="46"
        ry="56"
        fill="none"
        stroke="var(--text-heading)"
        strokeWidth="6.5"
      />
      <ellipse
        cx="64"
        cy="64"
        rx="34"
        ry="40"
        fill="none"
        stroke="var(--text-heading)"
        strokeWidth="6.5"
      />
      <circle cx="60" cy="64" r="24" fill="var(--brand-primary)" />
      <circle cx="90" cy="36" r="5.75" fill="var(--text-heading)" />
      <circle cx="28" cy="96" r="5.75" fill="var(--text-heading)" />
      <circle cx="102" cy="98" r="5.75" fill="var(--text-heading)" />
    </svg>
  );
}

export function BrandLockup({
  className,
  markClassName,
  wordmarkClassName,
}: {
  className?: string | undefined;
  markClassName?: string | undefined;
  wordmarkClassName?: string | undefined;
}) {
  return (
    <span className={className}>
      <BrandMark className={markClassName} />
      <span className={wordmarkClassName}>OpenCalendly</span>
    </span>
  );
}
