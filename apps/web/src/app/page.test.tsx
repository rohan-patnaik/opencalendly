import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import HomePage from './page';

(globalThis as typeof globalThis & { React?: typeof React }).React = React;

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === 'string' ? href : '#'} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('../components/globe-canvas', () => ({
  GlobeCanvas: () => <div>GlobeCanvas</div>,
}));

vi.mock('./hero-art-carousel', () => ({
  HeroArtCarousel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('./homepage-hero-actions', () => ({
  HomepageHeroActions: () => <div>HomepageHeroActions</div>,
}));

vi.mock('./homepage-timezone-badge', () => ({
  HomepageTimezoneBadge: () => <div>HomepageTimezoneBadge</div>,
}));

vi.mock('../components/ui/button', () => ({
  LinkButton: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === 'string' ? href : '#'} {...props}>
      {children}
    </a>
  ),
}));

describe('HomePage footer license', () => {
  it('renders the GPL license and never the stale MIT label', () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain('Open source · GPL-3.0-only');
    expect(html).not.toContain('MIT License');
  });
});
