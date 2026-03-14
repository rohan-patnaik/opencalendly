'use client';

import React, { Children, useEffect, useMemo, useState, type ReactNode } from 'react';
import styles from './hero-art-carousel.module.css';

interface HeroArtCarouselProps {
  children: [ReactNode, ReactNode];
}

const INTERVAL_MS = 3000;

export function HeroArtCarousel({
  children,
}: HeroArtCarouselProps) {
  const slides = useMemo(() => Children.toArray(children), [children]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (slides.length === 0 || activeIndex < slides.length) {
      return;
    }

    setActiveIndex(0);
  }, [activeIndex, slides.length]);

  useEffect(() => {
    if (slides.length < 2) {
      return undefined;
    }

    const id = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % slides.length);
    }, INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [slides.length]);

  if (slides.length === 0) {
    return null;
  }

  return (
    <div className={styles.carousel}>
      <div key={activeIndex} className={styles.slide} data-slide-index={activeIndex}>
        {slides[activeIndex]}
      </div>
    </div>
  );
}
