// Tutorial-relevant app events. Components dispatch these on window;
// TutorialRoot listens. Decoupled so the rest of the app never imports
// the tutorial system.
export type TutorialEvent =
  | 'tutorial:library-opened'
  | 'tutorial:library-closed'
  | 'tutorial:archive-opened'
  | 'tutorial:task-created'
  | 'tutorial:task-completed';

export function emitTutorial(name: TutorialEvent, detail?: unknown) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}