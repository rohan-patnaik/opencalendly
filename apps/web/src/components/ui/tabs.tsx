import type { ReactNode } from 'react';

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
  return (
    <div className={styles.tabs} role="tablist" aria-label="Sections">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === activeId}
          data-active={item.id === activeId}
          className={styles.tabButton}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
