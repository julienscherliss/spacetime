import { describe, expect, it, vi } from 'vitest';
import { createForegroundRefresh } from '@/lib/foregroundRefresh';

const deferred = () => {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>(r => { resolve = r; });
  return { promise, resolve };
};
function fixture() {
  let current = true;
  const flush = vi.fn(async () => true);
  const load = vi.fn(async () => true);
  const entry = vi.fn();
  const coordinator = createForegroundRefresh({ isCurrent: () => current, flush, load, entry });
  return { coordinator, flush, load, entry, switchAccount: () => { current = false; } };
}
describe('foreground refresh ordering', () => {
  it('deduplicates active events, flushes before reading, and finishes once', async () => {
    const h = fixture();
    await h.coordinator.activity(true);
    expect(h.load).not.toHaveBeenCalled();
    await h.coordinator.activity(false);
    h.flush.mockClear();
    const order: string[] = [];
    h.flush.mockImplementation(async () => { order.push('flush'); return true; });
    h.load.mockImplementation(async () => { order.push('load'); return true; });
    await Promise.all([h.coordinator.activity(true), h.coordinator.activity(true)]);
    expect(order).toEqual(['flush', 'load']);
    expect(h.entry.mock.calls.map(([, phase]) => phase)).toEqual(['cancel', 'start', 'finish']);
  });
  it('does not overwrite unsaved local data when flushing fails, still settles the entry', async () => {
    const h = fixture();
    await h.coordinator.activity(false);
    h.flush.mockResolvedValue(false);
    await h.coordinator.activity(true);
    expect(h.load).not.toHaveBeenCalled();
    expect(h.entry).toHaveBeenLastCalledWith(2, 'finish');
  });
  it('settles a failed or throwing read without leaving navigation waiting forever', async () => {
    const h = fixture();
    await h.coordinator.activity(false);
    h.load.mockRejectedValue(new Error('offline'));
    await h.coordinator.activity(true);
    expect(h.entry).toHaveBeenLastCalledWith(2, 'finish');
  });
  it('cancels a superseded entry, serializes reads and uses the newest generation', async () => {
    const h = fixture();
    await h.coordinator.activity(false);
    const first = deferred();
    h.load.mockReturnValueOnce(first.promise);
    const old = h.coordinator.activity(true);
    await vi.waitFor(() => expect(h.load).toHaveBeenCalledTimes(1));
    void h.coordinator.activity(false);
    const next = h.coordinator.activity(true);
    expect(h.load).toHaveBeenCalledTimes(1);
    first.resolve(true);
    await Promise.all([old, next]);
    expect(h.load).toHaveBeenCalledTimes(2);
    expect(h.entry.mock.calls.filter(([, phase]) => phase === 'finish')).toEqual([[4, 'finish']]);
  });
  it('flushes background changes immediately even while a remote read is pending', async () => {
    const h = fixture();
    await h.coordinator.activity(false);
    const read = deferred(); h.load.mockReturnValue(read.promise);
    const returning = h.coordinator.activity(true);
    await vi.waitFor(() => expect(h.load).toHaveBeenCalled());
    h.flush.mockClear();
    await h.coordinator.activity(false);
    expect(h.flush).toHaveBeenCalledTimes(1);
    read.resolve(true); await returning;
    expect(h.entry.mock.calls.filter(([, phase]) => phase === 'finish')).toEqual([]);
  });
  it.each(['account', 'dispose'])('drops late completion after %s change', async kind => {
    const h = fixture();
    await h.coordinator.activity(false);
    const read = deferred();
    h.load.mockReturnValue(read.promise);
    const pending = h.coordinator.activity(true);
    await vi.waitFor(() => expect(h.load).toHaveBeenCalled());
    if (kind === 'account') h.switchAccount(); else h.coordinator.dispose();
    read.resolve(true); await pending;
    expect(h.entry.mock.calls.filter(([, phase]) => phase === 'finish')).toEqual([]);
  });
});
