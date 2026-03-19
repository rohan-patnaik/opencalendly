import { enqueueCalendarWritebacksForBooking } from './calendar-writeback-queue';
import type { Database } from './types';

export const emptyWritebackResult = {
  queued: 0,
  processed: 0,
  succeeded: 0,
  retried: 0,
  failed: 0,
  deferred: false,
};

export const mergeWritebackResults = (
  ...results: Array<{
    queued: number;
    processed: number;
    succeeded: number;
    retried: number;
    failed: number;
    deferred: boolean;
  }>
) => {
  return results.reduce(
    (merged, result) => ({
      queued: merged.queued + result.queued,
      processed: merged.processed + result.processed,
      succeeded: merged.succeeded + result.succeeded,
      retried: merged.retried + result.retried,
      failed: merged.failed + result.failed,
      deferred: merged.deferred || result.deferred,
    }),
    { ...emptyWritebackResult },
  );
};

export const queueCalendarWriteback = async (
  db: Database,
  input: Parameters<typeof enqueueCalendarWritebacksForBooking>[1],
) => {
  const queue = await enqueueCalendarWritebacksForBooking(db, input);
  if (queue.queued === 0) {
    return emptyWritebackResult;
  }

  return {
    queued: queue.queued,
    processed: 0,
    succeeded: 0,
    retried: 0,
    failed: 0,
    deferred: true,
  };
};
