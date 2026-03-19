import net from 'node:net';

const [rawPort, ...labelParts] = process.argv.slice(2);
const port = Number.parseInt(rawPort ?? '', 10);
const label = labelParts.join(' ').trim() || `port ${rawPort ?? 'unknown'}`;

if (!Number.isInteger(port) || port <= 0) {
  console.error('Usage: node scripts/ensure-dev-port.mjs <port> [label]');
  process.exit(1);
}

const server = net.createServer();

server.once('error', (error) => {
  if ((error && typeof error === 'object' && 'code' in error && error.code) === 'EADDRINUSE') {
    console.error(`${label} is already in use. Stop the existing process before starting local dev.`);
    process.exit(1);
  }

  console.error(`Unable to verify ${label}: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exit(1);
});

server.listen(port, () => {
  server.close(() => process.exit(0));
});
