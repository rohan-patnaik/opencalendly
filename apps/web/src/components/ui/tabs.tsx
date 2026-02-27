import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import styles from './primitives.module.css';

type TabItem = {
  id: string;
  label: ReactNode;
};

type TabsProps = {
  items: TabItem[];
  activeId: string;
  onChange: (nextId: string) => void;
};

export function Tabs({ items, activeId, onChange }: TabsProps) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const focusTabById = (tabId: string) => {
    tabRefs.current[tabId]?.focus();
  };

  const getNextId = (index: number, offset: number): string => {
    const nextIndex = (index + offset + items.length) % items.length;
    return items[nextIndex]?.id ?? items[0]?.id ?? '';
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (items.length === 0) {
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const nextId = getNextId(index, 1);
      onChange(nextId);
      focusTabById(nextId);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const nextId = getNextId(index, -1);
      onChange(nextId);
      focusTabById(nextId);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      const firstId = items[0]?.id ?? '';
      onChange(firstId);
      focusTabById(firstId);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      const lastId = items[items.length - 1]?.id ?? '';
      onChange(lastId);
      focusTabById(lastId);
    }
  };

  return (
    <div className={styles.tabs} role="tablist" aria-label="Sections">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          tabIndex={item.id === activeId ? 0 : -1}
          aria-selected={item.id === activeId}
          className={styles.tabButton}
          ref={(element) => {
            tabRefs.current[item.id] = element;
          }}
          onKeyDown={(event) => onKeyDown(event, index)}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
