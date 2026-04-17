/**
 * Group (compound task) rebalance algorithm.
 *
 * Each child has a `preferredDuration` captured when it joined the Group.
 * - If sum(preferred) <= groupDuration: each child uses its preferred size,
 *   children pack back-to-back from the group's start, trailing gap allowed.
 * - If sum(preferred) > groupDuration: scale every child down proportionally
 *   so the sum exactly equals groupDuration, with a hard floor of 5 minutes
 *   per child. Residue from rounding is distributed to the largest children
 *   first so the total matches exactly.
 *
 * This module is pure (no React/Zustand) so it can be unit-tested.
 */

export const MIN_CHILD_DURATION = 5;

export interface RebalanceChildInput {
  id: string;
  preferredDuration: number;
  /** Stable ordering inside the group (lower = earlier). */
  groupOrder: number;
}

export interface RebalanceChildOutput {
  id: string;
  /** Resulting duration in minutes. */
  duration: number;
  /** Offset from the group start, in minutes. */
  offsetMinutes: number;
}

/** Round to nearest 5-min slot, with a floor of MIN_CHILD_DURATION. */
function roundTo5(n: number): number {
  return Math.max(MIN_CHILD_DURATION, Math.round(n / 5) * 5);
}

/**
 * Compute new durations + offsets for the children of a Group.
 *
 * @param children  Group children (any order — sorted internally by groupOrder).
 * @param groupDuration  Total minutes the Group spans on the main timeline.
 * @returns Child layouts in original input order, OR null if the Group is too
 *          short to fit even MIN_CHILD_DURATION per child (caller should reject
 *          the operation that triggered the rebalance).
 */
export function rebalanceGroup(
  children: RebalanceChildInput[],
  groupDuration: number,
): RebalanceChildOutput[] | null {
  if (children.length === 0) return [];
  if (groupDuration < MIN_CHILD_DURATION * children.length) return null;

  // Sort by groupOrder for placement; we'll re-key results to input order at the end.
  const sorted = [...children].sort((a, b) => a.groupOrder - b.groupOrder);
  const preferredSum = sorted.reduce((s, c) => s + Math.max(MIN_CHILD_DURATION, c.preferredDuration), 0);

  let durations: number[];

  if (preferredSum <= groupDuration) {
    // Use preferred sizes as-is. (Trailing gap is fine.)
    durations = sorted.map((c) => Math.max(MIN_CHILD_DURATION, c.preferredDuration));
  } else {
    // Squeeze proportionally.
    const scale = groupDuration / preferredSum;
    durations = sorted.map((c) => roundTo5(Math.max(MIN_CHILD_DURATION, c.preferredDuration) * scale));

    // Reconcile rounding so the sum exactly equals groupDuration.
    let total = durations.reduce((s, d) => s + d, 0);
    let diff = groupDuration - total;

    // Indexes sorted from largest to smallest so we adjust the most flexible children first.
    const orderByLargest = durations
      .map((d, i) => ({ d, i }))
      .sort((a, b) => b.d - a.d)
      .map((x) => x.i);

    let cursor = 0;
    while (diff !== 0 && cursor < orderByLargest.length * 4) {
      const idx = orderByLargest[cursor % orderByLargest.length];
      if (diff > 0) {
        durations[idx] += 5;
        diff -= 5;
      } else {
        if (durations[idx] - 5 >= MIN_CHILD_DURATION) {
          durations[idx] -= 5;
          diff += 5;
        }
      }
      cursor++;
    }

    // If we still have stray minutes (shouldn't happen with 5-min groups), fall back
    // to absorbing on the last child.
    if (diff !== 0) {
      const lastIdx = durations.length - 1;
      durations[lastIdx] = Math.max(MIN_CHILD_DURATION, durations[lastIdx] + diff);
    }
  }

  // Build offsets back-to-back from the group start.
  const sortedResults: RebalanceChildOutput[] = [];
  let offset = 0;
  for (let i = 0; i < sorted.length; i++) {
    sortedResults.push({
      id: sorted[i].id,
      duration: durations[i],
      offsetMinutes: offset,
    });
    offset += durations[i];
  }

  // Re-key to input order.
  const byId = new Map(sortedResults.map((r) => [r.id, r]));
  return children.map((c) => byId.get(c.id)!);
}
