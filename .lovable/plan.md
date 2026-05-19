# Spacetime Guided Tutorial — Part 1: The Library

Replace the standalone `InteractiveTutorial` demo with a contextual coach-mark system that drives users through the **real** app UI, listens to real state, and persists progress.

## Scope of this plan

Part 1 only — Library, due dates, urgency, completion, Archive. Scheduling is intentionally deferred to a future Part 2. The architecture is built to support additional parts later without rework.

## Architecture

A small reusable tutorial engine, then a Part-1 script that uses it.

```text
src/tutorial/
  tutorialStore.ts        zustand store: currentPart, currentStep, completedSteps,
                          dismissed, skipped, advance(), skip(), reset()
  useTutorialAnchor.ts    hook: registerAnchor(id, ref) -> measured DOMRect (resize/scroll aware)
  TutorialOverlay.tsx     full-screen SVG mask that dims everything except the anchor rect,
                          renders a tooltip card anchored to it, handles "Continue"/"Skip"
  TutorialRoot.tsx        mounted once in App; reads tutorialStore + current step config,
                          renders TutorialOverlay, wires event listeners that auto-advance
  steps/part1.ts          ordered step definitions for Part 1 (see below)
  events.ts               typed event bus: tutorial:library-opened, task-created,
                          task-completed, archive-opened
```

Anchor registration: components that need to be highlightable expose a `data-tutorial="library-button"` attribute (or call `useTutorialAnchor("library-button", ref)`). The overlay queries by data attribute, so no component needs to import the tutorial.

Persistence: `tutorialStore` persists to localStorage immediately, and (best-effort) mirrors `tutorial_state` JSON to `profiles` via a new `tutorial_state jsonb` column so progress follows the user across devices.

## Part 1 step script

| # | Step | Anchor | Advance condition |
|---|------|--------|-------------------|
| 1 | Welcome modal — "Welcome to Spacetime" | centered | Continue |
| 2 | Highlight Library button + 2-tooltip sequence | `data-tutorial="library-button"` | user opens Library |
| 3 | Guided creation — "Add 3 tasks: today / this week / this year" | `data-tutorial="library-add"` | 3 library items exist spanning ≥2 of the 3 horizons (today, ≤7d, >30d). Live checklist in tooltip. |
| 4 | Urgency explanation — spotlight one of the user's real new items, point at its urgency styling | dynamic anchor to a real library row | Continue |
| 5 | Completion — point at the real complete checkbox on a row | `data-tutorial="library-complete"` on first row | one library item completed |
| 6 | Archive — highlight Archive nav entry, 3 sequential tooltips | `data-tutorial="archive-button"` | user opens Archive |
| 7 | Completion overlay — "You're ready" + Finish / Continue to Part 2 (disabled placeholder) | centered | Finish |

## Smart adaptive behavior

On tutorial start, inspect current state and pre-mark steps complete:
- `libraryStore.items.length >= 3` with mixed horizons → skip step 3
- any completed library item → skip step 5
- localStorage flag `archive-visited` (set by `ArchivePanel` open) → shorten step 6 to single tooltip

Dismissing a tooltip pauses (does not erase) progress. Re-opens from Help panel resume at `currentStep`.

## Integration points (files touched)

- `src/pages/Index.tsx` — remove `InteractiveTutorial` mount, add `<TutorialRoot />`; bootstrap tutorial on first login if `tutorial_state.part1.completed` is false
- `src/components/AppNav.tsx` — add `data-tutorial` attrs to Library + Archive triggers
- `src/components/LibraryPanel.tsx` — add `data-tutorial` attrs to add-task input and to first row's complete checkbox
- `src/store/libraryStore.ts` — emit `tutorial:task-created` / `task-completed` events (or rely on subscribing to store changes in `TutorialRoot`)
- `src/components/ArchivePanel.tsx` — set `archive-visited` flag on open, emit event
- `src/components/HelpPanel.tsx` — "Replay tutorial" button calls `tutorialStore.reset()` instead of opening old modal
- `src/components/InteractiveTutorial.tsx` — deleted

## Database

New migration adds `tutorial_state jsonb not null default '{}'::jsonb` to `profiles`. `useDataSync` (or a small new hook) hydrates the store on login and writes back on changes. Already covered by existing profile RLS.

## Motion / styling

- Overlay: full-screen `<svg>` with a single `<mask>` cutout (rounded 8px) over the anchor; backdrop `hsl(var(--background) / 0.72)` with `backdrop-blur-sm`.
- Tooltip: surface token card, `font-mono` body, Space Grotesk heading, 320px max width, 12px padding, hairline border, no shadow stack.
- All transitions: `framer-motion`, 240ms, `[0.22, 1, 0.36, 1]`. No bounce, no scale > 1.02. Spotlight rect tweens between anchors.
- Respects existing light-industrial tokens — no new colors.

## Out of scope (saved for Part 2)

Scheduling tutorial, drag onto timeline, priority escalation explanation, recurring tasks, calendar view tour. Engine supports them by adding a `steps/part2.ts` file and a new trigger.
