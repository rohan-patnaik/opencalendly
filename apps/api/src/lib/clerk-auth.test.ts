import { describe, expect, it } from 'vitest';

import {
  deriveUsernameSeedFromEmail,
  normalizeUsernameCandidate,
  resolveDisplayName,
  resolveUniqueUsername,
} from './clerk-auth';

describe('clerk auth helpers', () => {
  it('normalizes username candidates to slug-safe lowercase values', () => {
    expect(normalizeUsernameCandidate('  Rohan Patnaik  ')).toBe('rohan-patnaik');
    expect(normalizeUsernameCandidate('___Invalid***')).toBe('invalid');
    expect(normalizeUsernameCandidate('rohan-patnaik-'.repeat(10))).not.toMatch(/-$/);
  });

  it('derives username seeds from email local part', () => {
    expect(deriveUsernameSeedFromEmail('Demo.User+1@example.com')).toBe('demo-user-1');
  });

  it('resolves display name from explicit input first', () => {
    expect(
      resolveDisplayName({
        providedDisplayName: 'OpenCalendly Demo',
        clerkFirstName: 'Rohan',
        clerkLastName: 'Patnaik',
        email: 'demo@example.com',
      }),
    ).toBe('OpenCalendly Demo');
  });

  it('falls back to Clerk name when display name is missing', () => {
    expect(
      resolveDisplayName({
        clerkFirstName: 'Rohan',
        clerkLastName: 'Patnaik',
        email: 'demo@example.com',
      }),
    ).toBe('Rohan Patnaik');
  });

  it('resolves unique username by suffixing collisions', async () => {
    const taken = new Set(['demo', 'demo-1']);
    const candidate = await resolveUniqueUsername({
      preferredCandidate: 'demo',
      email: 'demo@example.com',
      isUsernameTaken: async (value) => taken.has(value),
    });

    expect(candidate).toBe('demo-2');
  });

  it('falls back to tokenized username after exhausting numeric suffixes', async () => {
    const generatedTokens = ['abcdef12', 'fallback1'];
    const candidate = await resolveUniqueUsername({
      preferredCandidate: 'demo',
      email: 'demo@example.com',
      isUsernameTaken: async (value) => {
        if (value === 'demo') {
          return true;
        }
        const match = /^demo-(\d+)$/.exec(value);
        if (match) {
          return Number.parseInt(match[1] ?? '', 10) < 500;
        }
        return value === 'demo-abcdef12';
      },
      tokenGenerator: () => generatedTokens.shift() ?? 'fallback2',
    });

    expect(candidate).toBe('demo-fallback-1');
  });
});
