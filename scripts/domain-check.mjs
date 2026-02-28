import { resolve4, resolve6, resolveCname } from 'node:dns/promises';

const getArgValue = (flag) => {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
};

const appDomain = getArgValue('--app-domain') || 'opencalendly.com';
const apiDomain = getArgValue('--api-domain') || 'api.opencalendly.com';

const failures = [];
const DEFAULT_TIMEOUT_MS = 10_000;

const fetchWithTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const checkDns = async (domain) => {
  const ipv4 = await resolve4(domain).catch(() => []);
  const ipv6 = await resolve6(domain).catch(() => []);
  const cnames = await resolveCname(domain).catch(() => []);

  if (ipv4.length === 0 && ipv6.length === 0 && cnames.length === 0) {
    failures.push(`${domain}: no A/AAAA/CNAME DNS answer found.`);
    return;
  }

  console.log(
    `${domain}: DNS OK (A=${ipv4.join(', ') || 'none'}, AAAA=${ipv6.join(', ') || 'none'}, CNAME=${cnames.join(', ') || 'none'})`,
  );
};

const checkAppHost = async () => {
  const url = `https://${appDomain}`;
  let response;
  try {
    response = await fetchWithTimeout(url, { redirect: 'follow' });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      failures.push(`${url}: request timed out after ${DEFAULT_TIMEOUT_MS}ms.`);
      return;
    }
    failures.push(`${url}: request failed (${error instanceof Error ? error.message : String(error)}).`);
    return;
  }
  const finalHost = new URL(response.url).hostname;

  if (finalHost.includes('l.ink')) {
    failures.push(`${url}: still forwarding to ${finalHost}. Remove URL forwarding in Porkbun.`);
    return;
  }

  if (!response.ok) {
    failures.push(`${url}: returned HTTP ${response.status} ${response.statusText}.`);
    return;
  }

  console.log(`${url}: HTTP OK (${response.status}) final host=${finalHost}`);
};

const checkApiHealth = async () => {
  const healthUrl = `https://${apiDomain}/health`;
  let response;
  try {
    response = await fetchWithTimeout(healthUrl, { redirect: 'follow' });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      failures.push(`${healthUrl}: request timed out after ${DEFAULT_TIMEOUT_MS}ms.`);
      return;
    }
    failures.push(
      `${healthUrl}: request failed (${error instanceof Error ? error.message : String(error)}).`,
    );
    return;
  }
  const finalHost = new URL(response.url).hostname;

  if (finalHost.includes('l.ink')) {
    failures.push(`${healthUrl}: still forwarding to ${finalHost}. Point api subdomain to Cloudflare Worker route.`);
    return;
  }

  if (finalHost !== apiDomain) {
    failures.push(`${healthUrl}: resolved to unexpected host ${finalHost}.`);
    return;
  }

  if (!response.ok) {
    failures.push(`${healthUrl}: returned HTTP ${response.status} ${response.statusText}.`);
    return;
  }

  let json;
  try {
    json = await response.json();
  } catch {
    failures.push(`${healthUrl}: response is not JSON.`);
    return;
  }

  if (json?.status !== 'ok') {
    failures.push(`${healthUrl}: expected {"status":"ok"}, got ${JSON.stringify(json)}.`);
    return;
  }

  console.log(`${healthUrl}: API health OK.`);
};

try {
  console.log(`Checking production domains: app=${appDomain}, api=${apiDomain}`);
  await checkDns(appDomain);
  await checkDns(apiDomain);
  await checkAppHost();
  await checkApiHealth();

  if (failures.length > 0) {
    console.error('\nDomain check failed:\n');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('\nDomain check passed.');
} catch (error) {
  console.error(`Domain check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
