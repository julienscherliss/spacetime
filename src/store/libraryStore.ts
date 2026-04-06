import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type LibraryCategory = string;

export interface CategoryDef {
  value: string;
  label: string;
}

// No default categories — users create their own
export const DEFAULT_CATEGORIES: CategoryDef[] = [];

export const LIBRARY_CATEGORIES = DEFAULT_CATEGORIES;

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
  addItem: (title: string, category?: LibraryCategory) => void;
  updateItem: (id: string, updates: Partial<Pick<LibraryTask, 'title' | 'note' | 'category' | 'defaultDuration' | 'urgency' | 'dueDate'>>) => void;
  deleteItem: (id: string) => void;
  removeItem: (id: string) => void;
  addFromSchedule: (title: string, duration?: number) => void;
  getFilteredItems: () => LibraryTask[];
  addCategory: (name: string) => void;
  removeCategory: (value: string) => void;
  renameCategory: (value: string, newLabel: string) => void;
}

const generateId = () => crypto.randomUUID();

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

      addItem: (title, category = '') => {
        set((s) => ({
          items: [
            {
              id: generateId(),
              title,
              note: '',
              category,
              defaultDuration: 30,
              createdAt: new Date().toISOString(),
              urgency: 'none',
              dueDate: null,
            },
            ...s.items,
          ],
        }));
      },

      updateItem: (id, updates) =>
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? { ...i, ...updates } : i)),
        })),

      deleteItem: (id) =>
        set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

      removeItem: (id) =>
        set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

      addFromSchedule: (title, duration = 30) => {
        set((s) => ({
          items: [
            {
              id: generateId(),
              title,
              note: '',
              category: '',
              defaultDuration: duration,
              createdAt: new Date().toISOString(),
              urgency: 'none',
              dueDate: null,
            },
            ...s.items,
          ],
        }));
      },

      getFilteredItems: () => {
        const { items, sortMode, filters } = get();
        let filtered = items;

        // Category filter
        if (filters.category !== 'all') {
          filtered = filtered.filter((i) => i.category === filters.category);
        }

        // Urgency filter
        if (filters.urgency !== 'all') {
          filtered = filtered.filter((i) => (i.urgency || 'none') === filters.urgency);
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

      addCategory: (name) => {
        const value = name.toLowerCase().replace(/\s+/g, '-');
        set((s) => {
          if (s.categories.some(c => c.value === value)) return s;
          return { categories: [...s.categories, { value, label: name }] };
        });
      },

      removeCategory: (value) => {
        set((s) => ({
          categories: s.categories.filter(c => c.value !== value),
          items: s.items.map(i => i.category === value ? { ...i, category: '' } : i),
        }));
      },

      renameCategory: (value, newLabel) => {
        set((s) => ({
          categories: s.categories.map(c => c.value === value ? { ...c, label: newLabel } : c),
        }));
      },
    }),
    {
      name: 'do-library-store',
      merge: (persisted: any, current: any) => {
        const merged = { ...current, ...persisted };
        // Ensure new fields exist on old items
        if (merged.items) {
          merged.items = merged.items.map((i: any) => ({
            urgency: 'none',
            dueDate: null,
            ...i,
            category: i.category === 'uncategorized' ? '' : (i.category || ''),
          }));
        }
        if (!merged.filters) {
          merged.filters = { category: merged.filterCategory || 'all', urgency: 'all', hasDueDate: null };
        }
        if (!merged.categories) merged.categories = [];
        return merged;
      },
    }
  )
);
