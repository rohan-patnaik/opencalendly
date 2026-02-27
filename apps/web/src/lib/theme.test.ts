import { describe, expect, it } from 'vitest';

import { nextThemePreference } from './theme';

describe('theme preference cycle', () => {
  it('cycles system -> dark -> light -> system', () => {
    expect(nextThemePreference('system')).toBe('dark');
    expect(nextThemePreference('dark')).toBe('light');
    expect(nextThemePreference('light')).toBe('system');
  });
});
