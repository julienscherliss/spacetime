/**
 * Task clustering utilities for density-based rendering.
 * Detects when tasks are too dense to render individually and groups them.
 */

import { timeToMinutes } from '@/hooks/useCurrentTime';

export interface ClusterableTask {
  id: string;
  time?: string;
  duration?: number;
  title: string;
  [key: string]: any;
}

export interface TaskCluster {
  type: 'single' | 'condensed';
  tasks: ClusterableTask[];
  startMin: number;
  endMin: number;
}

const MIN_READABLE_PX = 22; // minimum height for a task to be readable — lowered to break apart earlier
const CLUSTER_PROXIMITY_PX = 2; // if gap between tasks is less than this in px, cluster them

/**
 * Given a list of timed tasks and the current hourHeight,
 * produce an array of clusters — either single tasks or condensed groups.
 *
 * Clustering is purely visual: tasks cluster when they would be
 * unreadable at the current zoom level (too small or too close together).
 * At sufficient zoom, all tasks render individually.
 */
export function clusterTasks(
  tasks: ClusterableTask[],
  hourHeight: number
): TaskCluster[] {
  const timed = tasks
    .filter(t => t.time)
    .map(t => ({
      task: t,
      startMin: timeToMinutes(t.time!),
      endMin: timeToMinutes(t.time!) + (t.duration || 30),
      heightPx: ((t.duration || 30) / 60) * hourHeight,
    }))
    .sort((a, b) => a.startMin - b.startMin);

  if (timed.length === 0) return [];

  const clusters: TaskCluster[] = [];
  let currentGroup: typeof timed = [timed[0]];

  for (let i = 1; i < timed.length; i++) {
    const prev = currentGroup[currentGroup.length - 1];
    const curr = timed[i];

    // Visual gap: how much pixel space exists between the end of prev and start of curr
    const gapMin = curr.startMin - prev.endMin;
    const gapPx = (gapMin / 60) * hourHeight;

    // Only cluster based on VISUAL density, not time overlap
    // Two conditions to cluster:
    // 1. Both tasks are too short to read AND they're close together
    // 2. Gap between them is negative or near-zero in pixels
    const prevTooSmall = prev.heightPx < MIN_READABLE_PX;
    const currTooSmall = curr.heightPx < MIN_READABLE_PX;
    const tooClose = gapPx < CLUSTER_PROXIMITY_PX;

    const shouldCluster =
      (prevTooSmall && currTooSmall && tooClose) || // both tiny and close
      (tooClose && (prevTooSmall || currTooSmall));  // one tiny and touching

    if (shouldCluster) {
      currentGroup.push(curr);
    } else {
      clusters.push(buildCluster(currentGroup));
      currentGroup = [curr];
    }
  }
  clusters.push(buildCluster(currentGroup));

  return clusters;
}

function buildCluster(group: Array<{ task: ClusterableTask; startMin: number; endMin: number; heightPx: number }>): TaskCluster {
  // Single task always renders as single
  if (group.length === 1) {
    return {
      type: 'single',
      tasks: [group[0].task],
      startMin: group[0].startMin,
      endMin: group[0].endMin,
    };
  }

  // Multiple tasks
  const startMin = Math.min(...group.map(g => g.startMin));
  const endMin = Math.max(...group.map(g => g.endMin));

  return {
    type: 'condensed',
    tasks: group.map(g => g.task),
    startMin,
    endMin,
  };
}

/**
 * Calculate the ideal zoom level to make all tasks in a cluster readable.
 * Returns the hourHeight needed.
 */
export function getZoomForCluster(
  cluster: TaskCluster,
  viewportHeight: number,
  minTaskHeight: number = 40
): number {
  const totalMinutes = cluster.endMin - cluster.startMin;
  if (totalMinutes <= 0) return 120;

  // Ensure each task has at least minTaskHeight pixels
  const shortestDuration = Math.min(...cluster.tasks.map(t => t.duration || 30));
  const hourHeightFromMinTask = (minTaskHeight / shortestDuration) * 60;

  // Also ensure cluster fits in viewport
  const targetHeight = viewportHeight * 0.75;
  const hourHeightFromViewport = (targetHeight / totalMinutes) * 60;

  return Math.min(
    Math.max(hourHeightFromViewport, hourHeightFromMinTask),
    120 // SCALE_MAX
  );
}
