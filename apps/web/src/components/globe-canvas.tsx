'use client';

import { useEffect, useRef, useState } from 'react';
import createGlobe from 'cobe';
import { usePrefersReducedMotion } from '../lib/use-prefers-reduced-motion';
import styles from './globe-canvas.module.css';

/** Small orbiting dots rendered as absolutely-positioned elements around the canvas. */
const SATELLITES = [
  { radius: 54, speed: 0.012, size: 5, delay: 0 },
  { radius: 48, speed: -0.009, size: 4, delay: Math.PI * 0.7 },
  { radius: 51, speed: 0.007, size: 3, delay: Math.PI * 1.4 },
];

export function GlobeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const resolveTheme = (): boolean => {
      const explicit = document.documentElement.getAttribute('data-theme');
      if (explicit === 'light') return false;
      if (explicit === 'dark') return true;
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    };

    setIsDark(resolveTheme());

    // Watch for data-theme attribute changes (from ThemeToggle)
    const observer = new MutationObserver(() => setIsDark(resolveTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    // Also listen for system preference changes as fallback
    const matcher = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setIsDark(resolveTheme());
    matcher.addEventListener('change', onChange);

    return () => {
      observer.disconnect();
      matcher.removeEventListener('change', onChange);
    };
  }, []);

  /* ---- cobe globe ---- */
  useEffect(() => {
    if (isDark === null) {
      return undefined;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const webGlContext =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    if (!webGlContext) {
      return undefined;
    }

    let phi = 0;
    let width = 0;

    const onResize = () => {
      width = canvas.offsetWidth;
    };

    window.addEventListener('resize', onResize);
    onResize();

    let globe: ReturnType<typeof createGlobe> | null = null;

    /*
     * Light mode: warm cream surface with deep amber/brown land dots.
     * Dark mode:  rich dark surface with glowing amber land dots.
     */
    try {
      globe = createGlobe(canvas, {
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        width: width * 2,
        height: width * 2,
        phi: 0,
        theta: 0.25,
        dark: isDark ? 1 : 0,
        diffuse: isDark ? 2.4 : 1.6,
        mapSamples: 20000,
        mapBrightness: isDark ? 10 : 3.5,
        mapBaseBrightness: isDark ? 0.05 : 0.02,
        baseColor: isDark ? [0.18, 0.15, 0.12] : [0.96, 0.94, 0.9],
        markerColor: isDark ? [0.85, 0.63, 0.4] : [0.72, 0.45, 0.15],
        glowColor: isDark ? [0.22, 0.16, 0.1] : [0.92, 0.88, 0.82],
        markers: [],
        onRender: (state) => {
          state.phi = phi;
          phi += reducedMotion ? 0 : 0.005;
          state.width = width * 2;
          state.height = width * 2;
        },
      });
    } catch {
      window.removeEventListener('resize', onResize);
      return undefined;
    }

    return () => {
      globe?.destroy();
      window.removeEventListener('resize', onResize);
    };
  }, [reducedMotion, isDark]);

  /* ---- orbiting satellites ---- */
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return undefined;
    }

    const dots = wrapper.querySelectorAll<HTMLSpanElement>(`.${styles.satellite}`);

    dots.forEach((dot, index) => {
      const { radius, delay } = SATELLITES[index]!;
      const x = 50 + radius * Math.cos(delay);
      const y = 50 + radius * Math.sin(delay) * 0.45;
      dot.style.left = `${x}%`;
      dot.style.top = `${y}%`;
    });

    if (reducedMotion) {
      return undefined;
    }

    let raf = 0;
    let t = 0;

    const animate = () => {
      t += 1;
      dots.forEach((dot, index) => {
        const { radius, speed, delay } = SATELLITES[index]!;
        const angle = t * speed + delay;
        const x = 50 + radius * Math.cos(angle);
        const y = 50 + radius * Math.sin(angle) * 0.45;
        dot.style.left = `${x}%`;
        dot.style.top = `${y}%`;
      });
      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <canvas ref={canvasRef} className={styles.globe} aria-hidden="true" />
      {SATELLITES.map((satellite, index) => (
        <span
          key={index}
          className={styles.satellite}
          style={{ width: satellite.size, height: satellite.size }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
