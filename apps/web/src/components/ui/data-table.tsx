import type { ReactNode } from 'react';

import styles from './primitives.module.css';

type DataTableProps = {
  head: ReactNode;
  body: ReactNode;
  className?: string;
};

export function DataTable({ head, body, className }: DataTableProps) {
  return (
    <div className={[styles.tableWrap, className ?? ''].filter(Boolean).join(' ')}>
      <table className={styles.table}>
        <thead>{head}</thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  );
}
