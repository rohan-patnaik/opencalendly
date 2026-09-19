import { createServer } from 'node:net';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ensureDevPort, parseDevPort } from '../../../scripts/ensure-dev-port.mjs';

describe('dev port guard', () => {
  it.each([undefined, '', '0', '65536', '-1', '3000abc', '3.5', ' 3000', '1e3'])(
    'rejects invalid port %s',
    (port) => expect(() => parseDevPort(port)).toThrow('between 1 and 65535'),
  );

  it.each(['1', '3000', '8787', '65535'])('accepts valid port %s', (port) => {
    expect(parseDevPort(port)).toBe(Number(port));
  });

  it('rejects an occupied port and releases its own availability probe', async () => {
    const server = createServer();
    await new Promise<void>((resolveReady, reject) => {
      server.once('error', reject);
      server.listen(0, resolveReady);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP port');
    const port = String(address.port);
    try {
      await expect(ensureDevPort(port)).rejects.toThrow(`Port ${port} is already in use`);
    } finally {
      await new Promise<void>((resolveClosed, reject) => {
        server.close((error) => (error ? reject(error) : resolveClosed()));
      });
    }
    await expect(ensureDevPort(port)).resolves.toBeUndefined();
    await expect(ensureDevPort(port)).resolves.toBeUndefined();
  });

  it('exits unsuccessfully with a clear CLI error for partial numeric input', () => {
    expect(() =>
      execFileSync(process.execPath, [resolve('scripts/ensure-dev-port.mjs'), '3000oops'], {
        stdio: 'pipe',
      }),
    ).toThrow('Dev port must be an integer between 1 and 65535');
  });
});
