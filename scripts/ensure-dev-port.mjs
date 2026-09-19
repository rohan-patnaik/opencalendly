import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const parseDevPort = (value) => {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error('Dev port must be an integer between 1 and 65535.');
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('Dev port must be an integer between 1 and 65535.');
  }
  return port;
};

export const ensureDevPort = async (value) => {
  const port = parseDevPort(value);
  await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', (error) => {
      reject(
        new Error(
          error.code === 'EADDRINUSE'
            ? `Port ${port} is already in use. Stop the existing server before starting dev; auth requires this port.`
            : `Cannot use dev port ${port}: ${error.message}`,
        ),
      );
    });
    server.listen({ port, exclusive: true }, () => {
      server.close((error) => (error ? reject(error) : resolvePort()));
    });
  });
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await ensureDevPort(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
