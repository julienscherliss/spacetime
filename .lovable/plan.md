## Goal

1. Make **schedule (timeline) view** the default for **Day view** on both desktop and mobile.
2. Make **schedule view** the default for **Week view** on desktop only; keep **list view** the default for Week on mobile / iOS.
3. In Day view, when the selected day has 0 tasks **and** the user has no scheduled tasks anywhere in the past 7 days, show a centered helper prompt explaining how to create a task (click-and-drag on desktop, press-and-drag on mobile) instead of the current small `NO TASKS` label.

## Changes

### 1. `src/pages/Index.tsx` — entry-effect that forces sub-modes
Currently this effect always coerces both sub-modes to `'list'` on app entry:
```
if (s.daySubMode !== 'list') s.setDaySubMode('list');
if (s.weekSubMode !== 'list') s.setWeekSubMode('list');
```
Replace with platform-aware defaults using `useIsMobile()` (or a one-shot `window.innerWidth < 768` check at the top of the effect, since this only runs once on mount):
- Day → always `'timeline'`.
- Week → `'timeline'` on desktop, `'list'` on mobile.

The user can still toggle to list/timeline manually via `AppNav`; we only set the *initial* mode on each app entry, matching the current "always coerce" behavior.

### 2. `src/store/taskStore.ts` — initial persisted defaults
Update the persisted defaults so first-time users (and reloads before the entry effect runs) get the right view:
- `daySubMode: 'timeline'` (was `'list'`).
- `weekSubMode`: leave as `'list'` (mobile-friendly default; desktop is corrected by the entry effect).

### 3. `src/components/DayView.tsx` — empty-state helper
Replace the existing block:
```
{dayTasks.length === 0 && (
  <div className="text-center py-20">
    <p className="...">NO TASKS</p>
  </div>
)}
```
with a smarter empty state. Compute once per render:
- `hasRecentSchedule = tasks.some(t => t.date && t.date >= sevenDaysAgo && t.date <= today)` (date strings already in `YYYY-MM-DD` lexicographically comparable form, mirroring existing usage in the file).
- `isMobile` is already available via `useIsMobile()`.

Render logic:
- If `dayTasks.length === 0 && !hasRecentSchedule` → show the **centered helper card**: short headline "Your day is empty" + body copy:
  - Desktop: `Click and drag on the timeline to create a new task.`
  - Mobile / iOS: `Press and drag on the timeline to create a new task.`
  - Styled with semantic tokens (`text-muted-foreground`, `font-mono` meta, `font-display` headline) consistent with the existing light-industrial aesthetic. Positioned absolutely over the timeline, vertically centered in the viewport (e.g. `fixed inset-x-0 top-1/2 -translate-y-1/2 pointer-events-none` inside a relatively-positioned wrapper, or absolutely centered within the timeline area). Front-and-center, no background chrome beyond a subtle border/padding.
- If `dayTasks.length === 0 && hasRecentSchedule` → keep the existing small `NO TASKS` label (user already knows the gesture).

No business-logic, store-shape, or routing changes beyond the two lines in the entry effect and the one default value in the store. Week view rendering, AppNav toggles, and all other behaviour are untouched.

## Technical notes

- `useIsMobile()` returns `false` on the very first render (state starts `undefined` → coerced to `false`); the entry effect runs after mount when the value is correct, so platform-aware defaulting works on hydration.
- Helper-text "recent schedule" check looks at `task.date` for any task in `tasks` (already includes generated recurring instances and user-scheduled items). Library / waiting-room items have no `date`, so they correctly don't count.
- Helper text uses semantic tokens only; no hardcoded colors.
