import { describe, expect, it } from 'vitest';
import { rebalanceGroup, MIN_CHILD_DURATION } from '@/utils/groupRebalance';

describe('rebalanceGroup', () => {
  it('returns empty array for empty input', () => {
    expect(rebalanceGroup([], 30)).toEqual([]);
  });

  it('rejects when group cannot fit min-duration per child', () => {
    const result = rebalanceGroup(
      [
        { id: 'a', preferredDuration: 10, groupOrder: 0 },
        { id: 'b', preferredDuration: 10, groupOrder: 1 },
        { id: 'c', preferredDuration: 10, groupOrder: 2 },
      ],
      10, // only fits 2x5min, not 3
    );
    expect(result).toBeNull();
  });

  it('preserves preferred durations and packs from start when total <= group', () => {
    // Empty 30-min group, drop in a 15-min task.
    const r = rebalanceGroup(
      [{ id: 'a', preferredDuration: 15, groupOrder: 0 }],
      30,
    );
    expect(r).toEqual([{ id: 'a', duration: 15, offsetMinutes: 0 }]);
  });

  it('matches the spec example: 30-min group, then 15+30+15 dropped in', () => {
    // Step 1: drop 15 into empty 30 → fills first 15, leaves 15 trailing gap
    const step1 = rebalanceGroup(
      [{ id: 'a', preferredDuration: 15, groupOrder: 0 }],
      30,
    );
    expect(step1).toEqual([{ id: 'a', duration: 15, offsetMinutes: 0 }]);

    // Step 2: add a 30-min preferred task
    // sum=45 > 30 → squeeze. scale = 30/45 = 0.667.
    // 15 * 0.667 = 10, 30 * 0.667 = 20. Sum = 30. ✓
    const step2 = rebalanceGroup(
      [
        { id: 'a', preferredDuration: 15, groupOrder: 0 },
        { id: 'b', preferredDuration: 30, groupOrder: 1 },
      ],
      30,
    );
    expect(step2).toEqual([
      { id: 'a', duration: 10, offsetMinutes: 0 },
      { id: 'b', duration: 20, offsetMinutes: 10 },
    ]);

    // Step 3: add a third 15-min preferred task
    // sum=60, groupDuration=30, scale=0.5.
    // 15→7.5→rounds to 10 (min/round). 30→15. 15→7.5→10.
    // Sum = 35, need 30, diff = -5 → trim from largest (b: 15→10). Sum=30. ✓
    const step3 = rebalanceGroup(
      [
        { id: 'a', preferredDuration: 15, groupOrder: 0 },
        { id: 'b', preferredDuration: 30, groupOrder: 1 },
        { id: 'c', preferredDuration: 15, groupOrder: 2 },
      ],
      30,
    );
    expect(step3).toEqual([
      { id: 'a', duration: 10, offsetMinutes: 0 },
      { id: 'b', duration: 10, offsetMinutes: 10 },
      { id: 'c', duration: 10, offsetMinutes: 20 },
    ]);
  });

  it('honors the 5-minute floor when squeezing many small children', () => {
    // 15-min group, 4 children of 10 each → preferredSum=40
    // scale=0.375, 10*0.375=3.75 → floored to 5. All children = 5. Sum = 20 > 15.
    // The algorithm should still respect the floor and absorb overflow elsewhere
    // (this case may not perfectly hit groupDuration because of the floor).
    const r = rebalanceGroup(
      [
        { id: 'a', preferredDuration: 10, groupOrder: 0 },
        { id: 'b', preferredDuration: 10, groupOrder: 1 },
        { id: 'c', preferredDuration: 10, groupOrder: 2 },
      ],
      15,
    );
    expect(r).not.toBeNull();
    for (const child of r!) {
      expect(child.duration).toBeGreaterThanOrEqual(MIN_CHILD_DURATION);
    }
    // For a 15-min group with 3 children at 5min floor, total = 15
    expect(r!.reduce((s, c) => s + c.duration, 0)).toBe(15);
  });

  it('respects groupOrder when laying out children', () => {
    // Pass children in scrambled order; offsets should follow groupOrder.
    const r = rebalanceGroup(
      [
        { id: 'second', preferredDuration: 10, groupOrder: 1 },
        { id: 'first', preferredDuration: 10, groupOrder: 0 },
        { id: 'third', preferredDuration: 10, groupOrder: 2 },
      ],
      30,
    );
    expect(r).not.toBeNull();
    const byId = Object.fromEntries(r!.map((c) => [c.id, c]));
    expect(byId.first.offsetMinutes).toBe(0);
    expect(byId.second.offsetMinutes).toBe(10);
    expect(byId.third.offsetMinutes).toBe(20);
  });

  it('preserves input order in returned array', () => {
    const r = rebalanceGroup(
      [
        { id: 'b', preferredDuration: 10, groupOrder: 1 },
        { id: 'a', preferredDuration: 10, groupOrder: 0 },
      ],
      30,
    );
    expect(r!.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('exact-fit case: preferredSum equals groupDuration', () => {
    const r = rebalanceGroup(
      [
        { id: 'a', preferredDuration: 15, groupOrder: 0 },
        { id: 'b', preferredDuration: 15, groupOrder: 1 },
      ],
      30,
    );
    expect(r).toEqual([
      { id: 'a', duration: 15, offsetMinutes: 0 },
      { id: 'b', duration: 15, offsetMinutes: 15 },
    ]);
  });
});
