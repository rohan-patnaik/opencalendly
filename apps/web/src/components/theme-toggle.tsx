'use client';

import { useEffect, useState } from 'react';

import {
  THEME_EVENT,
  applyTheme,
  nextThemePreference,
  readThemePreference,
  resolveTheme,
  writeThemePreference,
  type ThemePreference,
} from '../lib/theme';

const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
    <path
      d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M20.354 15.354A9 9 0 118.646 3.646a7 7 0 1011.708 11.708z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SystemIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
    <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

type ThemeToggleProps = {
  className?: string | undefined;
};

export default function ThemeToggle({ className }: ThemeToggleProps) {
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const refresh = () => {
      const current = readThemePreference();
      setPreference(current);
      const resolved = resolveTheme(current);
      setResolvedTheme(resolved);
      applyTheme(current);
    };

    refresh();
    window.addEventListener(THEME_EVENT, refresh);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSchemeChange = () => refresh();
    media.addEventListener('change', onSchemeChange);

    return () => {
      window.removeEventListener(THEME_EVENT, refresh);
      media.removeEventListener('change', onSchemeChange);
    };
  }, []);

  const toggle = () => {
    const next = nextThemePreference(preference);
    writeThemePreference(next);
    setPreference(next);
    setResolvedTheme(resolveTheme(next));
  };

  const nextMode = nextThemePreference(preference);
  const nextLabel =
    nextMode === 'system'
      ? 'Switch theme to system'
      : nextMode === 'dark'
        ? 'Switch theme to dark'
        : 'Switch theme to light';
  const title = `Current theme: ${preference} (${resolvedTheme}). ${nextLabel}.`;

  return (
    <button
      type="button"
      className={className}
      onClick={toggle}
      aria-label={nextLabel}
      title={title}
    >
      {preference === 'system' ? (
        <SystemIcon />
      ) : resolvedTheme === 'dark' ? (
        <SunIcon />
      ) : (
        <MoonIcon />
      )}
    </button>
  );
}
