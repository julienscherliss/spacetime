// Tip engine for Elite Mode Task Reflection.
// Each reason has 3 levels of depth. The level shown escalates with how
// many times the user has historically picked that reason. Within a level,
// we rotate to avoid repeating recent tips.

export type ReflectionReason =
  | 'too_ambitious'
  | 'avoiding'
  | 'more_important'
  | 'timing_off'
  | 'low_energy'
  | 'other';

export const REASON_LABELS: Record<ReflectionReason, string> = {
  too_ambitious: 'Too ambitious',
  avoiding: 'Avoiding this',
  more_important: 'Something more important',
  timing_off: 'Timing feels off',
  low_energy: 'Low energy',
  other: 'Other…',
};

type TipPool = { 1: string[]; 2: string[]; 3: string[] };

const TIPS: Record<Exclude<ReflectionReason, 'other'>, TipPool> = {
  too_ambitious: {
    1: [
      'Often it helps to break ambitious tasks into smaller pieces.',
      'Try reducing this to the smallest meaningful version.',
      'A shorter first block may make this easier to keep.',
    ],
    2: [
      'You\u2019ve marked tasks as too ambitious a few times.',
      'This may be a sign that your planned blocks are too large.',
      'Repeated resizing can mean the task needs a smaller starting scope.',
    ],
    3: [
      'Tasks that repeatedly expand often work better as a sequence of smaller blocks.',
      'Consider planning the first step rather than the full outcome.',
      'If this keeps happening, the task may need to be redefined before scheduling.',
    ],
  },
  avoiding: {
    1: [
      'Try shrinking the first step so it\u2019s easier to begin.',
      'A 5-minute version may reduce resistance.',
      'Making the start easier often helps more than pushing it later.',
    ],
    2: [
      'You\u2019ve marked this pattern as avoidance more than once.',
      'Repeated shifting may mean the task feels heavier than it looks.',
      'Avoidance often points to friction at the starting point.',
    ],
    3: [
      'Consider rewriting this task in a way that feels easier to enter.',
      'A task that keeps moving may need a lower activation energy.',
      'If resistance keeps showing up, focus on making the first action obvious.',
    ],
  },
  more_important: {
    1: [
      'Consider reprioritizing instead of repeatedly pushing this.',
      'If this keeps yielding, it may not be in the right place.',
      'Try deciding explicitly whether this still belongs today.',
    ],
    2: [
      'This reason has come up multiple times.',
      'Repeated deprioritizing may be a signal, not a one-off.',
      'If higher-priority tasks keep replacing this, the plan may need rebalancing.',
    ],
    3: [
      'A task that keeps getting displaced may need a different day or role.',
      'It may help to separate true priority shifts from reactive interruptions.',
      'If this repeatedly loses its place, reconsider whether it should be scheduled differently.',
    ],
  },
  timing_off: {
    1: [
      'Try moving this to a time that better matches your day.',
      'Some tasks work better in a different energy window.',
      'It may help to match this task to when you naturally do it best.',
    ],
    2: [
      'You\u2019ve pointed to timing more than once.',
      'This may be less about discipline and more about fit.',
      'Repeated timing shifts can be a sign of a poor time-slot match.',
    ],
    3: [
      'Consider whether this task belongs in a different part of the day entirely.',
      'Repeated retiming may mean the schedule should adapt to your rhythm.',
      'A task that consistently resists its slot may need a new default placement.',
    ],
  },
  low_energy: {
    1: [
      'A lighter version of this task may fit your current energy better.',
      'Try scaling the task to match how you feel right now.',
      'Lower-energy moments often call for a smaller version, not abandonment.',
    ],
    2: [
      'Low energy has come up a few times.',
      'This may be a useful pattern to notice, not just a temporary issue.',
      'Repeated downsizing can be a clue about when this task fits best.',
    ],
    3: [
      'Consider building a lower-energy version of this task into your plan.',
      'Tasks that often meet low energy may need a gentler default shape.',
      'You may benefit from planning alternate versions of this task for different energy states.',
    ],
  },
};

// Generic encouragement for custom "other" reasons.
const OTHER_TIPS: string[] = [
  'Noted. Patterns become clearer when you keep naming what\u2019s happening.',
  'Naming the reason is half the work \u2014 nice catch.',
  'Tracking this kind of nuance is how the schedule learns your shape.',
];

export function levelForCount(count: number): 1 | 2 | 3 {
  if (count >= 6) return 3;
  if (count >= 3) return 2;
  return 1;
}

/**
 * Pick a tip for a reason given the user's selection history.
 * @param reason  the picked reason
 * @param totalUses how many times this reason has been picked historically (including this one)
 * @param recentTips short list of recently-shown tip strings (any reason)
 */
export function pickTip(
  reason: ReflectionReason,
  totalUses: number,
  recentTips: string[],
): string {
  if (reason === 'other') {
    const fresh = OTHER_TIPS.filter((t) => !recentTips.includes(t));
    return (fresh.length ? fresh : OTHER_TIPS)[Math.floor(Math.random() * (fresh.length || OTHER_TIPS.length))];
  }
  const level = levelForCount(totalUses);
  const pool = TIPS[reason][level];
  const fresh = pool.filter((t) => !recentTips.includes(t));
  const choices = fresh.length ? fresh : pool;
  return choices[Math.floor(Math.random() * choices.length)];
}
