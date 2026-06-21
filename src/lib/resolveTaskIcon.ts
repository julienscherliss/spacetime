import type { Task } from '@/store/taskStore';
import type { CategoryDef } from '@/store/libraryStore';
import { getIconByName } from './iconLibrary';
import type { LucideIcon } from 'lucide-react';

/**
 * Resolve the icon for a task using the precedence:
 *   task.icon override → tag's icon → null (caller's fallback).
 */
export function resolveTaskIcon(
  task: Pick<Task, 'icon' | 'category'>,
  categories: ReadonlyArray<CategoryDef>
): LucideIcon | null {
  const direct = getIconByName(task.icon);
  if (direct) return direct;
  if (!task.category) return null;
  const cat = categories.find(c => c.value === task.category);
  return getIconByName(cat?.icon);
}

/** Resolve a tag's icon, walking up parent tags as a fallback. */
export function resolveCategoryIcon(
  categoryValue: string | null | undefined,
  categories: ReadonlyArray<CategoryDef>
): LucideIcon | null {
  if (!categoryValue) return null;
  let value: string | null = categoryValue;
  while (value) {
    const cat = categories.find(c => c.value === value);
    const icon = getIconByName(cat?.icon);
    if (icon) return icon;
    const slash = value.lastIndexOf('/');
    value = slash > 0 ? value.slice(0, slash) : null;
  }
  return null;
}
