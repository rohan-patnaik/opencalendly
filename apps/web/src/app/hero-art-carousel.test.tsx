// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeroArtCarousel } from './hero-art-carousel';

type MatchMediaController = {
  setMatches: (matches: boolean) => void;
};

type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const createMatchMediaController = (initialMatches = false): MatchMediaController => {
  let matches = initialMatches;
  const listeners = new Set<() => void>();

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(() => ({
      get matches() {
        return matches;
      },
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: (_event: 'change', listener: () => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_event: 'change', listener: () => void) => {
        listeners.delete(listener);
      },
      addListener: (listener: () => void) => {
        listeners.add(listener);
      },
      removeListener: (listener: () => void) => {
        listeners.delete(listener);
      },
      dispatchEvent: () => true,
    })),
  });

  return {
    setMatches(nextMatches) {
      matches = nextMatches;
      listeners.forEach((listener) => listener());
    },
  };
};

describe('HeroArtCarousel', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = false;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const renderCarousel = (reducedMotion = false) => {
    const controller = createMatchMediaController(reducedMotion);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;

    act(() => {
      root?.render(
        <HeroArtCarousel>
          <div>Calendar art</div>
          <div>Globe art</div>
        </HeroArtCarousel>,
      );
    });

    return controller;
  };

  it('rotates slides on the interval when motion is enabled', () => {
    vi.useFakeTimers();
    renderCarousel();

    expect(container?.textContent).toContain('Calendar art');
    expect(container?.textContent).not.toContain('Globe art');

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(container?.textContent).toContain('Globe art');
    expect(container?.textContent).not.toContain('Calendar art');
  });

  it('resets to the first slide and stops rotating when reduced motion is enabled', () => {
    vi.useFakeTimers();
    const controller = renderCarousel();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(container?.textContent).toContain('Globe art');

    act(() => {
      controller.setMatches(true);
    });

    expect(container?.textContent).toContain('Calendar art');
    expect(container?.textContent).not.toContain('Globe art');

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(container?.textContent).toContain('Calendar art');
    expect(container?.textContent).not.toContain('Globe art');
  });
});
