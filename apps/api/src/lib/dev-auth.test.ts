import { describe, expect, it } from 'vitest';

import {
  isDevAuthBootstrapEnabled,
  isLocalBootstrapRequest,
  isLocalOriginValue,
} from './dev-auth';

describe('dev auth helpers', () => {
  it('enables bootstrap only for explicit true', () => {
    expect(isDevAuthBootstrapEnabled('true')).toBe(true);
    expect(isDevAuthBootstrapEnabled(' TRUE ')).toBe(true);
    expect(isDevAuthBootstrapEnabled('false')).toBe(false);
    expect(isDevAuthBootstrapEnabled(undefined)).toBe(false);
  });

  it('recognizes localhost origins', () => {
    expect(isLocalOriginValue('http://localhost:3000')).toBe(true);
    expect(isLocalOriginValue('http://127.0.0.1:3000')).toBe(true);
    expect(isLocalOriginValue('http://[::1]:3000')).toBe(true);
    expect(isLocalOriginValue('https://opencalendly.com')).toBe(false);
  });

  it('accepts local bootstrap requests with local host and origin', () => {
    const request = new Request('http://127.0.0.1:8787/v0/dev/auth/bootstrap', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
      },
    });

    expect(isLocalBootstrapRequest(request)).toBe(true);
  });

  it('accepts bootstrap requests with local referers', () => {
    const request = new Request('http://[::1]:8787/v0/dev/auth/bootstrap', {
      method: 'POST',
      headers: {
        referer: 'http://localhost:3000/organizer',
      },
    });

    expect(isLocalBootstrapRequest(request)).toBe(true);
  });

  it('rejects bootstrap requests from remote hosts', () => {
    const request = new Request('https://api.opencalendly.com/v0/dev/auth/bootstrap', {
      method: 'POST',
    });

    expect(isLocalBootstrapRequest(request)).toBe(false);
  });

  it('rejects bootstrap requests with remote origins', () => {
    const request = new Request('http://127.0.0.1:8787/v0/dev/auth/bootstrap', {
      method: 'POST',
      headers: {
        origin: 'https://opencalendly.com',
      },
    });

    expect(isLocalBootstrapRequest(request)).toBe(false);
  });

  it('rejects bootstrap requests with remote referers', () => {
    const request = new Request('http://127.0.0.1:8787/v0/dev/auth/bootstrap', {
      method: 'POST',
      headers: {
        referer: 'https://opencalendly.com/login',
      },
    });

    expect(isLocalBootstrapRequest(request)).toBe(false);
  });
});
