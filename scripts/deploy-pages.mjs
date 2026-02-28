import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const run = (command, args) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      cwd: process.cwd(),
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

const isProduction = process.argv.includes('--production');
const pagesProject = process.env.CLOUDFLARE_PAGES_PROJECT?.trim();
const productionBranch = process.env.CLOUDFLARE_PAGES_PRODUCTION_BRANCH?.trim() || 'main';

if (!pagesProject) {
  console.error(
    'CLOUDFLARE_PAGES_PROJECT is required. Set it in your shell/.env before deploying web to Pages.',
  );
  process.exit(1);
}

const outputDir = resolve(process.cwd(), 'apps/web/.vercel/output/static');

try {
  console.log('Building web app for Cloudflare Pages...');
  await run('npm', ['run', 'pages:build', '-w', 'apps/web']);

  if (!existsSync(outputDir)) {
    throw new Error(
      `Pages output directory not found at ${outputDir}. Ensure next-on-pages build completed successfully.`,
    );
  }

  const deployArgs = ['wrangler', 'pages', 'deploy', outputDir, '--project-name', pagesProject];
  if (isProduction) {
    deployArgs.push('--branch', productionBranch);
  }

  console.log(
    `Deploying ${isProduction ? 'production' : 'preview'} Pages build to project ${pagesProject}...`,
  );
  await run('npx', deployArgs);

  console.log('Pages deployment finished successfully.');
} catch (error) {
  console.error(`Pages deployment failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
