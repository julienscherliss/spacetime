/** Serialize flush/read on genuine foreground edges; superseded entries cannot finish. */
export function createForegroundRefresh(options: {
  isCurrent: () => boolean;
  flush: () => Promise<boolean>;
  load: () => Promise<boolean>;
  entry: (generation: number, phase: 'start' | 'finish' | 'cancel') => void;
}) {
  let active = true;
  let disposed = false;
  let generation = 0;
  let queue = Promise.resolve();
  let backgroundFlush = Promise.resolve(true);
  const current = (id: number) => !disposed && active && id === generation && options.isCurrent();
  return {
    activity(isActive: boolean) {
      if (disposed || active === isActive) return queue;
      active = isActive;
      const id = ++generation;
      options.entry(id, isActive ? 'start' : 'cancel');
      if (!isActive) {
        // Do not delay background saves behind a slow remote read. The sync
        // layer already deduplicates writes and rejects reads over local edits.
        backgroundFlush = Promise.resolve().then(() =>
          !disposed && options.isCurrent() ? options.flush() : true).catch(() => false);
        return backgroundFlush.then(() => {});
      }
      const pausedFlush = backgroundFlush;
      queue = queue.then(async () => {
        await pausedFlush;
        if (disposed || !options.isCurrent()) return;
        if (!current(id)) return;
        const flushed = await options.flush();
        if (!current(id)) return;
        // Never read stale remote data over a failed local save.
        if (flushed) await options.load();
        // A failed refresh leaves the verified in-memory snapshot usable.
        if (current(id)) options.entry(id, 'finish');
      }).catch(() => {
        if (current(id)) options.entry(id, 'finish');
      });
      return queue;
    },
    dispose() { disposed = true; ++generation; },
  };
}
