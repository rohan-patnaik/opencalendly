import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const rootDir = process.cwd();
const authoredExtensions = new Set(['.ts', '.tsx', '.js', '.mjs']);
const ignoredDirs = new Set([
  '.git',
  '.next',
  '.vercel',
  '.wrangler',
  'coverage',
  'dist',
  'node_modules',
  'output',
]);

const enforce = process.argv.includes('--enforce');

const thresholdGroups = [
  {
    name: 'API composition entrypoint',
    threshold: 300,
    match: (path) => path === 'apps/api/src/index.ts',
  },
  {
    name: 'Client page shells',
    threshold: 300,
    match: (path) => path.endsWith('/page.client.tsx'),
  },
  {
    name: 'General authored modules',
    threshold: 400,
    match: (path) => {
      if (!path.startsWith('apps/') && !path.startsWith('packages/') && !path.startsWith('scripts/')) {
        return false;
      }

      const baseName = path.split('/').pop() ?? path;
      if (baseName.includes('.test.')) {
        return false;
      }
      if (baseName === 'schema.ts' || baseName === 'schemas.ts') {
        return false;
      }

      return true;
    },
  },
];

const files = [];

const walk = (directory) => {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirs.has(entry)) {
      continue;
    }

    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      walk(fullPath);
      continue;
    }

    const extension = entry.slice(entry.lastIndexOf('.'));
    if (!authoredExtensions.has(extension)) {
      continue;
    }

    const path = relative(rootDir, fullPath);
    const lineCount = readFileSync(fullPath, 'utf8').split('\n').length;
    files.push({ path, lineCount });
  }
};

walk(rootDir);

const violations = [];

for (const group of thresholdGroups) {
  const matches = files.filter((file) => group.match(file.path));
  const offenders = matches.filter((file) => file.lineCount > group.threshold);
  violations.push({ ...group, offenders });
}

console.log('Complexity guardrails');
for (const group of violations) {
  const totalMatches = files.filter((file) => group.match(file.path)).length;
  console.log(`- ${group.name}: ${group.threshold} LOC max (${totalMatches} matching files)`);
  if (group.offenders.length === 0) {
    console.log('  status: ok');
    continue;
  }

  console.log('  status: exceeds threshold');
  for (const offender of group.offenders.sort((left, right) => right.lineCount - left.lineCount)) {
    console.log(`  - ${offender.path}: ${offender.lineCount} LOC`);
  }
}

if (enforce && violations.some((group) => group.offenders.length > 0)) {
  process.exitCode = 1;
}
