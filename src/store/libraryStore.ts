import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type LibraryCategory = string;

export interface CategoryDef {
  value: string;
  label: string;
  archived?: boolean;
}

export type TaskUrgency = 'none' | 'urgent' | 'important';

export interface LibrarySubtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface LibraryAttachment {
  name: string;
  url: string;
  type: string;
}

export interface LibraryTask {
  id: string;
  title: string;
  note: string;
  category: LibraryCategory;
  defaultDuration: number;
  createdAt: string;
  isUrgent: boolean;
  isImportant: boolean;
  dueDate: string | null;
  subtasks: LibrarySubtask[];
  attachments?: LibraryAttachment[];
  completed?: boolean;
  completedAt?: string | null;
  // Legacy compat
  urgency?: TaskUrgency;
}

type LibraryScheduleSource =
  | string
  | {
      title: string;
      duration?: number;
      category?: LibraryCategory;
      note?: string;
      isUrgent?: boolean;
      isImportant?: boolean;
      dueDate?: string | null;
      subtasks?: LibrarySubtask[];
    };

type SortMode = 'recent' | 'alpha' | 'category' | 'due';
type FilterCategory = string | 'all';

interface FilterState {
  category: FilterCategory;
  urgency: TaskUrgency | 'all';
  hasDueDate: boolean | null; // null = no filter
}

interface LibraryState {
  items: LibraryTask[];
  categories: CategoryDef[];
  panelOpen: boolean;
  sortMode: SortMode;
  filters: FilterState;

  // Legacy compat
  filterCategory: FilterCategory;

  setPanelOpen: (open: boolean) => void;
  setSortMode: (mode: SortMode) => void;
  setFilterCategory: (cat: FilterCategory) => void;
  setFilter: (patch: Partial<FilterState>) => void;
  addItem: (title: string, category?: LibraryCategory, dueDate?: string | null) => void;
  updateItem: (id: string, updates: Partial<Pick<LibraryTask, 'title' | 'note' | 'category' | 'defaultDuration' | 'isUrgent' | 'isImportant' | 'dueDate' | 'subtasks' | 'attachments'>>) => void;
  deleteItem: (id: string) => void;
  completeItem: (id: string) => void;
  uncompleteItem: (id: string) => void;
  removeItem: (id: string) => void;
  addFromSchedule: (source: LibraryScheduleSource, duration?: number) => void;
  getFilteredItems: () => LibraryTask[];
  addCategory: (name: string, customValue?: string) => void;
  removeCategory: (value: string) => void;
  renameCategory: (value: string, newLabel: string) => void;
  reorderCategory: (value: string, direction: 'left' | 'right') => void;
  moveCategory: (fromValue: string, toValue: string) => void;
  reparentTag: (tagValue: string, newParent: string | null) => void;
  archiveCategory: (value: string) => void;
  unarchiveCategory: (value: string) => void;
  repairCategoryDrift: () => void;
}

const generateId = () => crypto.randomUUID();

const normalizeCategoryValue = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '-');

const humanizeCategoryValue = (value: string) => {
  const humanizePart = (part: string) =>
    part.split('-').filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  if (value.includes('/')) {
    const parts = value.split('/');
    return parts.map(humanizePart).join(' / ');
  }
  return humanizePart(value);
};

const mergeCategories = (items: LibraryTask[], categories: CategoryDef[]) => {
  const map = new Map<string, CategoryDef>();

  categories.forEach((category) => {
    const value = normalizeCategoryValue(category.value || '');
    if (!value) return;
    map.set(value, {
      value,
      label: category.label?.trim() || humanizeCategoryValue(value),
      archived: category.archived ?? false,
    });
  });

  items.forEach((item) => {
    const value = normalizeCategoryValue(item.category || '');
    if (!value || map.has(value)) return;
    map.set(value, { value, label: humanizeCategoryValue(value) });
  });

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
};

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      items: [],
      categories: [],
      panelOpen: false,
      sortMode: 'due',
      filterCategory: 'all',
      filters: {
        category: 'all',
        urgency: 'all',
        hasDueDate: null,
      },

      setPanelOpen: (open) => set({ panelOpen: open }),
      setSortMode: (mode) => set({ sortMode: mode }),
      setFilterCategory: (cat) => set((s) => ({
        filterCategory: cat,
        filters: { ...s.filters, category: cat },
      })),
      setFilter: (patch) => set((s) => ({
        filters: { ...s.filters, ...patch },
        filterCategory: patch.category ?? s.filters.category,
      })),

      addItem: (title, category = '', dueDate = null) => {
        set((s) => ({
          items: [
            {
              id: generateId(),
              title,
              note: '',
              category: normalizeCategoryValue(category),
              defaultDuration: 30,
              createdAt: new Date().toISOString(),
              isUrgent: false,
              isImportant: false,
              dueDate: dueDate || null,
              subtasks: [],
            },
            ...s.items,
          ],
        }));
      },

      updateItem: (id, updates) =>
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? {
            ...i,
            ...updates,
            category: updates.category !== undefined ? normalizeCategoryValue(updates.category) : i.category,
          } : i)),
          categories: mergeCategories(
            s.items.map((i) => (i.id === id ? {
              ...i,
              ...updates,
              category: updates.category !== undefined ? normalizeCategoryValue(updates.category) : i.category,
            } : i)),
            s.categories
          ),
        })),

      deleteItem: (id) =>
        set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

      completeItem: (id) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, completed: true, completedAt: new Date().toISOString() } : i
          ),
        })),

      uncompleteItem: (id) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, completed: false, completedAt: null } : i
          ),
        })),

      removeItem: (id) =>
        set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

      addFromSchedule: (source, duration = 30) => {
        const payload = typeof source === 'string'
          ? {
              title: source,
              duration,
              category: '',
              note: '',
              isUrgent: false,
              isImportant: false,
              dueDate: null,
              subtasks: [],
            }
          : {
              title: source.title,
              duration: source.duration ?? duration,
              category: normalizeCategoryValue(source.category || ''),
              note: source.note || '',
              isUrgent: source.isUrgent ?? false,
              isImportant: source.isImportant ?? false,
              dueDate: source.dueDate ?? null,
              subtasks: source.subtasks ?? [],
            };

        set((s) => ({
          items: [
            {
              id: generateId(),
              title: payload.title,
              note: payload.note,
              category: payload.category,
              defaultDuration: payload.duration,
              createdAt: new Date().toISOString(),
              isUrgent: payload.isUrgent,
              isImportant: payload.isImportant,
              dueDate: payload.dueDate,
              subtasks: payload.subtasks,
            },
            ...s.items,
          ],
          categories: mergeCategories(
            [
              {
                id: 'new',
                title: payload.title,
                note: payload.note,
                category: payload.category,
                defaultDuration: payload.duration,
                createdAt: new Date().toISOString(),
                isUrgent: payload.isUrgent,
                isImportant: payload.isImportant,
                dueDate: payload.dueDate,
                subtasks: payload.subtasks,
              },
              ...s.items,
            ],
            s.categories
          ),
        }));
      },

      getFilteredItems: () => {
        const { items, sortMode, filters } = get();
        let filtered = items.filter((i) => !i.completed);

        // Category filter
        if (filters.category === 'none') {
          filtered = filtered.filter((i) => !i.category);
        } else if (filters.category !== 'all') {
          // Include subtags: if filtering by "work", also show "work/design"
          filtered = filtered.filter((i) => 
            i.category === filters.category || 
            (i.category && i.category.startsWith(filters.category + '/'))
          );
        }

        // Urgency filter
        if (filters.urgency === 'urgent') {
          filtered = filtered.filter((i) => i.isUrgent);
        } else if (filters.urgency === 'important') {
          filtered = filtered.filter((i) => i.isImportant);
        }

        // Due date filter
        if (filters.hasDueDate === true) {
          filtered = filtered.filter((i) => i.dueDate);
        } else if (filters.hasDueDate === false) {
          filtered = filtered.filter((i) => !i.dueDate);
        }

        switch (sortMode) {
          case 'alpha':
            filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
            break;
          case 'category':
            filtered = [...filtered].sort((a, b) => (a.category || '').localeCompare(b.category || ''));
            break;
          case 'due':
            filtered = [...filtered].sort((a, b) => {
              if (!a.dueDate && !b.dueDate) return 0;
              if (!a.dueDate) return 1;
              if (!b.dueDate) return -1;
              return a.dueDate.localeCompare(b.dueDate);
            });
            break;
          case 'recent':
          default:
            break;
        }
        return filtered;
      },

      addCategory: (name, customValue) => {
        const trimmed = name.trim();
        const value = customValue || normalizeCategoryValue(trimmed);
        set((s) => {
          if (!value || s.categories.some(c => c.value === value)) return s;
          return { categories: mergeCategories(s.items, [...s.categories, { value, label: trimmed }]) };
        });
      },

      removeCategory: (value) => {
        set((s) => {
          const nextItems = s.items.map(i => i.category === value ? { ...i, category: '' } : i);
          return {
            categories: mergeCategories(nextItems, s.categories.filter(c => c.value !== value)),
            items: nextItems,
          };
        });
      },

      renameCategory: (value, newLabel) => {
        set((s) => {
          const trimmed = newLabel.trim();
          if (!trimmed) return s;
          const cat = s.categories.find(c => c.value === value);
          if (!cat) return s;

          // Compute new value: replace only the leaf slug, keep parent path.
          const segments = value.split('/');
          const newLeafSlug = normalizeCategoryValue(trimmed);
          if (!newLeafSlug) return s;
          segments[segments.length - 1] = newLeafSlug;
          const newValue = segments.join('/');

          // Compute new full label: replace the leaf label segment only.
          const labelParts = cat.label.split(' / ');
          labelParts[labelParts.length - 1] = trimmed;
          const computedNewLabel = labelParts.join(' / ');

          // If value isn't changing, just update the label.
          if (newValue === value) {
            return {
              categories: mergeCategories(
                s.items,
                s.categories.map(c => c.value === value ? { ...c, label: computedNewLabel } : c)
              ),
            };
          }

          // Conflict guard — refuse if new value already exists.
          if (s.categories.some(c => c.value === newValue)) return s;

          // Rename this category + cascade to subtag values + their labels' parent prefix.
          const updatedCats = s.categories.map(c => {
            if (c.value === value) {
              return { ...c, value: newValue, label: computedNewLabel };
            }
            if (c.value.startsWith(value + '/')) {
              const childNewValue = newValue + c.value.slice(value.length);
              const childLabelParts = c.label.split(' / ');
              // Replace the segment at the same depth as the renamed parent.
              const depth = value.split('/').length - 1;
              if (childLabelParts[depth]) {
                childLabelParts[depth] = trimmed;
              }
              return { ...c, value: childNewValue, label: childLabelParts.join(' / ') };
            }
            return c;
          });

          // Update items that reference the old value or its children.
          const updatedItems = s.items.map(i => {
            if (i.category === value) return { ...i, category: newValue };
            if (i.category && i.category.startsWith(value + '/')) {
              return { ...i, category: newValue + i.category.slice(value.length) };
            }
            return i;
          });

          return {
            categories: mergeCategories(updatedItems, updatedCats),
            items: updatedItems,
          };
        });

        // Also cascade-rename in the task store (scheduled tasks).
        try {
          const cat = useLibraryStore.getState().categories.find(c => c.value === value);
          // After the set above, the old `value` no longer exists; recompute newValue here.
          const segments = value.split('/');
          const newLeafSlug = normalizeCategoryValue(newLabel.trim());
          if (!newLeafSlug) return;
          segments[segments.length - 1] = newLeafSlug;
          const newValue = segments.join('/');
          if (newValue === value) return;

          import('@/store/taskStore').then(({ useTaskStore }) => {
            useTaskStore.setState(ts => ({
              tasks: ts.tasks.map(t => {
                if (t.category === value) return { ...t, category: newValue };
                if (t.category && t.category.startsWith(value + '/')) {
                  return { ...t, category: newValue + t.category.slice(value.length) };
                }
                return t;
              }),
            }));
          });
        } catch (_) {}
      },

      reorderCategory: (value, direction) => {
        set((s) => {
          const cats = [...s.categories];
          const idx = cats.findIndex(c => c.value === value);
          if (idx < 0) return s;
          const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
          if (swapIdx < 0 || swapIdx >= cats.length) return s;
          [cats[idx], cats[swapIdx]] = [cats[swapIdx], cats[idx]];
          return { categories: cats };
        });
      },

      moveCategory: (fromValue, toValue) => {
        set((s) => {
          const cats = [...s.categories];
          const fromIdx = cats.findIndex(c => c.value === fromValue);
          const toIdx = cats.findIndex(c => c.value === toValue);
          if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return s;
          const [moved] = cats.splice(fromIdx, 1);
          cats.splice(toIdx, 0, moved);
          return { categories: cats };
        });
      },

      reparentTag: (tagValue, newParent) => {
        set((s) => {
          const cat = s.categories.find(c => c.value === tagValue);
          if (!cat) return s;

          // Get the leaf segment of the tag
          const segments = tagValue.split('/');
          const leafSegment = segments[segments.length - 1];
          const leafLabel = cat.label.split(' / ').pop() || cat.label;

          // Build new value and label
          const newValue = newParent ? `${newParent}/${leafSegment}` : leafSegment;
          const parentCat = newParent ? s.categories.find(c => c.value === newParent) : null;
          const newLabel = newParent
            ? `${parentCat?.label || humanizeCategoryValue(newParent)} / ${leafLabel}`
            : leafLabel;

          if (newValue === tagValue) return s;

          // Check depth limit (max 4 segments = 3 subtag levels)
          if (newValue.split('/').length > 4) return s;

          // Also reparent any children of this tag
          const updatedCats = s.categories.map(c => {
            if (c.value === tagValue) {
              return { ...c, value: newValue, label: newLabel };
            }
            if (c.value.startsWith(tagValue + '/')) {
              const suffix = c.value.slice(tagValue.length);
              const labelSuffix = c.label.includes(' / ')
                ? c.label.slice(c.label.indexOf(' / ', cat.label.length > 0 ? cat.label.lastIndexOf(' / ') : 0))
                : '';
              const childNewValue = newValue + suffix;
              // Rebuild label from new value
              const childNewLabel = childNewValue.split('/').map(seg =>
                seg.split('-').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
              ).join(' / ');
              return { ...c, value: childNewValue, label: childNewLabel };
            }
            return c;
          });

          // Update items that used the old tag or its children
          const updatedItems = s.items.map(item => {
            if (item.category === tagValue) {
              return { ...item, category: newValue };
            }
            if (item.category && item.category.startsWith(tagValue + '/')) {
              return { ...item, category: newValue + item.category.slice(tagValue.length) };
            }
            return item;
          });

          return {
            categories: mergeCategories(updatedItems, updatedCats),
            items: updatedItems,
          };
        });
      },

      archiveCategory: (value) => {
        set((s) => ({
          categories: s.categories.map(c =>
            c.value === value || c.value.startsWith(value + '/')
              ? { ...c, archived: true }
              : c
          ),
        }));
      },

      unarchiveCategory: (value) => {
        set((s) => ({
          categories: s.categories.map(c => {
            // Unarchive the tag itself + all ancestors so it's reachable in the tree
            if (c.value === value) return { ...c, archived: false };
            if (value.startsWith(c.value + '/')) return { ...c, archived: false };
            return c;
          }),
        }));
      },

      // ── Integrity sweep ──────────────────────────────────────────
      // Detects categories where the leaf slug (in `value`) doesn't match
      // the slugified leaf segment of `label`, and rewrites the value (with
      // cascade to subtags + tasks). This self-heals any drift caused by
      // legacy renames or external data edits.
      repairCategoryDrift: () => {
        const cats = get().categories;
        // Sort by depth ascending so parents get fixed before children.
        const sorted = [...cats].sort(
          (a, b) => a.value.split('/').length - b.value.split('/').length
        );
        for (const cat of sorted) {
          const leafLabel = (cat.label.split(' / ').pop() || '').trim();
          if (!leafLabel) continue;
          const expected = normalizeCategoryValue(leafLabel);
          if (!expected) continue;
          const actualLeaf = cat.value.split('/').pop() || '';
          if (actualLeaf === expected) continue;
          // Skip if a target with that slug already exists at this level.
          const segments = cat.value.split('/');
          segments[segments.length - 1] = expected;
          const targetValue = segments.join('/');
          if (get().categories.some(c => c.value === targetValue)) continue;
          // Reuse renameCategory for the cascade — pass current leaf label.
          get().renameCategory(cat.value, leafLabel);
        }
      },
    }),
    {
      name: 'do-library-store',
      merge: (persisted: any, current: any) => {
        const merged = { ...current, ...persisted };
        // Ensure new fields exist on old items
        if (merged.items) {
          merged.items = merged.items.map((i: any) => ({
            isUrgent: i.isUrgent ?? (i.urgency === 'urgent'),
            isImportant: i.isImportant ?? (i.urgency === 'important'),
            dueDate: i.dueDate ?? null,
            subtasks: i.subtasks ?? [],
            ...i,
            category: i.category === 'uncategorized' ? '' : normalizeCategoryValue(i.category || ''),
          }));
        }
        if (!merged.filters) {
          merged.filters = { category: merged.filterCategory || 'all', urgency: 'all', hasDueDate: null };
        }
        merged.categories = mergeCategories(merged.items || [], merged.categories || []);
        return merged;
      },
    }
  )
);
