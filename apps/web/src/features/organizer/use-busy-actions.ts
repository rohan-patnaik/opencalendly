'use client';

import { useCallback, useState } from 'react';

export const useBusyActions = () => {
  const [busyActions, setBusyActions] = useState<Set<string>>(new Set());

  const beginBusy = useCallback((action: string) => {
    setBusyActions((previous) => {
      const next = new Set(previous);
      next.add(action);
      return next;
    });
  }, []);

  const endBusy = useCallback((action: string) => {
    setBusyActions((previous) => {
      const next = new Set(previous);
      next.delete(action);
      return next;
    });
  }, []);

  const isBusy = useCallback(
    (action: string) => {
      return busyActions.has(action);
    },
    [busyActions],
  );

  return {
    busyActions,
    beginBusy,
    endBusy,
    isBusy,
  };
};
