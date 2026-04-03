import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type LibraryCategory = string;

export interface CategoryDef {
  value: string;
  label: string;
}

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { value: 'uncategorized', label: 'Uncategorized' },
  { value: 'personal', label: 'Personal' },
  { value: 'work', label: 'Work' },
  { value: 'admin', label: 'Admin' },
  { value: 'errands', label: 'Errands' },
  { value: 'ideas', label: 'Ideas' },
];

// Keep backward compat
export const LIBRARY_CATEGORIES = DEFAULT_CATEGORIES;

export interface LibraryTask {
  id: string;
  title: string;
  note: string;
  category: LibraryCategory;
  defaultDuration: number;
  createdAt: string;
}

type SortMode = 'recent' | 'alpha' | 'category';
type FilterCategory = string | 'all';

interface LibraryState {
  items: LibraryTask[];
  categories: CategoryDef[];
  panelOpen: boolean;
  sortMode: SortMode;
  filterCategory: FilterCategory;

  setPanelOpen: (open: boolean) => void;
  setSortMode: (mode: SortMode) => void;
  setFilterCategory: (cat: FilterCategory) => void;
  addItem: (title: string, category?: LibraryCategory) => void;
  updateItem: (id: string, updates: Partial<Pick<LibraryTask, 'title' | 'note' | 'category' | 'defaultDuration'>>) => void;
  deleteItem: (id: string) => void;
  removeItem: (id: string) => void;
  addFromSchedule: (title: string, duration?: number) => void;
  getFilteredItems: () => LibraryTask[];
  addCategory: (name: string) => void;
  removeCategory: (value: string) => void;
  renameCategory: (value: string, newLabel: string) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 10);

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      items: [],
      categories: [...DEFAULT_CATEGORIES],
      panelOpen: false,
      sortMode: 'recent',
      filterCategory: 'all',

      setPanelOpen: (open) => set({ panelOpen: open }),
      setSortMode: (mode) => set({ sortMode: mode }),
      setFilterCategory: (cat) => set({ filterCategory: cat }),

      addItem: (title, category = 'uncategorized') => {
        set((s) => ({
          items: [
            {
              id: generateId(),
              title,
              note: '',
              category,
              defaultDuration: 30,
              createdAt: new Date().toISOString(),
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
              category: 'uncategorized',
              defaultDuration: duration,
              createdAt: new Date().toISOString(),
            },
            ...s.items,
          ],
        }));
      },

      getFilteredItems: () => {
        const { items, sortMode, filterCategory } = get();
        let filtered = filterCategory === 'all'
          ? items
          : items.filter((i) => i.category === filterCategory);

        switch (sortMode) {
          case 'alpha':
            filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
            break;
          case 'category':
            filtered = [...filtered].sort((a, b) => a.category.localeCompare(b.category));
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
          items: s.items.map(i => i.category === value ? { ...i, category: 'uncategorized' } : i),
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
      // Migrate old data that doesn't have categories
      merge: (persisted: any, current: any) => {
        const merged = { ...current, ...persisted };
        if (!merged.categories || merged.categories.length === 0) {
          merged.categories = [...DEFAULT_CATEGORIES];
        }
        return merged;
      },
    }
  )
);
