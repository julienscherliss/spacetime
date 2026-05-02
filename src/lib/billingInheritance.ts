import type { TagBillingSettings } from '@/store/billingStore';

/**
 * Find the nearest billable anchor (or self) for a tag.
 * Returns the settings of the closest billable tag in the path — including
 * `parentOnly` anchors (which aren't billable themselves but mark every
 * descendant as billable).
 */
export function findBillableAncestor(
  tagValue: string,
  settings: TagBillingSettings[],
): TagBillingSettings | undefined {
  if (!tagValue) return undefined;
  const byTag = new Map(settings.map(s => [s.tagValue, s]));
  const parts = tagValue.split('/');
  for (let i = parts.length; i >= 1; i--) {
    const candidate = parts.slice(0, i).join('/');
    const s = byTag.get(candidate);
    if (s) {
      if (s.billable || s.parentOnly) return s;
      // Explicit opt-out: tag has settings but is not billable and not a
      // parent anchor. Block inheritance from any further ancestor.
      return undefined;
    }
  }
  return undefined;
}

/**
 * Returns true if tagValue is billable directly OR inherits from any ancestor.
 */
export function isBillableInherited(
  tagValue: string,
  settings: TagBillingSettings[],
): boolean {
  return !!findBillableAncestor(tagValue, settings);
}

/**
 * Returns all known billable ROOT tags — billable tags whose parent (if any)
 * is NOT billable. Useful for showing a clean list to the user.
 */
export function getBillableRoots(settings: TagBillingSettings[]): TagBillingSettings[] {
  const billable = settings.filter(s => s.billable || s.parentOnly);
  return billable.filter(s => {
    const parts = s.tagValue.split('/');
    if (parts.length === 1) return true;
    // Walk up parents — if any ancestor is billable, this isn't a root
    for (let i = parts.length - 1; i >= 1; i--) {
      const ancestor = parts.slice(0, i).join('/');
      const ancestorSettings = billable.find(b => b.tagValue === ancestor);
      if (ancestorSettings) return false;
    }
    return true;
  });
}