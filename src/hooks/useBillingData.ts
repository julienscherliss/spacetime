import { useMemo } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useBillingStore, type TagBillingSettings } from '@/store/billingStore';
import { parseISO, isWithinInterval, subDays } from 'date-fns';
import { findBillableAncestor } from '@/lib/billingInheritance';

export interface BillableTagRow {
  tagValue: string;
  label: string;
  settings: TagBillingSettings;
  /** Total completed minutes across all time (or in date range if applied) */
  completedMinutes: number;
  /** Already-invoiced minutes for this tag (across all invoices ever) */
  invoicedMinutes: number;
  /** Unbilled minutes = completed - invoiced (clamped >= 0) */
  unbilledMinutes: number;
  /** Calculated unbilled amount based on rateType */
  unbilledAmount: number;
  /** Status: 'active' if hours logged in past 7 days, else 'unbilled' if unbilled > 0, else last invoice status. */
  status: 'active' | 'unbilled' | 'invoiced' | 'paid';
}

/**
 * Compute completed time (minutes) per tag, optionally narrowed by [start, end].
 * Includes subtags rolled up into parent.
 */
export function useCompletedMinutesByTag(start?: Date, end?: Date): Map<string, number> {
  const tasks = useTaskStore(s => s.tasks);
  return useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      if (t.archiveReason === 'deleted') continue;
      if (!t.completed) continue;
      const cat = t.category || '';
      if (!cat) continue;
      if (start && end) {
        const d = parseISO(t.date);
        if (!isWithinInterval(d, { start, end })) continue;
      }
      const mins = t.duration || 30;
      // Add to direct tag
      map.set(cat, (map.get(cat) || 0) + mins);
      // Roll up to ancestors
      const parts = cat.split('/');
      for (let i = 1; i < parts.length; i++) {
        const ancestor = parts.slice(0, i).join('/');
        map.set(ancestor, (map.get(ancestor) || 0) + mins);
      }
    }
    return map;
  }, [tasks, start, end]);
}

export function useBillableTagRows(start?: Date, end?: Date): BillableTagRow[] {
  const settings = useBillingStore(s => s.settings);
  const invoices = useBillingStore(s => s.invoices);
  const categories = useLibraryStore(s => s.categories);
  const minutesByTag = useCompletedMinutesByTag(start, end);
  const tasks = useTaskStore(s => s.tasks);

  // Minutes attributed to the NEAREST billable anchor only — so a parent
  // billable tag does NOT double-count minutes that actually belong to a
  // billable subtag beneath it. Only counts anchors that are themselves
  // billable (parentOnly anchors are ignored as accumulators).
  const minutesByAnchor = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      if (t.archiveReason === 'deleted') continue;
      if (!t.completed) continue;
      const cat = t.category || '';
      if (!cat) continue;
      if (start && end) {
        const d = parseISO(t.date);
        if (!isWithinInterval(d, { start, end })) continue;
      }
      const anchor = findBillableAncestor(cat, settings);
      if (!anchor || !anchor.billable) continue;
      const mins = t.duration || 30;
      map.set(anchor.tagValue, (map.get(anchor.tagValue) || 0) + mins);
    }
    return map;
  }, [tasks, settings, start, end]);

  // Tags with completed time in the last 7 days (rolled up to ancestors).
  const recentlyActiveTags = useMemo(() => {
    const cutoff = subDays(new Date(), 7);
    const set = new Set<string>();
    for (const t of tasks) {
      if (t.archiveReason === 'deleted') continue;
      if (!t.completed) continue;
      const cat = t.category || '';
      if (!cat) continue;
      const d = parseISO(t.date);
      if (d < cutoff) continue;
      set.add(cat);
      const parts = cat.split('/');
      for (let i = 1; i < parts.length; i++) {
        set.add(parts.slice(0, i).join('/'));
      }
    }
    return set;
  }, [tasks]);

  return useMemo(() => {
    // Build the union: tags with explicit settings + any category that
    // inherits billable status from a billable ancestor.
    const settingsByTag = new Map(settings.map(s => [s.tagValue, s]));
    const archivedTagValues = new Set(
      categories.filter(c => c.archived).map(c => c.value)
    );
    const billableTagValues = new Set<string>();

    // Direct billable settings (skip archived tags)
    for (const s of settings) {
      if (!s.billable) continue;
      if (archivedTagValues.has(s.tagValue)) continue;
      billableTagValues.add(s.tagValue);
    }

    // Inherited: any category whose ancestor is billable
    for (const cat of categories) {
      if (cat.archived) continue;
      const anc = findBillableAncestor(cat.value, settings);
      if (anc) billableTagValues.add(cat.value);
    }

    const rows: BillableTagRow[] = [];
    for (const tagValue of billableTagValues) {
      // Effective settings: direct settings if present, else inherited from ancestor
      const direct = settingsByTag.get(tagValue);
      const inherited = !direct?.billable
        ? findBillableAncestor(tagValue, settings)
        : undefined;
      const eff: TagBillingSettings = direct?.billable
        ? direct
        : (direct
            ? { ...direct, billable: true, rateType: inherited!.rateType, hourlyRate: direct.hourlyRate || inherited!.hourlyRate, flatRate: direct.flatRate || inherited!.flatRate, flatItems: direct.flatItems.length ? direct.flatItems : inherited!.flatItems, currency: direct.currency || inherited!.currency, clientId: direct.clientId ?? inherited!.clientId, clientName: direct.clientName || inherited!.clientName }
            : { ...inherited!, id: `inherited-${tagValue}`, tagValue });

      const label = categories.find(c => c.value === tagValue)?.label || tagValue;
      // For inherited (no direct settings), only count THIS leaf tag's own minutes
      // (the parent row will roll up parent+all descendants via existing logic).
      // To avoid double counting, only count direct minutes for inherited rows.
      const completedMinutes = direct?.billable
        ? (minutesByAnchor.get(tagValue) || 0)
        : 0; // Inherited rows are informational; their time is already in the parent's roll-up
      const invoicedMinutes = invoices
        .flatMap(inv => inv.items)
        .filter(it => it.tagValue === tagValue)
        .reduce((sum, it) => sum + it.hours * 60, 0);
      const unbilledMinutes = Math.max(0, completedMinutes - invoicedMinutes);
      const unbilledHours = unbilledMinutes / 60;
      const unbilledAmount =
        eff.rateType === 'hourly'
          ? unbilledHours * eff.hourlyRate
          : invoicedMinutes > 0 ? 0 : eff.flatRate;

      let status: 'active' | 'unbilled' | 'invoiced' | 'paid' = 'unbilled';
      if (unbilledMinutes <= 0) {
        const tagInvoices = invoices
          .filter(inv => inv.items.some(it => it.tagValue === tagValue))
          .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
        if (tagInvoices.length > 0) status = tagInvoices[0].status;
      }
      if (recentlyActiveTags.has(tagValue)) status = 'active';

      rows.push({
        tagValue,
        label,
        settings: eff,
        completedMinutes,
        invoicedMinutes,
        unbilledMinutes,
        unbilledAmount,
        status,
      });
    }

    // Hide rows that have zero own activity AND no billing history.
    // For direct billable parents: their minutes now exclude billable subtags,
    // so a parent whose time is fully covered by billable children correctly
    // drops out. Flat-rate tags are kept regardless so the flat fee remains
    // visible until invoiced.
    const filtered = rows.filter(r => {
      if (r.settings.rateType === 'flat') return true;
      return r.completedMinutes > 0 || r.invoicedMinutes > 0;
    });

    return filtered.sort((a, b) => b.unbilledAmount - a.unbilledAmount);
  }, [settings, invoices, categories, minutesByAnchor, recentlyActiveTags]);
}