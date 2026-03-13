'use client';

import { Children, useEffect, useMemo, useState, type ReactNode } from 'react';
import styles from './hero-art-carousel.module.css';

interface HeroArtCarouselProps {
  children: [ReactNode, ReactNode];
}

const INTERVAL_MS = 5000;

export function HeroArtCarousel({ children }: HeroArtCarouselProps) {
  const slides = useMemo(() => Children.toArray(children), [children]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncReducedMotion = () => {
      setReducedMotion(mediaQuery.matches);
    };

    syncReducedMotion();
    mediaQuery.addEventListener('change', syncReducedMotion);

    return () => {
      mediaQuery.removeEventListener('change', syncReducedMotion);
    };
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setActiveIndex(0);
      return undefined;
    }

    const id = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % slides.length);
    }, INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [reducedMotion, slides.length]);

  return (
    <div className={styles.carousel}>
      {slides.map((slide, index) => {
        const isActive = activeIndex === index;

        return (
          <div
            key={index}
            className={`${styles.slide} ${isActive ? styles.slideActive : styles.slideHidden}`}
            aria-hidden={!isActive}
          >
            {slide}
          </div>
        );
      })}
    </div>
  );
}
