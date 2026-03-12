import { existsSync, lstatSync, readlinkSync, symlinkSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const projectJsonPath = resolve(repoRoot, '.vercel/project.json');
const rootDirectory = 'apps/web';
const rootNextPath = resolve(repoRoot, '.next');
const appNextPath = resolve(repoRoot, 'apps/web/.next');

const run = (command, args) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      cwd: repoRoot,
      env: process.env,
    });

    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });

async function ensureVercelProjectJson() {
  let projectConfig = {
    projectId: '_',
    orgId: '_',
    settings: {},
  };

  if (existsSync(projectJsonPath)) {
    const existing = JSON.parse(await readFile(projectJsonPath, 'utf8'));
    projectConfig = {
      projectId: typeof existing.projectId === 'string' && existing.projectId ? existing.projectId : '_',
      orgId: typeof existing.orgId === 'string' && existing.orgId ? existing.orgId : '_',
      settings: existing.settings && typeof existing.settings === 'object' ? existing.settings : {},
    };
  }

  const nextConfig = {
    ...projectConfig,
    settings: {
      ...projectConfig.settings,
      framework: 'nextjs',
      rootDirectory,
    },
  };

  await mkdir(dirname(projectJsonPath), { recursive: true });
  await writeFile(projectJsonPath, JSON.stringify(nextConfig));
}

async function ensureRootNextSymlink() {
  const desiredTarget = 'apps/web/.next';

  if (existsSync(rootNextPath)) {
    const stats = lstatSync(rootNextPath);
    const isCorrectSymlink =
      stats.isSymbolicLink() && readlinkSync(rootNextPath) === desiredTarget;

    if (!isCorrectSymlink) {
      await rm(rootNextPath, { recursive: true, force: true });
    }
  }

  if (!existsSync(rootNextPath)) {
    symlinkSync(
      desiredTarget,
      rootNextPath,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  }

  await mkdir(appNextPath, { recursive: true });
}

try {
  await ensureVercelProjectJson();
  await ensureRootNextSymlink();
  console.log('Building Cloudflare Pages output from repository root...');
  await run('npx', ['next-on-pages', ...process.argv.slice(2)]);
} catch (error) {
  console.error(
    `Pages build failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
