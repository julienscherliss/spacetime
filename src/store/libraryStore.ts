import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type LibraryCategory = string;

export interface CategoryDef {
  value: string;
  label: string;
}

export type TaskUrgency = 'none' | 'urgent' | 'important';

export interface LibrarySubtask {
  id: string;
  title: string;
  completed: boolean;
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
  updateItem: (id: string, updates: Partial<Pick<LibraryTask, 'title' | 'note' | 'category' | 'defaultDuration' | 'isUrgent' | 'isImportant' | 'dueDate' | 'subtasks'>>) => void;
  deleteItem: (id: string) => void;
  removeItem: (id: string) => void;
  addFromSchedule: (source: LibraryScheduleSource, duration?: number) => void;
  getFilteredItems: () => LibraryTask[];
  addCategory: (name: string, customValue?: string) => void;
  removeCategory: (value: string) => void;
  renameCategory: (value: string, newLabel: string) => void;
  reorderCategory: (value: string, direction: 'left' | 'right') => void;
  moveCategory: (fromValue: string, toValue: string) => void;
}

const generateId = () => crypto.randomUUID();

const normalizeCategoryValue = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '-');

const humanizeCategoryValue = (value: string) =>
  value
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const mergeCategories = (items: LibraryTask[], categories: CategoryDef[]) => {
  const map = new Map<string, CategoryDef>();

  categories.forEach((category) => {
    const value = normalizeCategoryValue(category.value || '');
    if (!value) return;
    map.set(value, {
      value,
      label: category.label?.trim() || humanizeCategoryValue(value),
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
      sortMode: 'recent',
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
        let filtered = items;

        // Category filter
        if (filters.category === 'none') {
          filtered = filtered.filter((i) => !i.category);
        } else if (filters.category !== 'all') {
          // Include subtags: if filtering by "work", also show "work--polyphia"
          filtered = filtered.filter((i) => 
            i.category === filters.category || 
            (i.category && i.category.startsWith(filters.category + '--'))
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
        set((s) => ({
          categories: mergeCategories(
            s.items,
            s.categories.map(c => c.value === value ? { ...c, label: newLabel.trim() || c.label } : c)
          ),
        }));
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
