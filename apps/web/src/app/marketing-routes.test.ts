import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const readAppFile = (...parts: string[]): string => {
  return readFileSync(join(process.cwd(), 'apps/web/src/app', ...parts), 'utf8');
};

describe('marketing route surface', () => {
  it('homepage includes parity sections and product route links', () => {
    const source = readAppFile('page.tsx');

    expect(source).toContain('Calendly-grade scheduling UX, fully owned by your stack.');
    expect(source).toContain('How teams run OpenCalendly');
    expect(source).toContain('Integrations + platform');
    expect(source).toContain('Pricing clarity before scale');
    expect(source).toContain('Ready to own your scheduling stack?');

    expect(source).toContain("href=\"/features\"");
    expect(source).toContain("href=\"/solutions\"");
    expect(source).toContain("href=\"/pricing\"");
    expect(source).toContain("href=\"/resources\"");
    expect(source).toContain("href: '/demo/intro-call'");
    expect(source).toContain("href: '/team/demo-team/team-intro-call'");
    expect(source).toContain("href: '/embed/playground'");
    expect(source).toContain("href: '/organizer'");
    expect(source).toContain("href: '/dashboard'");
  });

  it('marketing subroutes exist with expected content blocks', () => {
    const features = readAppFile('features', 'page.tsx');
    const solutions = readAppFile('solutions', 'page.tsx');
    const pricing = readAppFile('pricing', 'page.tsx');
    const resources = readAppFile('resources', 'page.tsx');

    expect(features).toContain('Capability matrix');
    expect(features).toContain('Booking correctness');

    expect(solutions).toContain('Who this fits best');
    expect(solutions).toContain('Founder-led product teams');

    expect(pricing).toContain('Plan preview');
    expect(pricing).toContain('Enterprise-ready');

    expect(resources).toContain('Reference links');
    expect(resources).toContain('github.com/rohan-patnaik/opencalendly/blob/main/docs/API.md');
  });

  it('app chrome navigation includes marketing routes', () => {
    const source = readFileSync(
      join(process.cwd(), 'apps/web/src/components/app-chrome.tsx'),
      'utf8',
    );

    expect(source).toContain("{ href: '/features', label: 'Features' }");
    expect(source).toContain("{ href: '/solutions', label: 'Solutions' }");
    expect(source).toContain("{ href: '/pricing', label: 'Pricing' }");
    expect(source).toContain("{ href: '/resources', label: 'Resources' }");
  });
});
