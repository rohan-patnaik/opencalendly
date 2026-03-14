'use client';

import { useEffect, useState } from 'react';

import styles from './page.module.css';

const FALLBACK_TIMEZONE = 'your browser timezone';

export function HomepageTimezoneBadge() {
  const [timezoneLabel, setTimezoneLabel] = useState(FALLBACK_TIMEZONE);

  useEffect(() => {
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim();
    if (browserTimezone) {
      setTimezoneLabel(browserTimezone);
    }
  }, []);

  return (
    <div className={styles.artHeader}>
      <span className={styles.artTimezoneText}>Your timezone: {timezoneLabel}</span>
    </div>
  );
}
