import { useEffect, useRef } from 'react';
import { useLibraryStore } from '@/store/libraryStore';
import { useBillingStore } from '@/store/billingStore';
import { useBillingPromptStore } from '@/store/billingPromptStore';
import { findBillableAncestor } from '@/lib/billingInheritance';

/**
 * Watches the library categories. Whenever a NEW category is created whose
 * ancestor (transitively) is billable, enqueue a prompt asking the user to
 * confirm the rate (flat vs hourly) for the new subtag.
 *
 * Mounted once at the app root.
 */
export function useBillingSubtagWatcher() {
  const knownTagsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    // Seed with whatever exists right now so we don't fire prompts for
    // pre-existing tags on first mount.
    knownTagsRef.current = new Set(
      useLibraryStore.getState().categories.map(c => c.value),
    );

    const unsub = useLibraryStore.subscribe((state) => {
      const known = knownTagsRef.current!;
      const settings = useBillingStore.getState().settings;
      // Don't fire while billing settings haven't loaded yet (avoid false neg)
      if (!useBillingStore.getState().loaded) {
        // Still update known set so we don't prompt retroactively after load
        for (const cat of state.categories) known.add(cat.value);
        return;
      }
      for (const cat of state.categories) {
        if (known.has(cat.value)) continue;
        known.add(cat.value);
        if (cat.archived) continue;
        // Only subtags
        if (!cat.value.includes('/')) continue;
        // Skip if this tag already has explicit settings
        if (settings.some(s => s.tagValue === cat.value)) continue;
        const anc = findBillableAncestor(cat.value, settings);
        if (!anc) continue;
        useBillingPromptStore.getState().enqueue({
          tagValue: cat.value,
          tagLabel: cat.label,
          parentTagValue: anc.tagValue,
          parentRateType: anc.rateType,
          parentHourlyRate: anc.hourlyRate,
          parentCurrency: anc.currency || 'USD',
        });
      }
      // Also remove deleted ones so re-add re-prompts
      for (const v of Array.from(known)) {
        if (!state.categories.some(c => c.value === v)) known.delete(v);
      }
    });
    return unsub;
  }, []);
}