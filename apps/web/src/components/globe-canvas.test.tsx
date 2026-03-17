// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobeCanvas } from './globe-canvas';

const { createGlobeMock } = vi.hoisted(() => ({
  createGlobeMock: vi.fn(),
}));

vi.mock('cobe', () => ({
  default: createGlobeMock,
}));

type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

class ResizeObserverMock {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: target.getBoundingClientRect(),
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }

  disconnect() {}
}

describe('GlobeCanvas', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({
        matches: false,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => true),
      })),
    });

    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: 1,
    });

    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverMock,
    });

    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({
        drawingBufferWidth: 448,
        drawingBufferHeight: 448,
      })),
    });

    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({
        width: 448,
        height: 448,
        top: 0,
        left: 0,
        right: 448,
        bottom: 448,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })),
    });

    createGlobeMock.mockReturnValue({
      destroy: vi.fn(),
    });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    createGlobeMock.mockReset();
    vi.restoreAllMocks();
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('passes measured pixel dimensions into cobe instead of a hardcoded multiplier', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;

    act(() => {
      root?.render(React.createElement(GlobeCanvas));
    });

    expect(createGlobeMock).toHaveBeenCalledTimes(1);

    const [, options] = createGlobeMock.mock.calls[0]!;

    expect(options.devicePixelRatio).toBe(1);
    expect(options.width).toBe(448);
    expect(options.height).toBe(448);

    const state: Record<string, number> = {};
    options.onRender(state);

    expect(state.width).toBe(448);
    expect(state.height).toBe(448);
  });

  it('scales globe dimensions by device pixel ratio', () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: 2,
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;

    act(() => {
      root?.render(React.createElement(GlobeCanvas));
    });

    expect(createGlobeMock).toHaveBeenCalledTimes(1);

    const [, options] = createGlobeMock.mock.calls[0]!;
    expect(options.devicePixelRatio).toBe(2);
    expect(options.width).toBe(896);
    expect(options.height).toBe(896);
  });
});
