export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'opencalendly.theme';
export const THEME_EVENT = 'opencalendly:theme-changed';

const isBrowser = (): boolean => typeof window !== 'undefined';

const isThemePreference = (value: string | null): value is ThemePreference => {
  return value === 'light' || value === 'dark' || value === 'system';
};

const getSystemTheme = (): 'light' | 'dark' => {
  if (!isBrowser()) {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const emitThemeChange = () => {
  if (!isBrowser()) {
    return;
  }
  window.dispatchEvent(new Event(THEME_EVENT));
};

export const readThemePreference = (): ThemePreference => {
  if (!isBrowser()) {
    return 'system';
  }
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : 'system';
  } catch {
    return 'system';
  }
};

export const resolveTheme = (preference: ThemePreference): 'light' | 'dark' => {
  return preference === 'system' ? getSystemTheme() : preference;
};

export const applyTheme = (preference: ThemePreference): void => {
  if (!isBrowser()) {
    return;
  }
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
};

export const writeThemePreference = (preference: ThemePreference): void => {
  if (!isBrowser()) {
    return;
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Swallow storage write failures (private mode or blocked storage) and still apply runtime theme.
  }
  applyTheme(preference);
  emitThemeChange();
};

export const nextThemePreference = (currentPreference: ThemePreference): ThemePreference => {
  if (currentPreference === 'system') {
    return 'dark';
  }
  if (currentPreference === 'dark') {
    return 'light';
  }
  return 'system';
};
