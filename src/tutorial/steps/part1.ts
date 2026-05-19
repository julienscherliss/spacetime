import type { TutorialEvent } from '../events';

export interface TutorialStep {
  id: string;
  /** data-tutorial attribute value, or null for a centered modal */
  anchor: string | null;
  /** Additional anchor to exclude from the dim mask (no highlight ring). */
  dimExclude?: string;
  title?: string;
  body: string;
  /** Optional secondary tooltip body, shown sequentially after Continue */
  body2?: string;
  body3?: string;
  /** Label for the continue button (default "Continue"). null = no button. */
  cta?: string | null;
  /** If set, advance automatically when this event fires. */
  awaitEvent?: TutorialEvent;
  /** Optional checklist labels (purely visual) for guided creation. */
  checklist?: string[];
}

export const part1Steps: TutorialStep[] = [
  {
    id: 'welcome',
    anchor: null,
    title: 'Welcome to Spacetime',
    body:
      'Spacetime helps you organize your life across time. Add tasks to your Library, give them a due date, and let the system quietly surface what matters.',
    cta: 'Continue',
  },
  {
    id: 'library-intro',
    anchor: 'library-button',
    body: 'Your Library is where tasks live before they need attention.',
    body2:
      'Every task gets a due date so Spacetime can understand where it exists in time.',
    cta: 'Open Library',
    awaitEvent: 'tutorial:library-opened',
  },
  {
    id: 'create-tasks',
    anchor: 'library-add',
    dimExclude: 'library-panel',
    title: 'Add three real tasks',
    body: '',
    checklist: ['Today', 'This week', 'This year'],
    cta: null,
  },
  {
    id: 'urgency',
    anchor: 'library-list',
    dimExclude: 'library-panel',
    body:
      'As tasks approach their due date, they become more visually emphasized.',
    body2: 'Spacetime quietly surfaces what deserves your attention.',
    cta: 'Continue',
  },
  {
    id: 'completion',
    anchor: 'library-list',
    dimExclude: 'library-panel',
    body:
      'When a task is finished, mark it complete. Spacetime will remember it for you.',
    cta: null,
    awaitEvent: 'tutorial:task-completed',
  },
  {
    id: 'archive',
    anchor: 'archive-trigger',
    body: 'Completed tasks are not deleted forever.',
    body2:
      'They move into the Archive, where they can always be revisited or restored later.',
    body3: 'Your history stays with you.',
    cta: 'Open Archive',
    awaitEvent: 'tutorial:archive-opened',
  },
  {
    id: 'done',
    anchor: null,
    title: "You're ready to start using Spacetime",
    body:
      'Add tasks when they enter your life. Let time determine what deserves attention.',
    cta: 'Finish',
  },
];