import { useMemo } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useBillingStore, type TagBillingSettings } from '@/store/billingStore';
import { parseISO, isWithinInterval } from 'date-fns';

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
  /** Status: 'unbilled' if unbilled > 0, else last invoice status, else 'unbilled' */
  status: 'unbilled' | 'invoiced' | 'paid';
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

  return useMemo(() => {
    const billable = settings.filter(s => s.billable);
    return billable.map(s => {
      const label = categories.find(c => c.value === s.tagValue)?.label || s.tagValue;
      const completedMinutes = minutesByTag.get(s.tagValue) || 0;
      const invoicedMinutes = invoices
        .flatMap(inv => inv.items)
        .filter(it => it.tagValue === s.tagValue)
        .reduce((sum, it) => sum + it.hours * 60, 0);
      const unbilledMinutes = Math.max(0, completedMinutes - invoicedMinutes);
      const unbilledHours = unbilledMinutes / 60;
      const unbilledAmount =
        s.rateType === 'hourly'
          ? unbilledHours * s.hourlyRate
          : unbilledMinutes > 0 ? s.flatRate : 0;

      // Status: most recent invoice for this tag determines status if no unbilled time
      let status: 'unbilled' | 'invoiced' | 'paid' = 'unbilled';
      if (unbilledMinutes <= 0) {
        const tagInvoices = invoices
          .filter(inv => inv.items.some(it => it.tagValue === s.tagValue))
          .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
        if (tagInvoices.length > 0) status = tagInvoices[0].status;
      }

      return {
        tagValue: s.tagValue,
        label,
        settings: s,
        completedMinutes,
        invoicedMinutes,
        unbilledMinutes,
        unbilledAmount,
        status,
      };
    }).sort((a, b) => b.unbilledAmount - a.unbilledAmount);
  }, [settings, invoices, categories, minutesByTag]);
}