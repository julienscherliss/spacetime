import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type LibraryCategory = 'uncategorized' | 'personal' | 'work' | 'admin' | 'errands' | 'ideas';

export const LIBRARY_CATEGORIES: { value: LibraryCategory; label: string }[] = [
  { value: 'uncategorized', label: 'Uncategorized' },
  { value: 'personal', label: 'Personal' },
  { value: 'work', label: 'Work' },
  { value: 'admin', label: 'Admin' },
  { value: 'errands', label: 'Errands' },
  { value: 'ideas', label: 'Ideas' },
];

export interface LibraryTask {
  id: string;
  title: string;
  note: string;
  category: LibraryCategory;
  defaultDuration: number;
  createdAt: string;
}

type SortMode = 'recent' | 'alpha' | 'category';
type FilterCategory = LibraryCategory | 'all';

interface LibraryState {
  items: LibraryTask[];
  panelOpen: boolean;
  sortMode: SortMode;
  filterCategory: FilterCategory;

  setPanelOpen: (open: boolean) => void;
  setSortMode: (mode: SortMode) => void;
  setFilterCategory: (cat: FilterCategory) => void;
  addItem: (title: string, category?: LibraryCategory) => void;
  updateItem: (id: string, updates: Partial<Pick<LibraryTask, 'title' | 'note' | 'category' | 'defaultDuration'>>) => void;
  deleteItem: (id: string) => void;
  removeItem: (id: string) => void; // remove after scheduling
  addFromSchedule: (title: string, duration?: number) => void; // unschedule → library
  getFilteredItems: () => LibraryTask[];
}

const generateId = () => Math.random().toString(36).substring(2, 10);

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      items: [],
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
            // already in order (newest first from addItem)
            break;
        }
        return filtered;
      },
    }),
    { name: 'do-library-store' }
  )
);
