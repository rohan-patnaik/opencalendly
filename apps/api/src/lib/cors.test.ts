import { describe, expect, it } from 'vitest';

import { resolveAllowedCorsOrigins, toCorsOrigin } from './cors';

describe('toCorsOrigin', () => {
  it('returns null for empty and invalid values', () => {
    expect(toCorsOrigin(undefined)).toBeNull();
    expect(toCorsOrigin('')).toBeNull();
    expect(toCorsOrigin('   ')).toBeNull();
    expect(toCorsOrigin('not-a-url')).toBeNull();
  });

  it('returns null for non-http origins', () => {
    expect(toCorsOrigin('file:///tmp/index.html')).toBeNull();
    expect(toCorsOrigin('mailto:test@example.com')).toBeNull();
    expect(toCorsOrigin('javascript:alert(1)')).toBeNull();
  });

  it('normalizes and returns origin for valid http(s) values', () => {
    expect(toCorsOrigin('http://localhost:3000/path?x=1')).toBe('http://localhost:3000');
    expect(toCorsOrigin(' https://open-calendly.example.com/home ')).toBe(
      'https://open-calendly.example.com',
    );
  });
});

describe('resolveAllowedCorsOrigins', () => {
  it('always includes local web origins', () => {
    const origins = resolveAllowedCorsOrigins(undefined);
    expect(origins.has('http://localhost:3000')).toBe(true);
    expect(origins.has('http://127.0.0.1:3000')).toBe(true);
  });

  it('adds APP_BASE_URL origin only when valid and http(s)', () => {
    expect(resolveAllowedCorsOrigins('https://product.example.com/path')).toEqual(
      new Set([
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://product.example.com',
      ]),
    );

    expect(resolveAllowedCorsOrigins('file:///etc/passwd')).toEqual(
      new Set(['http://localhost:3000', 'http://127.0.0.1:3000']),
    );
  });
});
